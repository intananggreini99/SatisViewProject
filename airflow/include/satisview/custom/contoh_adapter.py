"""Contoh adapter: menambah langkah sendiri di sekitar kode tim.

Aktifkan dengan menulis di .env:
    SATISVIEW_PREPROCESSING_MODULE=satisview.custom.contoh_adapter
    SATISVIEW_ANALYSIS_MODULE=satisview.custom.contoh_adapter
lalu: docker compose restart airflow-scheduler

Pola yang disarankan: panggil kode tim (``satisview.preprocessing`` /
``satisview.analysis``) agar file yang dibaca dashboard tetap lengkap, lalu
tambahkan langkah baru sebelum/sesudahnya.
"""

from __future__ import annotations

import pandas as pd

from satisview.analysis import run_analysis as analisis_tim
from satisview.preprocessing import run_preprocessing as preprocessing_tim


def run_preprocessing(raw_df: pd.DataFrame, group, options: dict | None = None):
    # Contoh langkah SEBELUM kode tim, mis. menyeragamkan penulisan nama prodi:
    # raw_df["Program Studi"] = raw_df["Program Studi"].replace({"Sains Data": "D4 Sains Data Terapan"})
    tabel, meta = preprocessing_tim(raw_df, group, options)
    return tabel, meta


def run_analysis(tabel: dict[str, pd.DataFrame], meta: dict, group, options: dict | None = None):
    hasil, info = analisis_tim(tabel, meta, group, options)

    # Tabel tambahan otomatis ikut divalidasi longgar, disimpan ke HDFS dan
    # dimuat ke PostgreSQL (satu DataFrame = satu file CSV = satu tabel). Contoh:
    # komentar = hasil[f"teks_bersih_{group.key}"]
    # hasil[f"panjang_komentar_{group.key}"] = komentar.assign(
    #     jumlah_kata=komentar["teks_bersih"].fillna("").str.split().str.len()
    # )[["id_komentar", "jumlah_kata"]]
    return hasil, info
