"""Server WebHDFS tiruan (untuk pengujian lokal tanpa Hadoop).

Meniru perilaku NameNode: operasi CREATE/OPEN dialihkan (HTTP 307) ke
"DataNode" (endpoint /datanode pada server yang sama).
"""

from __future__ import annotations

import json
import shutil
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PREFIX = "/webhdfs/v1"
DN_PREFIX = "/datanode" + PREFIX


class FakeWebHdfs:
    def __init__(self, root: Path, port: int = 0) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        handler = self._make_handler()
        self.server = ThreadingHTTPServer(("127.0.0.1", port), handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}{PREFIX}"

    def start(self) -> "FakeWebHdfs":
        self.thread.start()
        return self

    def stop(self) -> None:
        self.server.shutdown()

    def _make_handler(self):
        fs = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # senyap
                pass

            def _json(self, code: int, payload: dict) -> None:
                body = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _resolve(self):
                parsed = urlparse(self.path)
                datanode = parsed.path.startswith(DN_PREFIX)
                hdfs_path = parsed.path[len(DN_PREFIX if datanode else PREFIX):] or "/"
                params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
                local = fs.root / hdfs_path.lstrip("/")
                return datanode, hdfs_path, params, local

            def _not_found(self, hdfs_path):
                self._json(404, {"RemoteException": {"exception": "FileNotFoundException", "message": f"File does not exist: {hdfs_path}"}})

            def do_GET(self):
                datanode, hdfs_path, params, local = self._resolve()
                op = params.get("op", "").upper()
                if op == "GETFILESTATUS":
                    if not local.exists():
                        return self._not_found(hdfs_path)
                    return self._json(200, {"FileStatus": {"type": "DIRECTORY" if local.is_dir() else "FILE", "length": 0 if local.is_dir() else local.stat().st_size, "modificationTime": int(local.stat().st_mtime * 1000)}})
                if op == "LISTSTATUS":
                    if not local.exists():
                        return self._not_found(hdfs_path)
                    items = [{"pathSuffix": p.name, "type": "DIRECTORY" if p.is_dir() else "FILE", "length": 0 if p.is_dir() else p.stat().st_size} for p in sorted(local.iterdir())]
                    return self._json(200, {"FileStatuses": {"FileStatus": items}})
                if op == "OPEN":
                    if not datanode:
                        self.send_response(307)
                        self.send_header("Location", f"http://127.0.0.1:{fs.port}{DN_PREFIX}{hdfs_path}?op=OPEN")
                        self.send_header("Content-Length", "0")
                        self.end_headers()
                        return
                    if not local.is_file():
                        return self._not_found(hdfs_path)
                    data = local.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                self._json(400, {"RemoteException": {"exception": "IllegalArgumentException", "message": op}})

            def do_PUT(self):
                datanode, hdfs_path, params, local = self._resolve()
                op = params.get("op", "").upper()
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                if op == "MKDIRS":
                    local.mkdir(parents=True, exist_ok=True)
                    return self._json(200, {"boolean": True})
                if op == "CREATE":
                    if not datanode:
                        self.send_response(307)
                        self.send_header("Location", f"http://127.0.0.1:{fs.port}{DN_PREFIX}{hdfs_path}?op=CREATE&overwrite={params.get('overwrite', 'false')}")
                        self.send_header("Content-Length", "0")
                        self.end_headers()
                        return
                    local.parent.mkdir(parents=True, exist_ok=True)
                    local.write_bytes(body)
                    self.send_response(201)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                if op == "RENAME":
                    dest = fs.root / params["destination"].lstrip("/")
                    if not local.exists() or dest.exists():
                        return self._json(200, {"boolean": False})
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    local.rename(dest)
                    return self._json(200, {"boolean": True})
                self._json(400, {"RemoteException": {"exception": "IllegalArgumentException", "message": op}})

            def do_DELETE(self):
                _, hdfs_path, params, local = self._resolve()
                if not local.exists():
                    return self._json(200, {"boolean": False})
                if local.is_dir():
                    if params.get("recursive") != "true" and any(local.iterdir()):
                        return self._json(403, {"RemoteException": {"exception": "PathIsNotEmptyDirectoryException", "message": hdfs_path}})
                    shutil.rmtree(local)
                else:
                    local.unlink()
                return self._json(200, {"boolean": True})

        return Handler


if __name__ == "__main__":  # python fake_webhdfs.py <root> <port>
    server = FakeWebHdfs(Path(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 9870)
    print(f"Fake WebHDFS di {server.url}", flush=True)
    server.server.serve_forever()
