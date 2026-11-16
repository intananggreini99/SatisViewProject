"""Konfigurasi pipeline yang dibaca dari environment variable (lihat ``.env``)."""

from __future__ import annotations

import os
from pathlib import Path


def _env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except (TypeError, ValueError):
        return default


# --- Lokasi docker volume -------------------------------------------------
DATA_DIR = Path(_env("SATISVIEW_DATA_DIR", "/opt/satisview/data"))
LANDING_DIR = DATA_DIR / "landing"  # hasil unduhan Google Drive
STAGING_DIR = DATA_DIR / "staging"  # hasil preprocessing/analisis sebelum ke HDFS
CONTRACT_FILE = Path(_env("SATISVIEW_CONTRACT_FILE", "/opt/satisview/contracts/data_contract.json"))

# --- Sumber data ------------------------------------------------------------
# Satu-satunya sumber data: sheet respons Google Form ASLI di folder Google
# Drive "Data Responden". Tidak ada mode data contoh/sintetis.
GDRIVE_DATA_FOLDER_ID = _env("GDRIVE_DATA_FOLDER_ID", "1eGAoqvFkWy0qmNz_hFyMgY8kzQaGntJ7")
GDRIVE_REPORT_FOLDER_ID = _env("GDRIVE_REPORT_FOLDER_ID", "1USXnj85DRgiZ84qoBUAIWAhg7M6VS6RG")
GDRIVE_API_KEY = _env("GDRIVE_API_KEY")
GDRIVE_SERVICE_ACCOUNT_FILE = _env(
    "GDRIVE_SERVICE_ACCOUNT_FILE", "/opt/satisview/secrets/service-account.json"
)
REPORT_FILENAME = _env("SATISVIEW_REPORT_FILENAME", "SatisView_Report.pdf")
HTTP_TIMEOUT = _env_int("SATISVIEW_HTTP_TIMEOUT", 120)

# --- HDFS (WebHDFS) -------------------------------------------------------
WEBHDFS_URL = (_env("WEBHDFS_URL", "http://namenode:9870/webhdfs/v1") or "").rstrip("/")
HDFS_USER = _env("HDFS_USER", "root")
HDFS_ROOT = (_env("HDFS_ROOT", "/satisview") or "/satisview").rstrip("/")

# --- PostgreSQL -------------------------------------------------------------
PG_HOST = _env("SATISVIEW_PG_HOST", "postgres")
PG_PORT = _env_int("SATISVIEW_PG_PORT", 5432)
PG_USER = _env("SATISVIEW_PG_USER", "satisview")
PG_PASSWORD = _env("SATISVIEW_PG_PASSWORD", "satisview")
PG_MAINTENANCE_DB = _env("SATISVIEW_PG_MAINTENANCE_DB", "postgres")
RAW_DB = _env("SATISVIEW_RAW_DB", "raw_data")
# Role baca-saja yang dipakai API dashboard; diberi hak SELECT setiap tabel dimuat.
DASHBOARD_DB_USER = _env("DASHBOARD_DB_USER")

# --- Jadwal pipeline (cron) -------------------------------------------------
# Default tiap 6 jam (WIB). Kosongkan/isi "none" untuk hanya dijalankan manual.
SCHEDULE = _env("SATISVIEW_SCHEDULE", "0 */6 * * *")
if SCHEDULE and SCHEDULE.lower() in {"none", "manual", "off"}:
    SCHEDULE = None

# --- Modul preprocessing & analisis ----------------------------------------
# Default menjalankan kode tim (satisview/tim/). Bisa diarahkan ke modul lain
# dengan fungsi yang sama (lihat satisview/plugins.py).
PREPROCESSING_MODULE = _env("SATISVIEW_PREPROCESSING_MODULE", "satisview.preprocessing")
ANALYSIS_MODULE = _env("SATISVIEW_ANALYSIS_MODULE", "satisview.analysis")

# Minimal responden (lengkap) agar MDS dihitung untuk suatu segmen.
MIN_RESPONDEN_MDS = _env_int("SATISVIEW_MIN_RESPONDEN_MDS", 10)

# --- Ambang validasi --------------------------------------------------------
# Rasio maksimal jawaban Likert yang gagal dikonversi ke skor (cek_konversi tim).
MAX_GAGAL_KONVERSI = _env_float("SATISVIEW_MAX_GAGAL_KONVERSI", 0.01)


class HdfsPaths:
    """Tata letak folder di HDFS."""

    root = HDFS_ROOT

    @staticmethod
    def raw_xlsx(key: str) -> str:
        return f"{HDFS_ROOT}/raw/xlsx/kuisioner_{key}.xlsx"

    @staticmethod
    def raw_csv(key: str) -> str:
        return f"{HDFS_ROOT}/raw/csv/kuisioner_{key}.csv"

    @staticmethod
    def report() -> str:
        return f"{HDFS_ROOT}/report/{REPORT_FILENAME}"

    @staticmethod
    def preprocessed_dir(key: str) -> str:
        return f"{HDFS_ROOT}/preprocessed/{key}"

    @staticmethod
    def analysis_dir(key: str) -> str:
        return f"{HDFS_ROOT}/analysis/{key}"

    @staticmethod
    def validation_dir(key: str) -> str:
        return f"{HDFS_ROOT}/validation/{key}"
