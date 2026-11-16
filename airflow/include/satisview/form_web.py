"""Raw data respon kuisioner dari **form web SatisView**.

Alur (diagram arsitektur): FORM -> Kafka Topic -> Kafka Consumer
(batching_deduplication_dataValidation -> HDFS_writer -> data_validation ->
committed_offset) -> HDFS ``/satisview/raw/form_web/<responden>/batch_*.csv``.

Setiap file batch punya kolom yang sama persis dengan sheet respons Google Form
(lihat contracts/kuesioner.json) ditambah kolom metadata berawalan ``_``.
Modul ini menggabungkan batch tersebut untuk preprocessing dan ingestion.
"""

from __future__ import annotations

import hashlib
import io
import logging

import pandas as pd

from .config import HdfsPaths
from .hdfs import WebHdfsClient

log = logging.getLogger(__name__)

KOLOM_ID = "_id_respons"
KOLOM_DITERIMA = "_diterima_pada"
KOLOM_SUMBER = "Sumber"
SUMBER_GOOGLE_FORM = "Google Form"
SUMBER_FORM_WEB = "Form Web SatisView"


def daftar_batch(hdfs: WebHdfsClient, key: str) -> list[dict]:
    folder = HdfsPaths.form_web_dir(key)
    if not hdfs.exists(folder):
        return []
    files = [
        {"path": f"{folder}/{st['pathSuffix']}", "nama": st["pathSuffix"], "mtime": st.get("modificationTime", 0),
         "ukuran": st.get("length", 0)}
        for st in hdfs.list(folder)
        if st.get("type") == "FILE" and st["pathSuffix"].endswith(".csv") and not st["pathSuffix"].endswith("._COPYING_")
    ]
    return sorted(files, key=lambda f: f["nama"])


def jejak(hdfs: WebHdfsClient, key: str) -> str:
    """Sidik isi folder form web (berubah bila ada batch baru)."""
    isi = "\n".join(f"{f['nama']}|{f['ukuran']}|{f['mtime']}" for f in daftar_batch(hdfs, key))
    return hashlib.sha1(isi.encode()).hexdigest() if isi else ""


def baca(hdfs: WebHdfsClient, key: str, *, sebagai_teks: bool = False) -> pd.DataFrame:
    """Gabungan semua batch form web, tanpa duplikat ``_id_respons``, urut waktu diterima.

    ``sebagai_teks=True``  -> semua sel string (untuk ingestion raw_data)
    ``sebagai_teks=False`` -> tipe dikenali pandas seperti membaca sheet (untuk preprocessing)
    """
    frames = []
    for f in daftar_batch(hdfs, key):
        data = hdfs.read_bytes(f["path"])
        if sebagai_teks:
            df = pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False, na_values=[""], encoding="utf-8")
        else:
            df = pd.read_csv(io.BytesIO(data), encoding="utf-8")
        frames.append(df)
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True, sort=False)
    sebelum = len(df)
    df = df.drop_duplicates(subset=[KOLOM_ID], keep="first")
    if len(df) != sebelum:
        log.warning("[%s] %s baris form web ganda (id_respons sama) dibuang", key, sebelum - len(df))
    df = df.sort_values(KOLOM_DITERIMA, kind="stable").reset_index(drop=True)
    if not sebagai_teks and "Timestamp" in df.columns:
        df["Timestamp"] = pd.to_datetime(df["Timestamp"], format="%Y-%m-%d %H:%M:%S", errors="coerce")
    return df


def tanpa_metadata(df: pd.DataFrame) -> pd.DataFrame:
    return df[[c for c in df.columns if not str(c).startswith("_")]]


def gabung(drive: pd.DataFrame | None, web: pd.DataFrame, *, tandai_sumber: bool = False) -> pd.DataFrame:
    """Respons Google Form (Drive) + respons form web, kolom mengikuti sheet Drive."""
    bagian = []
    if drive is not None:
        d = drive.copy()
        if tandai_sumber:
            d[KOLOM_SUMBER] = SUMBER_GOOGLE_FORM
        bagian.append(d)
    if len(web):
        w = tanpa_metadata(web).copy()
        if tandai_sumber:
            w[KOLOM_SUMBER] = SUMBER_FORM_WEB
        bagian.append(w)
    if not bagian:
        return pd.DataFrame()
    kolom = list(bagian[0].columns)
    for b in bagian[1:]:
        kolom += [c for c in b.columns if c not in kolom]
    isi = [b for b in bagian if len(b)]  # sheet berisi judul saja tidak ikut digabung (hanya urutan kolomnya)
    if not isi:
        return bagian[0].reset_index(drop=True)
    return pd.concat(isi, ignore_index=True, sort=False).reindex(columns=kolom)
