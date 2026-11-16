"""Titik sambung modul preprocessing & analisis yang dipanggil pipeline.

Secara bawaan pipeline menjalankan **kode tim dari Preprocessing&Analysis.zip**
(``satisview/tim/``) lewat adapter ``satisview.preprocessing`` dan
``satisview.analysis``. Modul lain boleh dipakai selama punya fungsi::

    def run_preprocessing(raw_df, group, options=None) -> (tabel, meta)
        # tabel = {nama_file_tanpa_.csv: DataFrame}, meta = dict (JSON)

    def run_analysis(tabel_preprocessing, meta, group, options=None) -> (tabel, info)
        # tabel = {nama_file_tanpa_.csv: DataFrame}; info = dict (boleh dihilangkan)

Aktifkan di ``.env`` (contoh siap pakai: ``satisview/custom/contoh_adapter.py``)::

    SATISVIEW_PREPROCESSING_MODULE=satisview.custom.contoh_adapter
    SATISVIEW_ANALYSIS_MODULE=satisview.custom.contoh_adapter

lalu ``docker compose restart airflow-scheduler``. File yang wajib ada beserta
kolomnya diperiksa task validasi terhadap ``contracts/data_contract.json``.
"""

from __future__ import annotations

import importlib
from typing import Callable

from . import config


def _load(module_name: str, func_name: str) -> Callable:
    module = importlib.import_module(module_name)
    try:
        return getattr(module, func_name)
    except AttributeError as exc:
        raise AttributeError(
            f"Modul '{module_name}' harus memiliki fungsi '{func_name}' (lihat satisview/plugins.py)."
        ) from exc


def get_preprocessor() -> Callable:
    return _load(config.PREPROCESSING_MODULE, "run_preprocessing")


def get_analyzer() -> Callable:
    return _load(config.ANALYSIS_MODULE, "run_analysis")
