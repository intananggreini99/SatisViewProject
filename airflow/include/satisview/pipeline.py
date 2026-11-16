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

from . import config, form_web, gdrive, ingestion, plugins
from .config import HdfsPaths
from .hdfs import WebHdfsClient
from .respondents import GROUPS, get_group, match_group_for_filename
from .validation import ValidationFailed, ValidationReport, validate_analysis, validate_preprocessed

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


def _raw_gabungan(hdfs: WebHdfsClient, key: str, *, sebagai_teks: bool, tandai_sumber: bool = False) -> tuple[pd.DataFrame, dict]:
    """Raw data respon kuisioner = sheet Google Form (dari Drive) + respons form web (dari Kafka).

    Kolom keduanya sama persis (contracts/kuesioner.json), jadi baris form web
    tinggal disambung di bawah baris Google Form.
    """
    drive = None
    path = HdfsPaths.raw_csv(key) if sebagai_teks else HdfsPaths.raw_xlsx(key)
    if hdfs.exists(path):
        if sebagai_teks:
            drive = ingestion.read_csv_as_text(hdfs.read_bytes(path))
        else:
            local = hdfs.download(path, config.STAGING_DIR / key / f"kuisioner_{key}.xlsx")
            drive = pd.read_excel(local)  # sama seperti notebook: pd.read_excel(RAW_PATH)
    web = form_web.baca(hdfs, key, sebagai_teks=sebagai_teks)
    if drive is None and not len(web):
        raise SkipGroup(
            f"Raw data {get_group(key).label} belum ada di HDFS ({path} maupun {HdfsPaths.form_web_dir(key)})."
        )
    df = form_web.gabung(drive, web, tandai_sumber=tandai_sumber)
    sumber = {"google_form": 0 if drive is None else int(len(drive)), "form_web": int(len(web))}
    log.info("[%s] raw data: %s baris Google Form + %s baris form web", key, sumber["google_form"], sumber["form_web"])
    return df, sumber


def step_preprocessing(key: str) -> dict:
    """(c) Ambil raw data dari HDFS (Google Form + form web) lalu jalankan kode preprocessing tim."""
    group = get_group(key)
    hdfs = _hdfs()
    work = _work_dir(key, "preprocessed")
    raw_df, sumber = _raw_gabungan(hdfs, key, sebagai_teks=False)

    preprocess = plugins.get_preprocessor()
    tabel, meta = preprocess(raw_df, group)
    meta["sumber_raw"] = sumber
    files = _tulis_tabel(work, tabel)
    meta_path = _write_json(work / f"meta_preprocessing_{key}.json", meta)
    return {
        "responden": key,
        "file": files,
        "meta": str(meta_path),
        "baris": int(meta.get("n_responden", 0)),
        "sumber_raw": sumber,
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
    """(f) Raw data kuisioner (Google Form + form web, di HDFS) -> database raw_data.

    Satu kelompok = satu tabel ``kuisioner_<responden>`` dengan kolom sheet asli
    ditambah kolom ``Sumber`` (Google Form / Form Web SatisView). Kolom data
    pribadi responden (mis. "Nomor Gopay") tidak ikut dimuat ke PostgreSQL yang
    dibaca dashboard; arsip lengkapnya tetap di HDFS (raw zone).
    """
    group = get_group(key)
    hdfs = _hdfs()
    df, sumber = _raw_gabungan(hdfs, key, sebagai_teks=True)
    pribadi = kolom_pribadi(df, key)
    if pribadi:
        log.info("[%s] kolom data pribadi tidak dimuat ke PostgreSQL: %s", key, pribadi)
    df = df.drop(columns=pribadi)
    df[form_web.KOLOM_SUMBER] = (
        [form_web.SUMBER_GOOGLE_FORM] * sumber["google_form"] + [form_web.SUMBER_FORM_WEB] * sumber["form_web"]
    )
    asal = f"hdfs://{HdfsPaths.raw_csv(key)} + hdfs://{HdfsPaths.form_web_dir(key)}"
    hasil = ingestion.load_dataframe(config.RAW_DB, group.raw_table, df, asal)
    return {**hasil, "sumber_raw": sumber, "kolom_pribadi_tidak_dimuat": pribadi}


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


# ======================================================== validation_ingestion
def _tabel_pg(dbname: str) -> dict[str, dict]:
    """Tabel di database: {nama: {"baris": n, "kolom": [nama kolom asli...]}}."""
    from psycopg2 import sql

    conn = ingestion.connect(dbname)
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            hasil = {}
            for (tabel,) in cur.fetchall():
                cur.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(tabel)))
                baris = cur.fetchone()[0]
                # nama kolom asli disimpan di COMMENT bila dipendekkan (batas 63 byte PostgreSQL)
                cur.execute(
                    """SELECT a.attname, col_description(a.attrelid, a.attnum)
                         FROM pg_attribute a
                        WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped
                        ORDER BY a.attnum""",
                    (f'public."{tabel}"',),
                )
                kolom = [komentar or nama for nama, komentar in cur.fetchall()]
                hasil[tabel] = {"baris": int(baris), "kolom": kolom}
            return hasil
    finally:
        conn.close()


def _simpan_laporan_ingestion(hdfs: WebHdfsClient, key: str, rep: ValidationReport, nama: str) -> dict:
    local = config.STAGING_DIR / key / nama
    _laporkan(hdfs, key, rep.finish(), local)  # raise ValidationFailed bila gagal
    return {"responden": key, "validasi": rep.status, **rep.statistik}


def validate_ingestion_raw(key: str) -> dict:
    """(g) validation_ingestion: tabel raw_data.kuisioner_<responden> = raw data di HDFS.

    Diperiksa: jumlah baris (Google Form + form web), kolom sama dengan sheet,
    tidak ada kolom data pribadi, dan proporsi sumber sesuai.
    """
    group = get_group(key)
    hdfs = _hdfs()
    df, sumber = _raw_gabungan(hdfs, key, sebagai_teks=True)
    pribadi = set(kolom_pribadi(df, key))
    harapan_kolom = [c for c in df.columns if c not in pribadi] + [form_web.KOLOM_SUMBER]
    rep = ValidationReport(tahap="ingestion_raw", responden=key)
    tabel = _tabel_pg(config.RAW_DB).get(group.raw_table)
    if tabel is None:
        rep.error(f"Tabel {config.RAW_DB}.{group.raw_table} tidak ada.")
    else:
        if tabel["baris"] != len(df):
            rep.error(f"{group.raw_table}: {tabel['baris']} baris di PostgreSQL, {len(df)} baris raw data di HDFS.")
        if tabel["kolom"] != harapan_kolom:
            hilang = [c for c in harapan_kolom if c not in tabel["kolom"]]
            asing = [c for c in tabel["kolom"] if c not in harapan_kolom]
            rep.error(f"{group.raw_table}: kolom berbeda (hilang {hilang[:3]}, asing {asing[:3]}).")
        bocor = [c for c in tabel["kolom"] if c in pribadi]
        if bocor:
            rep.error(f"{group.raw_table}: kolom data pribadi ikut dimuat: {bocor}")
        conn = ingestion.connect(config.RAW_DB)
        try:
            from psycopg2 import sql

            with conn, conn.cursor() as cur:
                cur.execute(
                    sql.SQL("SELECT {c}, count(*) FROM {t} GROUP BY {c}").format(
                        c=sql.Identifier(form_web.KOLOM_SUMBER), t=sql.Identifier(group.raw_table)
                    )
                )
                per_sumber = dict(cur.fetchall())
        finally:
            conn.close()
        harapan = {form_web.SUMBER_GOOGLE_FORM: sumber["google_form"], form_web.SUMBER_FORM_WEB: sumber["form_web"]}
        if {k: v for k, v in per_sumber.items() if v} != {k: v for k, v in harapan.items() if v}:
            rep.error(f"{group.raw_table}: jumlah per sumber {per_sumber} != {harapan}.")
    rep.statistik = {"tabel": group.raw_table, "baris": len(df), "sumber_raw": sumber, "kolom_pribadi_dikecualikan": sorted(pribadi)}
    return _simpan_laporan_ingestion(hdfs, key, rep, "validation_ingestion_raw.json")


def validate_ingestion_analysis(key: str) -> dict:
    """(g) validation_ingestion: setiap CSV hasil analisis di HDFS = satu tabel analysis_<responden>."""
    group = get_group(key)
    hdfs = _hdfs()
    folder = HdfsPaths.analysis_dir(key)
    files = sorted(
        f["pathSuffix"] for f in hdfs.list(folder) if f.get("type") == "FILE" and f["pathSuffix"].lower().endswith(".csv")
    ) if hdfs.exists(folder) else []
    if not files:
        raise SkipGroup(f"Belum ada hasil analisis di {folder}.")
    rep = ValidationReport(tahap="ingestion_analysis", responden=key)
    tabel_pg = _tabel_pg(group.analysis_db)
    harapan = set()
    for name in files:
        tabel = ingestion.table_name_for(name)
        harapan.add(tabel)
        csv_df = ingestion.read_csv_as_text(hdfs.read_bytes(f"{folder}/{name}"))
        ada = tabel_pg.get(tabel)
        if ada is None:
            rep.error(f"Tabel {tabel} tidak ada di {group.analysis_db}.")
            continue
        if ada["baris"] != len(csv_df):
            rep.error(f"{tabel}: {ada['baris']} baris di PostgreSQL, {len(csv_df)} baris di {name}.")
        if ada["kolom"] != [str(c) for c in csv_df.columns]:
            rep.error(f"{tabel}: kolom berbeda dengan {name}.")
    sisa = sorted(set(tabel_pg) - harapan)
    if sisa:
        rep.error(f"Tabel tanpa file sumber di HDFS: {sisa}")
    rep.statistik = {"database": group.analysis_db, "tabel": len(files)}
    return _simpan_laporan_ingestion(hdfs, key, rep, "validation_ingestion_analysis.json")


# ================================================================ form web
def cek_form_web_baru() -> dict:
    """Ada batch form web baru di HDFS sejak pemeriksaan terakhir? (DAG form_web_to_pipeline)."""
    hdfs = _hdfs()
    penanda = config.DATA_DIR / "form_web_jejak.json"
    lama = json.loads(penanda.read_text()) if penanda.exists() else {}
    baru = {g.key: form_web.jejak(hdfs, g.key) for g in GROUPS}
    berubah = sorted(k for k, v in baru.items() if v and v != lama.get(k))
    return {"berubah": berubah, "jejak": baru}


def simpan_jejak_form_web(jejak: dict) -> None:
    _write_json(config.DATA_DIR / "form_web_jejak.json", jejak)
