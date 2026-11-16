"""Klien WebHDFS minimalis (REST API NameNode, port 9870).

Kenapa WebHDFS dan bukan ``hdfs dfs``? Container Airflow tidak membawa
binary Hadoop. WebHDFS cukup memakai HTTP, dan NameNode mengalihkan
(redirect 307) operasi baca/tulis ke DataNode di jaringan Docker yang sama.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import requests

from . import config

log = logging.getLogger(__name__)


class HdfsError(RuntimeError):
    pass


class WebHdfsClient:
    def __init__(
        self,
        base_url: str | None = None,
        user: str | None = None,
        timeout: int = 120,
        max_retries: int = 8,
        retry_wait: float = 15.0,
    ) -> None:
        self.base_url = (base_url or config.WEBHDFS_URL).rstrip("/")
        self.user = user or config.HDFS_USER
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_wait = retry_wait
        self.session = requests.Session()

    # ------------------------------------------------------------------ util
    def _url(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base_url}{path}"

    def _params(self, op: str, **extra: Any) -> dict[str, Any]:
        params = {"op": op, "user.name": self.user}
        params.update({k: v for k, v in extra.items() if v is not None})
        return params

    @staticmethod
    def _raise_for_remote(resp: requests.Response, what: str) -> None:
        if resp.status_code < 400:
            return
        detail = resp.text[:500]
        try:
            remote = resp.json().get("RemoteException", {})
            detail = f"{remote.get('exception')}: {remote.get('message')}"
        except ValueError:
            pass
        raise HdfsError(f"WebHDFS gagal ({what}) HTTP {resp.status_code}: {detail}")

    def _request(self, method: str, url: str, what: str, **kwargs: Any) -> requests.Response:
        """Kirim request dengan retry saat NameNode belum siap / safe mode."""
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.session.request(method, url, timeout=self.timeout, **kwargs)
            except (requests.ConnectionError, requests.Timeout) as exc:
                last_exc = exc
                log.warning("HDFS belum dapat dihubungi (%s), percobaan %s/%s", exc, attempt, self.max_retries)
            else:
                retriable = resp.status_code in (502, 503, 504) or (
                    resp.status_code in (403, 500) and "SafeModeException" in resp.text
                )
                if not retriable:
                    return resp
                last_exc = HdfsError(f"HDFS belum siap (HTTP {resp.status_code}): {resp.text[:200]}")
                log.warning("HDFS belum siap / safe mode, percobaan %s/%s", attempt, self.max_retries)
            if attempt < self.max_retries:
                time.sleep(self.retry_wait)
        raise HdfsError(f"WebHDFS tidak dapat dihubungi untuk {what}: {last_exc}")

    # ------------------------------------------------------------- operations
    def status(self, path: str) -> dict[str, Any] | None:
        resp = self._request("GET", self._url(path), f"GETFILESTATUS {path}", params=self._params("GETFILESTATUS"))
        if resp.status_code == 404:
            return None
        self._raise_for_remote(resp, f"GETFILESTATUS {path}")
        return resp.json().get("FileStatus")

    def exists(self, path: str) -> bool:
        return self.status(path) is not None

    def mkdirs(self, path: str) -> None:
        resp = self._request("PUT", self._url(path), f"MKDIRS {path}", params=self._params("MKDIRS"))
        self._raise_for_remote(resp, f"MKDIRS {path}")

    def list(self, path: str) -> list[dict[str, Any]]:
        resp = self._request("GET", self._url(path), f"LISTSTATUS {path}", params=self._params("LISTSTATUS"))
        if resp.status_code == 404:
            return []
        self._raise_for_remote(resp, f"LISTSTATUS {path}")
        return resp.json().get("FileStatuses", {}).get("FileStatus", [])

    def delete(self, path: str, recursive: bool = False) -> bool:
        resp = self._request(
            "DELETE",
            self._url(path),
            f"DELETE {path}",
            params=self._params("DELETE", recursive=str(recursive).lower()),
        )
        self._raise_for_remote(resp, f"DELETE {path}")
        return bool(resp.json().get("boolean"))

    def rename(self, src: str, dst: str) -> bool:
        resp = self._request("PUT", self._url(src), f"RENAME {src}", params=self._params("RENAME", destination=dst))
        self._raise_for_remote(resp, f"RENAME {src} -> {dst}")
        return bool(resp.json().get("boolean"))

    def write_bytes(self, hdfs_path: str, data: bytes, overwrite: bool = True) -> None:
        """Tulis file secara atomik: tulis ke ``._COPYING_`` lalu rename."""
        parent = hdfs_path.rsplit("/", 1)[0] or "/"
        self.mkdirs(parent)
        tmp_path = f"{hdfs_path}._COPYING_"
        # Langkah 1: NameNode memberi lokasi DataNode (redirect 307).
        resp = self._request(
            "PUT",
            self._url(tmp_path),
            f"CREATE {tmp_path}",
            params=self._params("CREATE", overwrite="true"),
            allow_redirects=False,
        )
        if resp.status_code not in (307, 201):
            self._raise_for_remote(resp, f"CREATE {tmp_path}")
            raise HdfsError(f"Respons CREATE tidak terduga: HTTP {resp.status_code}")
        if resp.status_code == 307:
            location = resp.headers["Location"]
            # Langkah 2: kirim isi file ke DataNode.
            put = self._request(
                "PUT",
                location,
                f"CREATE(datanode) {tmp_path}",
                data=data,
                headers={"Content-Type": "application/octet-stream"},
            )
            self._raise_for_remote(put, f"CREATE(datanode) {tmp_path}")
        if overwrite and self.exists(hdfs_path):
            self.delete(hdfs_path)
        if not self.rename(tmp_path, hdfs_path):
            raise HdfsError(f"Gagal me-rename {tmp_path} -> {hdfs_path}")

    def upload(self, local_path: str | Path, hdfs_path: str, overwrite: bool = True) -> dict[str, Any]:
        local_path = Path(local_path)
        data = local_path.read_bytes()
        self.write_bytes(hdfs_path, data, overwrite=overwrite)
        log.info("HDFS <- %s (%s byte) => %s", local_path.name, len(data), hdfs_path)
        return {"hdfs_path": hdfs_path, "bytes": len(data)}

    def read_bytes(self, hdfs_path: str) -> bytes:
        resp = self._request("GET", self._url(hdfs_path), f"OPEN {hdfs_path}", params=self._params("OPEN"))
        if resp.status_code == 404:
            raise FileNotFoundError(f"Tidak ada di HDFS: {hdfs_path}")
        self._raise_for_remote(resp, f"OPEN {hdfs_path}")
        return resp.content

    def download(self, hdfs_path: str, local_path: str | Path) -> Path:
        local_path = Path(local_path)
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(self.read_bytes(hdfs_path))
        return local_path
