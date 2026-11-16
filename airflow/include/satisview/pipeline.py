"""Langkah-langkah pipeline SatisView (dipanggil oleh DAG Airflow).

Semua fungsi menerima/mengembalikan dict kecil yang JSON-serializable agar
aman dikirim lewat XCom. Data besar selalu lewat file (docker volume/HDFS).
"""

from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from . import config, gdrive, ingestion, plugins
from .config import HdfsPaths
from .hdfs import WebHdfsClient
from .respondents import GROUPS, get_group, match_group_for_filename
from .validation import ValidationFailed, validate_analysis, validate_preprocessed

log = logging.getLogger(__name__)


class SkipGroup(RuntimeError):
    """Data untuk kelompok responden ini tidak tersedia -> task di-skip."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _hdfs() -> WebHdfsClient:
    return WebHdfsClient()


def _write_json(path: Path, payload: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return path


# =========================================================== gdrive_to_hdfs
def extract_from_gdrive() -> dict:
    """(a) Ambil sheet respons kuisioner + laporan PDF dari Google Drive ke docker volume."""
    landing = config.LANDING_DIR
    if landing.exists():
        shutil.rmtree(landing)
    (landing / "report").mkdir(parents=True, exist_ok=True)
    manifest: dict = {
        "sumber": "google_drive",
        "folder_drive": config.GDRIVE_DATA_FOLDER_ID,
        "waktu": _now(),
        "kuisioner": {},
        "laporan": None,
        "peringatan": [],
    }

    client = gdrive.make_client()
    manifest["mode_akses"] = getattr(client, "mode", "unknown")
    files = client.list_folder(config.GDRIVE_DATA_FOLDER_ID)
    log.info("Folder data Drive berisi %s item", len(files))
    candidates: dict[str, list[gdrive.DriveFile]] = {}
    for f in files:
        if f.is_folder or f.kind not in ("gsheet", "xlsx", "csv"):
            continue
        group = match_group_for_filename(f.name)
        if group is None:
            manifest["peringatan"].append(f"File '{f.name}' tidak dikenali sebagai kuisioner mana pun; dilewati.")
            continue
        candidates.setdefault(group.key, []).append(f)

    for group in GROUPS:
        found = candidates.get(group.key, [])
        if not found:
            manifest["peringatan"].append(f"Sheet respons {group.label} tidak ditemukan di folder Drive.")
            continue
        chosen = gdrive.pick_latest(found)
        if len(found) > 1:
            manifest["peringatan"].append(
                f"{len(found)} file cocok untuk {group.label}; dipakai yang terbaru: '{chosen.name}'."
            )
        try:
            xlsx, csv = client.fetch_spreadsheet(chosen)
        except gdrive.DriveAccessError as exc:
            manifest["peringatan"].append(f"Gagal mengunduh '{chosen.name}': {exc}")
            log.error("Gagal mengunduh %s: %s", chosen.name, exc)
            continue
        xlsx_path = landing / f"kuisioner_{group.key}.xlsx"
        csv_path = landing / f"kuisioner_{group.key}.csv"
        xlsx_path.write_bytes(xlsx)
        csv_path.write_bytes(csv)
        manifest["kuisioner"][group.key] = {
            "nama_file_drive": chosen.name,
            "id_drive": chosen.id,
            "diubah_drive": chosen.modified_time,
            "xlsx": str(xlsx_path),
            "csv": str(csv_path),
        }
        log.info("Diunduh: %s -> %s", chosen.name, xlsx_path.name)

    try:
        report_file = gdrive.find_report(client.list_folder(config.GDRIVE_REPORT_FOLDER_ID), config.REPORT_FILENAME)
        if report_file is None:
            manifest["peringatan"].append(f"{config.REPORT_FILENAME} belum ada di folder laporan Drive.")
        else:
            data = client.fetch_binary(report_file)
            gdrive.check_pdf(data, report_file.name)
            report_path = landing / "report" / config.REPORT_FILENAME
            report_path.write_bytes(data)
            manifest["laporan"] = {"nama_file_drive": report_file.name, "path": str(report_path), "bytes": len(data)}
    except gdrive.DriveAccessError as exc:
        manifest["peringatan"].append(f"Folder laporan tidak dapat dibaca: {exc}")

    for warning in manifest["peringatan"]:
        log.warning(warning)
    _write_json(landing / "manifest.json", manifest)
    if not manifest["kuisioner"]:
        raise RuntimeError(
            "Tidak ada satu pun sheet kuisioner yang berhasil diambil dari Google Drive. "
            "Periksa izin berbagi folder atau kredensial (lihat README bagian Akses Google Drive)."
        )
    return manifest


def load_landing_to_hdfs(manifest: dict) -> dict:
    """(b) Simpan raw data kuisioner (XLSX & CSV) dan dokumen laporan ke HDFS."""
    hdfs = _hdfs()
    stored: dict = {"kuisioner": {}, "laporan": None}
    for key, info in manifest.get("kuisioner", {}).items():
        stored["kuisioner"][key] = {
            "xlsx": hdfs.upload(info["xlsx"], HdfsPaths.raw_xlsx(key)),
            "csv": hdfs.upload(info["csv"], HdfsPaths.raw_csv(key)),
        }
    if manifest.get("laporan"):
        stored["laporan"] = hdfs.upload(manifest["laporan"]["path"], HdfsPaths.report())
    _write_json(config.LANDING_DIR / "hdfs_manifest.json", {"waktu": _now(), **stored})
    return stored


# ===================================================== preprocessing_analysis
def _work_dir(key: str, stage: str) -> Path:
    path = config.STAGING_DIR / key / stage
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _baca_csv(path: str | Path) -> pd.DataFrame:
    """Baca CSV seperti notebook tim (``pd.read_csv`` bawaan) — dipakai tahap analisis."""
    return pd.read_csv(path)


def _baca_csv_persis(path: str | Path) -> pd.DataFrame:
    """Baca CSV apa adanya (hanya sel kosong = NaN) — dipakai validasi."""
    return pd.read_csv(path, keep_default_na=False, na_values=[""])


def _tulis_tabel(work: Path, tabel: dict[str, pd.DataFrame]) -> dict[str, str]:
    paths = {}
    for nama, df in tabel.items():
        path = work / f"{nama}.csv"
        df.to_csv(path, index=False)
        paths[nama] = str(path)
    return paths


def _ganti_folder_hdfs(hdfs: WebHdfsClient, target: str, files: dict[str, str]) -> None:
    """Unggah ke folder sementara lalu tukar, agar folder lama utuh bila unggah gagal."""
    tmp = f"{target}__baru"
    if hdfs.exists(tmp):
        hdfs.delete(tmp, recursive=True)
    for path in files.values():
        hdfs.upload(path, f"{tmp}/{Path(path).name}")
    if hdfs.exists(target):
        hdfs.delete(target, recursive=True)
    hdfs.rename(tmp, target)


def _laporkan(hdfs: WebHdfsClient, key: str, report, local: Path) -> None:
    path = _write_json(local, report.to_dict())
    hdfs.upload(path, f"{HdfsPaths.validation_dir(key)}/{local.name}")
    for line in report.warnings:
        log.warning("[%s] %s", key, line)
    if not report.passed:
        raise ValidationFailed(report)


def step_preprocessing(key: str) -> dict:
    """(c) Ambil raw data dari HDFS lalu jalankan kode preprocessing tim."""
    group = get_group(key)
    hdfs = _hdfs()
    raw_path = HdfsPaths.raw_xlsx(key)
    if not hdfs.exists(raw_path):
        raise SkipGroup(f"Raw data {group.label} belum ada di HDFS ({raw_path}).")
    work = _work_dir(key, "preprocessed")
    local_raw = hdfs.download(raw_path, config.STAGING_DIR / key / f"kuisioner_{key}.xlsx")
    raw_df = pd.read_excel(local_raw)  # sama seperti notebook: pd.read_excel(RAW_PATH)

    preprocess = plugins.get_preprocessor()
    tabel, meta = preprocess(raw_df, group)
    files = _tulis_tabel(work, tabel)
    meta_path = _write_json(work / f"meta_preprocessing_{key}.json", meta)
    return {
        "responden": key,
        "file": files,
        "meta": str(meta_path),
        "baris": int(meta.get("n_responden", 0)),
    }


def step_validation_preprocessing(result: dict) -> dict:
    """(d) Validasi CSV hasil preprocessing; bila lolos simpan ke HDFS."""
    key = result["responden"]
    meta = json.loads(Path(result["meta"]).read_text(encoding="utf-8"))
    tabel = {nama: _baca_csv_persis(path) for nama, path in result["file"].items()}
    report = validate_preprocessed(tabel, meta, key)
    hdfs = _hdfs()
    _laporkan(hdfs, key, report, Path(result["meta"]).with_name("validation_preprocessing.json"))
    target = HdfsPaths.preprocessed_dir(key)
    _ganti_folder_hdfs(hdfs, target, {**result["file"], "meta": result["meta"]})
    return {**result, "validasi": report.status, "hdfs_dir": target}


def step_analysis(result: dict) -> dict:
    """(e) Analisis (kode tim) dataframe hasil preprocessing yang lolos validasi."""
    key = result["responden"]
    group = get_group(key)
    meta = json.loads(Path(result["meta"]).read_text(encoding="utf-8"))
    tabel_pre = {nama: _baca_csv(path) for nama, path in result["file"].items()}
    analyze = plugins.get_analyzer()
    keluaran = analyze(tabel_pre, meta, group)
    tabel, info = keluaran if isinstance(keluaran, tuple) else (keluaran, {})
    work = _work_dir(key, "analysis")
    files = _tulis_tabel(work, tabel)
    info_path = _write_json(config.STAGING_DIR / key / f"info_analisis_{key}.json", info)
    return {**result, "tabel": files, "info": str(info_path)}


def step_validation_analysis(result: dict) -> dict:
    """(e) Validasi CSV hasil analisis; bila lolos ganti isi folder analisis di HDFS."""
    key = result["responden"]
    meta = json.loads(Path(result["meta"]).read_text(encoding="utf-8"))
    info = json.loads(Path(result["info"]).read_text(encoding="utf-8")) if result.get("info") else {}
    tabel = {nama: _baca_csv_persis(path) for nama, path in result["tabel"].items()}
    ringkasan_path = result["file"].get(meta["file"]["ringkasan_aspek"])
    ringkasan = _baca_csv_persis(ringkasan_path) if ringkasan_path else None
    report = validate_analysis(tabel, meta, key, info=info, ringkasan_aspek=ringkasan)
    hdfs = _hdfs()
    _laporkan(hdfs, key, report, config.STAGING_DIR / key / "validation_analysis.json")
    target = HdfsPaths.analysis_dir(key)
    _ganti_folder_hdfs(hdfs, target, result["tabel"])
    return {"responden": key, "validasi": report.status, "hdfs_dir": target, "tabel": sorted(result["tabel"])}


# ================================================================ ingestion
def kolom_pribadi(df: pd.DataFrame, key: str) -> list[str]:
    """Kolom data pribadi (nama, kontak, nomor e-wallet, ...) menurut aturan preprocessing tim."""
    from .tim import preprocessing as tim_preprocessing
    from .tim.konfigurasi import konfigurasi

    asli = {tim_preprocessing.normalisasi_judul(k): k for k in df.columns}
    normal = df.rename(columns={v: k for k, v in asli.items()})
    pii = tim_preprocessing.tentukan_kolom(normal, konfigurasi(key)).pii
    return [asli[k] for k in pii if k in asli]


def ingest_raw(key: str) -> dict:
    """(f) Raw data kuisioner (CSV di HDFS) -> database raw_data, satu tabel per file.

    Kolom data pribadi responden (mis. "Nomor Gopay") tidak ikut dimuat ke
    PostgreSQL yang dibaca dashboard; arsip lengkapnya tetap di HDFS (raw zone).
    """
    group = get_group(key)
    hdfs = _hdfs()
    path = HdfsPaths.raw_csv(key)
    if not hdfs.exists(path):
        raise SkipGroup(f"{path} belum ada di HDFS.")
    df = ingestion.read_csv_as_text(hdfs.read_bytes(path))
    pribadi = kolom_pribadi(df, key)
    if pribadi:
        log.info("[%s] kolom data pribadi tidak dimuat ke PostgreSQL: %s", key, pribadi)
    hasil = ingestion.load_dataframe(config.RAW_DB, group.raw_table, df.drop(columns=pribadi), f"hdfs://{path}")
    return {**hasil, "kolom_pribadi_tidak_dimuat": pribadi}


def ingest_analysis(key: str) -> dict:
    """(f) Semua CSV hasil analisis di HDFS -> database analysis_<responden>."""
    group = get_group(key)
    hdfs = _hdfs()
    folder = HdfsPaths.analysis_dir(key)
    files = sorted(
        f["pathSuffix"] for f in hdfs.list(folder) if f.get("type") == "FILE" and f["pathSuffix"].lower().endswith(".csv")
    )
    if not files:
        raise SkipGroup(f"Belum ada hasil analisis di {folder}.")
    loaded = []
    for name in files:
        path = f"{folder}/{name}"
        loaded.append(
            ingestion.load_csv_bytes(group.analysis_db, ingestion.table_name_for(name), hdfs.read_bytes(path), f"hdfs://{path}")
        )
    dropped = drop_stale_tables(group.analysis_db, {ingestion.table_name_for(n) for n in files})
    return {"database": group.analysis_db, "tabel": loaded, "tabel_dihapus": dropped}


def drop_stale_tables(dbname: str, keep: set[str]) -> list[str]:
    """Hapus tabel yang file CSV-nya sudah tidak ada (DB = cermin folder HDFS)."""
    from psycopg2 import sql

    conn = ingestion.connect(dbname)
    dropped = []
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            for (table,) in cur.fetchall():
                if table not in keep:
                    cur.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(table)))
                    dropped.append(table)
    finally:
        conn.close()
    return dropped
