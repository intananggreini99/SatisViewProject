"""Konfigurasi pytest: path paket & kontrak, server WebHDFS tiruan, PostgreSQL opsional.

Jalankan dari root repo:
    pip install -r airflow/requirements.txt pytest
    pytest airflow/tests -q

Tes integrasi PostgreSQL berjalan bila variabel SATISVIEW_TEST_PG_HOST di-set
(mis. ke container postgres: SATISVIEW_TEST_PG_HOST=localhost SATISVIEW_TEST_PG_PORT=5433).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "airflow" / "include"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("SATISVIEW_CONTRACT_FILE", str(ROOT / "contracts" / "data_contract.json"))


@pytest.fixture
def fake_hdfs(tmp_path, monkeypatch):
    from fake_webhdfs import FakeWebHdfs

    server = FakeWebHdfs(tmp_path / "hdfs").start()
    monkeypatch.setattr("satisview.config.WEBHDFS_URL", server.url)
    yield server
    server.stop()


@pytest.fixture
def pg_config(monkeypatch):
    host = os.getenv("SATISVIEW_TEST_PG_HOST")
    if not host:
        pytest.skip("SATISVIEW_TEST_PG_HOST tidak di-set: tes PostgreSQL dilewati")
    monkeypatch.setattr("satisview.config.PG_HOST", host)
    monkeypatch.setattr("satisview.config.PG_PORT", int(os.getenv("SATISVIEW_TEST_PG_PORT", "5432")))
    monkeypatch.setattr("satisview.config.PG_USER", os.getenv("SATISVIEW_TEST_PG_USER", "satisview"))
    monkeypatch.setattr("satisview.config.PG_PASSWORD", os.getenv("SATISVIEW_TEST_PG_PASSWORD", "satisview"))
    return host


@pytest.fixture(scope="session")
def sample_frames():
    from data_sintetis import build_sample_frames

    return build_sample_frames()


def lewat_csv(tabel: dict[str, pd.DataFrame], folder: Path, baca_persis: bool = False) -> dict[str, pd.DataFrame]:
    """Tulis lalu baca ulang CSV, sama seperti pipeline (antar-task lewat file)."""
    folder.mkdir(parents=True, exist_ok=True)
    hasil = {}
    for nama, df in tabel.items():
        path = folder / f"{nama}.csv"
        df.to_csv(path, index=False)
        hasil[nama] = pd.read_csv(path, keep_default_na=False, na_values=[""]) if baca_persis else pd.read_csv(path)
    return hasil


@pytest.fixture(scope="session")
def hasil_preprocessing(sample_frames, tmp_path_factory):
    """{key: (tabel_csv{stem: df}, meta)} untuk kelima kelompok (data contoh)."""
    from satisview.preprocessing import run_preprocessing
    from satisview.respondents import GROUPS

    hasil = {}
    for group in GROUPS:
        tabel, meta = run_preprocessing(sample_frames[group.key], group)
        hasil[group.key] = (lewat_csv(tabel, tmp_path_factory.mktemp(f"pre_{group.key}")), meta)
    return hasil


@pytest.fixture(scope="session")
def hasil_analisis(hasil_preprocessing, tmp_path_factory):
    """{key: (tabel_csv{stem: df}, info)} — analisis kode tim untuk kelima kelompok."""
    from satisview.analysis import run_analysis
    from satisview.respondents import GROUPS

    hasil = {}
    for group in GROUPS:
        tabel_pre, meta = hasil_preprocessing[group.key]
        tabel, info = run_analysis(tabel_pre, meta, group)
        hasil[group.key] = (lewat_csv(tabel, tmp_path_factory.mktemp(f"an_{group.key}"), baca_persis=True), info)
    return hasil
