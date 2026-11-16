"""Tahap ``data_preprocessing`` pipeline — menjalankan kode preprocessing TIM.

Kontrak fungsi (dipanggil lewat ``satisview.plugins``)::

    run_preprocessing(raw_df, group, options=None) -> (tabel, meta)

``tabel`` : ``{nama_file_tanpa_.csv: DataFrame}`` — 8 file seperti notebook
            tim (``likert_mahasiswa_utama_clean``, ``teks_mahasiswa_clean``,
            ``kamus_item_aspek_mahasiswa``, ``skor_aspek_mahasiswa``, ...)
``meta``  : peran kolom, skala, hasil ``cek_konversi``, dan pemetaan nama
            logis -> nama file (dipakai validasi & analisis).
"""

from __future__ import annotations

import pandas as pd

from .respondents import RespondentGroup
from .tim import preprocessing as tim_preprocessing
from .tim.konfigurasi import konfigurasi


def run_preprocessing(
    raw_df: pd.DataFrame, group: RespondentGroup, options: dict | None = None
) -> tuple[dict[str, pd.DataFrame], dict]:
    cfg = konfigurasi(group.key)
    tabel, meta = tim_preprocessing.jalankan_preprocessing(raw_df, cfg)
    file = meta["file"]
    meta["dimensi_segmen"] = meta["kolom"]["segmen"] or group.segment_label
    meta["label_responden"] = group.label
    return {file[logis]: df for logis, df in tabel.items()}, meta
