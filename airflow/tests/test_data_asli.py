"""Uji opsional dengan DATA ASLI (salinan folder Google Drive "Data Responden").

Data respons asli memuat data pribadi, jadi tidak disimpan di repositori. Untuk
menguji: unduh folder Drive (klik kanan "Data Responden" -> Download), ekstrak,
lalu jalankan::

    SATISVIEW_DATA_ASLI=/path/ke/Data\\ Responden pytest airflow/tests/test_data_asli.py -q

Setiap sheet (.xlsx/.csv) dikenali dari namanya seperti di pipeline, lalu melewati
preprocessing -> validasi -> analisis -> validasi kode tim.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import pytest

from satisview.analysis import run_analysis
from satisview.preprocessing import run_preprocessing
from satisview.respondents import GROUPS, match_group_for_filename
from satisview.validation import validate_analysis, validate_preprocessed

from conftest import lewat_csv

FOLDER = os.getenv("SATISVIEW_DATA_ASLI")
pytestmark = pytest.mark.skipif(not FOLDER, reason="SATISVIEW_DATA_ASLI tidak di-set: uji data asli dilewati")


def _sheet() -> dict[str, Path]:
    hasil: dict[str, Path] = {}
    for path in sorted(Path(FOLDER or ".").iterdir()):
        if path.suffix.lower() in (".xlsx", ".csv") and (group := match_group_for_filename(path.stem)):
            hasil.setdefault(group.key, path)
    return hasil


@pytest.mark.parametrize("group", GROUPS, ids=[g.key for g in GROUPS])
def test_data_asli_lolos_seluruh_tahap(group, tmp_path):
    path = _sheet().get(group.key)
    if path is None:
        pytest.skip(f"sheet {group.label} tidak ada di folder")
    raw = pd.read_excel(path) if path.suffix.lower() == ".xlsx" else pd.read_csv(path)

    tabel, meta = run_preprocessing(raw, group)
    assert not meta["kolom"]["tidak_ditemukan"], meta["kolom"]["tidak_ditemukan"]
    laporan = validate_preprocessed(lewat_csv(tabel, tmp_path / "pre", baca_persis=True), meta, group.key)
    assert laporan.passed, laporan.errors
    if meta["n_responden"] == 0:
        assert laporan.status == "kosong"
        return

    hasil, info = run_analysis(lewat_csv(tabel, tmp_path / "pre2"), meta, group)
    ringkasan = lewat_csv({"r": tabel[meta["file"]["ringkasan_aspek"]]}, tmp_path / "r", baca_persis=True)["r"]
    lap = validate_analysis(lewat_csv(hasil, tmp_path / "an", baca_persis=True), meta, group.key, info=info,
                            ringkasan_aspek=ringkasan)
    assert lap.passed, lap.errors
