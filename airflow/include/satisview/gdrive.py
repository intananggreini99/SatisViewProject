"""Pengambilan file dari Google Drive.

Tiga mode akses, dipilih otomatis berurutan:

1. **Service account** (paling aman) - jika file JSON kredensial ada di
   ``GDRIVE_SERVICE_ACCOUNT_FILE``. Bagikan kedua folder Drive ke email
   service account (akses Viewer).
2. **API key** - jika ``GDRIVE_API_KEY`` diisi. Folder harus dibagikan
   "Siapa saja yang memiliki link".
3. **Publik tanpa kredensial** (default, memakai ``gdown``) - folder harus
   dibagikan "Siapa saja yang memiliki link".

Google Sheets (native) diekspor sebagai XLSX (arsip asli, sesuai diagram) dan
CSV (isi sel apa adanya). File .xlsx/.csv/.pdf yang diunggah apa adanya
diunduh langsung.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import requests

from . import config

log = logging.getLogger(__name__)

DRIVE_API = "https://www.googleapis.com/drive/v3"
MIME_FOLDER = "application/vnd.google-apps.folder"
MIME_GSHEET = "application/vnd.google-apps.spreadsheet"
MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MIME_XLS = "application/vnd.ms-excel"
MIME_CSV = "text/csv"
MIME_PDF = "application/pdf"
OTHER_EXTENSIONS = {
    ".doc", ".docx", ".ppt", ".pptx", ".txt", ".json", ".zip", ".rar", ".png",
    ".jpg", ".jpeg", ".gif", ".svg", ".mp4", ".mov", ".py", ".ipynb", ".md",
}


class DriveAccessError(RuntimeError):
    pass


@dataclass
class DriveFile:
    id: str
    name: str
    mime_type: str | None = None
    modified_time: str | None = None
    size: int | None = None

    @property
    def is_folder(self) -> bool:
        return self.mime_type == MIME_FOLDER

    @property
    def kind(self) -> str:
        """``gsheet`` | ``xlsx`` | ``csv`` | ``pdf`` | ``other``."""
        name = self.name.lower()
        if self.mime_type == MIME_GSHEET:
            return "gsheet"
        if self.mime_type in (MIME_XLSX, MIME_XLS) or name.endswith((".xlsx", ".xls")):
            return "xlsx"
        if self.mime_type == MIME_CSV or name.endswith(".csv"):
            return "csv"
        if self.mime_type == MIME_PDF or name.endswith(".pdf"):
            return "pdf"
        if self.mime_type is None:
            # Mode publik (gdown) tidak memberi mimeType. File tanpa ekstensi
            # dokumen yang dikenal di folder respons dianggap Google Sheets native.
            suffix = Path(name).suffix.lower()
            if suffix in OTHER_EXTENSIONS:
                return "other"
            return "gsheet"
        return "other"

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------- validasi
def _check_xlsx(data: bytes, name: str) -> None:
    if not data.startswith(b"PK"):
        snippet = data[:200].decode("utf-8", "ignore")
        raise DriveAccessError(
            f"Unduhan '{name}' bukan file XLSX yang valid. Kemungkinan file belum "
            "dibagikan 'Siapa saja yang memiliki link' atau butuh kredensial. "
            f"Awal respons: {snippet!r}"
        )


def _check_not_html(data: bytes, name: str) -> None:
    head = data[:512].lstrip().lower()
    if head.startswith(b"<!doctype html") or head.startswith(b"<html"):
        raise DriveAccessError(
            f"Unduhan '{name}' berupa halaman HTML (bukan file). Periksa izin berbagi "
            "folder Google Drive atau gunakan API key / service account."
        )


def check_pdf(data: bytes, name: str) -> None:
    if not data.startswith(b"%PDF"):
        raise DriveAccessError(f"Unduhan '{name}' bukan file PDF yang valid.")


def xlsx_to_csv_bytes(xlsx_bytes: bytes) -> bytes:
    """Konversi sheet pertama XLSX ke CSV (dipakai bila Drive tidak memberi CSV)."""
    import pandas as pd

    df = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name=0, dtype=object)
    return df.to_csv(index=False).encode("utf-8")


def csv_to_xlsx_bytes(csv_bytes: bytes) -> bytes:
    import pandas as pd

    df = pd.read_csv(io.BytesIO(csv_bytes), dtype=str, keep_default_na=False)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, sheet_name="Form Responses 1")
    return buf.getvalue()


# ------------------------------------------------------------ klien Drive API
class ApiDriveClient:
    """Google Drive API v3 dengan API key atau service account."""

    def __init__(self, api_key: str | None = None, service_account_file: str | None = None) -> None:
        self.api_key = api_key
        self.service_account_file = service_account_file
        self.session = requests.Session()
        self._credentials = None
        if service_account_file:
            from google.oauth2 import service_account  # disediakan image Airflow

            self._credentials = service_account.Credentials.from_service_account_file(
                service_account_file,
                scopes=["https://www.googleapis.com/auth/drive.readonly"],
            )
        self.mode = "service_account" if self._credentials else "api_key"

    def _auth(self) -> tuple[dict, dict]:
        headers: dict = {}
        params: dict = {}
        if self._credentials is not None:
            from google.auth.transport.requests import Request

            if not self._credentials.valid:
                self._credentials.refresh(Request())
            headers["Authorization"] = f"Bearer {self._credentials.token}"
        elif self.api_key:
            params["key"] = self.api_key
        return headers, params

    def _get(self, url: str, params: dict | None = None) -> requests.Response:
        headers, auth_params = self._auth()
        merged = dict(params or {})
        merged.update(auth_params)
        resp = self.session.get(url, params=merged, headers=headers, timeout=config.HTTP_TIMEOUT)
        if resp.status_code >= 400:
            raise DriveAccessError(f"Google Drive API HTTP {resp.status_code}: {resp.text[:400]}")
        return resp

    def list_folder(self, folder_id: str) -> list[DriveFile]:
        files: list[DriveFile] = []
        page_token = None
        while True:
            params = {
                "q": f"'{folder_id}' in parents and trashed = false",
                "fields": "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
                "pageSize": 1000,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if page_token:
                params["pageToken"] = page_token
            data = self._get(f"{DRIVE_API}/files", params).json()
            for item in data.get("files", []):
                files.append(
                    DriveFile(
                        id=item["id"],
                        name=item["name"],
                        mime_type=item.get("mimeType"),
                        modified_time=item.get("modifiedTime"),
                        size=int(item["size"]) if item.get("size") else None,
                    )
                )
            page_token = data.get("nextPageToken")
            if not page_token:
                return files

    def export(self, file: DriveFile, mime_type: str) -> bytes:
        return self._get(f"{DRIVE_API}/files/{file.id}/export", {"mimeType": mime_type}).content

    def download(self, file: DriveFile) -> bytes:
        return self._get(f"{DRIVE_API}/files/{file.id}", {"alt": "media", "supportsAllDrives": "true"}).content

    def fetch_spreadsheet(self, file: DriveFile) -> tuple[bytes, bytes]:
        if file.kind == "gsheet":
            xlsx = self.export(file, MIME_XLSX)
            csv = self.export(file, MIME_CSV)
        elif file.kind == "xlsx":
            xlsx = self.download(file)
            _check_xlsx(xlsx, file.name)
            csv = xlsx_to_csv_bytes(xlsx)
        else:  # csv
            csv = self.download(file)
            xlsx = csv_to_xlsx_bytes(csv)
        _check_xlsx(xlsx, file.name)
        _check_not_html(csv, file.name)
        return xlsx, csv

    def fetch_binary(self, file: DriveFile) -> bytes:
        return self.download(file)


class PublicDriveClient:
    """Akses folder publik ("Siapa saja yang memiliki link") memakai gdown."""

    mode = "public"

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers["User-Agent"] = (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        )

    def list_folder(self, folder_id: str) -> list[DriveFile]:
        import gdown

        try:
            entries = gdown.download_folder(
                id=folder_id, skip_download=True, quiet=True, use_cookies=False, remaining_ok=True
            )
        except Exception as exc:  # gdown melempar RuntimeError bila folder privat
            raise DriveAccessError(
                f"Gagal membaca folder Drive {folder_id}: {exc}. Pastikan folder dibagikan "
                "'Siapa saja yang memiliki link', atau isi GDRIVE_API_KEY / service account."
            ) from exc
        files = []
        for entry in entries or []:
            name = Path(entry.path).name
            files.append(DriveFile(id=entry.id, name=name))
        return files

    def _get(self, url: str) -> bytes:
        resp = self.session.get(url, timeout=config.HTTP_TIMEOUT, allow_redirects=True)
        if resp.status_code >= 400:
            raise DriveAccessError(f"Unduh gagal HTTP {resp.status_code} dari {url}")
        return resp.content

    def _download_binary(self, file: DriveFile) -> bytes:
        import gdown
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "download.bin"
            result = gdown.download(id=file.id, output=str(out), quiet=True, use_cookies=False)
            if not result or not out.exists():
                raise DriveAccessError(f"gdown gagal mengunduh '{file.name}' ({file.id}).")
            return out.read_bytes()

    def fetch_spreadsheet(self, file: DriveFile) -> tuple[bytes, bytes]:
        if file.kind == "gsheet":
            base = f"https://docs.google.com/spreadsheets/d/{file.id}/export"
            xlsx = self._get(f"{base}?format=xlsx")
            _check_xlsx(xlsx, file.name)
            csv = self._get(f"{base}?format=csv")
            _check_not_html(csv, file.name)
            return xlsx, csv
        data = self._download_binary(file)
        if file.kind == "xlsx":
            _check_xlsx(data, file.name)
            return data, xlsx_to_csv_bytes(data)
        _check_not_html(data, file.name)
        return csv_to_xlsx_bytes(data), data

    def fetch_binary(self, file: DriveFile) -> bytes:
        return self._download_binary(file)


def make_client():
    """Pilih mode akses Drive sesuai kredensial yang tersedia."""
    sa_file = config.GDRIVE_SERVICE_ACCOUNT_FILE
    if sa_file and Path(sa_file).is_file():
        log.info("Google Drive: memakai service account %s", sa_file)
        return ApiDriveClient(service_account_file=sa_file)
    if config.GDRIVE_API_KEY:
        log.info("Google Drive: memakai API key")
        return ApiDriveClient(api_key=config.GDRIVE_API_KEY)
    log.info("Google Drive: mode publik (gdown) tanpa kredensial")
    return PublicDriveClient()


def pick_latest(files: Iterable[DriveFile]) -> DriveFile | None:
    files = list(files)
    if not files:
        return None
    return sorted(files, key=lambda f: f.modified_time or "", reverse=True)[0]


def find_report(files: Iterable[DriveFile], filename: str) -> DriveFile | None:
    """Cari dokumen laporan: nama persis dulu, lalu pola 'satisview*report*.pdf'."""
    files = [f for f in files if not f.is_folder]
    exact = [f for f in files if f.name.lower() == filename.lower()]
    if exact:
        return pick_latest(exact)
    pattern = re.compile(r"satis\s*_?view.*report.*\.pdf$", re.IGNORECASE)
    return pick_latest(f for f in files if pattern.search(f.name))
