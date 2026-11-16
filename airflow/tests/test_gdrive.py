"""Logika Google Drive (tanpa jaringan: semua HTTP ditiru)."""

import io
from types import SimpleNamespace

import pandas as pd
import pytest

from satisview import gdrive
from satisview.respondents import match_group_for_filename
from data_sintetis import to_xlsx_bytes

# Nama file asli pada folder Drive "Data Responden" (screenshot pengguna).
DRIVE_NAMES = {
    "Pelayanan Kepuasan - Mitra pengadaan barang & jasa (Responses)": "mitra_pengadaan",
    "Pelayanan Kepuasan - Mitra Kerja sama (Responses)": "mitra_kerjasama",
    "Pelayanan Kepuasan - Mahasiswa (Jawaban)": "mahasiswa",
    "Pelayanan Kepuasan - Karyawan (Responses)": "karyawan",
    "Pelayanan Kepuasan - Dosen (Responses)": "dosen",
}


@pytest.mark.parametrize("name,key", DRIVE_NAMES.items())
def test_drive_file_names_map_to_groups(name, key):
    assert match_group_for_filename(name).key == key
    assert gdrive.DriveFile(id="x", name=name).kind == "gsheet"  # mode publik: tanpa mimeType


def test_kind_detection():
    assert gdrive.DriveFile("1", "a.xlsx").kind == "xlsx"
    assert gdrive.DriveFile("1", "a.csv").kind == "csv"
    assert gdrive.DriveFile("1", "SatisView_Report.pdf").kind == "pdf"
    assert gdrive.DriveFile("1", "foto.png").kind == "other"
    assert gdrive.DriveFile("1", "Kuisioner Mhs. 2026").kind == "gsheet"
    assert gdrive.DriveFile("1", "x", mime_type=gdrive.MIME_GSHEET).kind == "gsheet"


def test_find_report_prefers_exact_then_pattern():
    files = [
        gdrive.DriveFile("1", "draft.pdf", modified_time="2026-10-01"),
        gdrive.DriveFile("2", "SatisView Report v2.pdf", modified_time="2026-10-05"),
        gdrive.DriveFile("3", "SatisView_Report.pdf", modified_time="2026-09-01"),
    ]
    assert gdrive.find_report(files, "SatisView_Report.pdf").id == "3"
    assert gdrive.find_report(files[:2], "SatisView_Report.pdf").id == "2"
    assert gdrive.find_report(files[:1], "SatisView_Report.pdf") is None


class FakeResponse:
    def __init__(self, content=b"", status=200, json_data=None):
        self.content = content
        self.status_code = status
        self._json = json_data
        self.text = content.decode("utf-8", "ignore") if isinstance(content, bytes) else str(content)

    def json(self):
        return self._json


def test_api_client_lists_and_exports(monkeypatch):
    calls = []
    xlsx = to_xlsx_bytes(pd.DataFrame({"Timestamp": ["2026-09-01"], "Prodi": ["A"]}))

    def fake_get(self, url, params=None, headers=None, timeout=None):
        calls.append((url, dict(params or {})))
        if url.endswith("/files"):
            return FakeResponse(json_data={"files": [
                {"id": "abc", "name": "Pelayanan Kepuasan - Dosen (Responses)", "mimeType": gdrive.MIME_GSHEET},
            ]})
        if url.endswith("/export") and params["mimeType"] == gdrive.MIME_XLSX:
            return FakeResponse(xlsx)
        if url.endswith("/export"):
            return FakeResponse(b"Timestamp,Prodi\n2026-09-01,A\n")
        return FakeResponse(b"", 404)

    monkeypatch.setattr("requests.Session.get", fake_get)
    client = gdrive.ApiDriveClient(api_key="KUNCI")
    files = client.list_folder("FOLDER")
    assert files[0].kind == "gsheet"
    assert "'FOLDER' in parents" in calls[0][1]["q"] and calls[0][1]["key"] == "KUNCI"
    x, c = client.fetch_spreadsheet(files[0])
    assert x.startswith(b"PK") and c.startswith(b"Timestamp")


def test_public_client_rejects_html_permission_page(monkeypatch):
    monkeypatch.setattr(
        "requests.Session.get",
        lambda self, url, timeout=None, allow_redirects=True: FakeResponse(b"<!DOCTYPE html><html>Sign in</html>"),
    )
    client = gdrive.PublicDriveClient()
    with pytest.raises(gdrive.DriveAccessError, match="bukan file XLSX"):
        client.fetch_spreadsheet(gdrive.DriveFile("id1", "Pelayanan Kepuasan - Dosen (Responses)"))


def test_public_client_lists_folder_with_gdown(monkeypatch):
    import gdown

    entries = [SimpleNamespace(id="a1", path="Pelayanan Kepuasan - Dosen (Responses)", local_path="x")]
    monkeypatch.setattr(gdown, "download_folder", lambda **kwargs: entries)
    files = gdrive.PublicDriveClient().list_folder("FOLDER")
    assert files[0].id == "a1" and files[0].kind == "gsheet"


def test_xlsx_csv_conversion_roundtrip():
    df = pd.DataFrame({"Stempel waktu": ["2026-09-01 08:00:00"], "Program Studi": ["STr. Sains Data Terapan"]})
    csv = gdrive.xlsx_to_csv_bytes(to_xlsx_bytes(df))
    back = pd.read_csv(io.BytesIO(csv))
    assert list(back.columns) == list(df.columns)
    assert gdrive.csv_to_xlsx_bytes(csv).startswith(b"PK")
