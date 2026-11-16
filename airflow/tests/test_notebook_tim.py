"""Bukti port = notebook tim.

Notebook asli tim (folder ``analisis/`` di root repo) dijalankan apa adanya pada
data contoh Mahasiswa, lalu ke-16 file CSV-nya dibandingkan dengan keluaran
pipeline Airflow untuk data yang sama (segmen "Semua"; kolom tambahan pipeline
diabaikan). Grafik matplotlib diganti objek kosong karena tidak memengaruhi angka.
"""

from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import pandas as pd
import pytest

from satisview import contract
from satisview.analysis import SEMUA, run_analysis
from satisview.preprocessing import run_preprocessing
from satisview.respondents import get_group
from data_sintetis import build_mahasiswa

ROOT = Path(__file__).resolve().parents[2]
NB_DIR = ROOT / "analisis"
NOTEBOOK = [
    "preprocssing-mahasiswa-finalpakeygini.ipynb",
    "text-analytics-mahasiswa.ipynb",
    "priority-analysis-mahasiswa.ipynb",
    "mds-mahasiswa.ipynb",
]
pytestmark = pytest.mark.skipif(
    not all((NB_DIR / nb).exists() for nb in NOTEBOOK), reason="notebook tim (folder analisis/) tidak ada"
)


class _Kosong:
    """Pengganti objek matplotlib: dapat dipanggil, diakses, dan di-unpack."""

    def __call__(self, *args, **kwargs):
        return self

    def __getattr__(self, nama):
        return self

    def __iter__(self):
        return iter((self, self))


def _stub_matplotlib(monkeypatch):
    mpl = types.ModuleType("matplotlib")
    plt = types.ModuleType("matplotlib.pyplot")
    plt.__getattr__ = lambda nama: _Kosong()
    mpl.pyplot = plt
    monkeypatch.setitem(sys.modules, "matplotlib", mpl)
    monkeypatch.setitem(sys.modules, "matplotlib.pyplot", plt)


def _jalankan_notebook(path: Path) -> None:
    nb = json.loads(path.read_text(encoding="utf-8"))
    ns = {"__name__": "__notebook__", "display": lambda *a, **k: None}
    for i, sel in enumerate(nb["cells"]):
        kode = "".join(sel["source"]) if sel["cell_type"] == "code" else ""
        if kode.strip():
            exec(compile(kode, f"{path.name}[sel {i}]", "exec"), ns)


@pytest.fixture(scope="module")
def keluaran(tmp_path_factory):
    kerja = tmp_path_factory.mktemp("notebook_tim")
    df_raw = build_mahasiswa()
    (kerja / "data" / "raw").mkdir(parents=True)
    df_raw.to_excel(kerja / "data" / "raw" / "Pelayanan Kepuasan - Mahasiswa.xlsx", index=False)

    mp = pytest.MonkeyPatch()
    try:
        _stub_matplotlib(mp)
        mp.chdir(kerja)
        for nb in NOTEBOOK:
            _jalankan_notebook(NB_DIR / nb)
    finally:
        mp.undo()

    # pipeline: XLSX -> preprocessing -> CSV -> analisis (seperti task Airflow)
    group = get_group("mahasiswa")
    tabel, meta = run_preprocessing(pd.read_excel(kerja / "data" / "raw" / "Pelayanan Kepuasan - Mahasiswa.xlsx"), group)
    pre_dir = kerja / "pipeline_pre"
    pre_dir.mkdir()
    for stem, df in tabel.items():
        df.to_csv(pre_dir / f"{stem}.csv", index=False)
    tabel_pre = {stem: pd.read_csv(pre_dir / f"{stem}.csv") for stem in tabel}
    hasil, _ = run_analysis(tabel_pre, meta, group)
    an_dir = kerja / "pipeline_analisis"
    an_dir.mkdir()
    for stem, df in hasil.items():
        df.to_csv(an_dir / f"{stem}.csv", index=False)
    return kerja, pre_dir, an_dir


FILE_PREPROCESSING = [
    "likert_mahasiswa_utama_clean", "likert_mahasiswa_klinik_clean", "teks_mahasiswa_clean", "kategori_mahasiswa_clean",
    "kamus_item_aspek_mahasiswa", "skor_aspek_mahasiswa", "ringkasan_item_mahasiswa", "ringkasan_aspek_mahasiswa",
]


@pytest.mark.parametrize("stem", FILE_PREPROCESSING)
def test_preprocessing_identik_dengan_notebook(keluaran, stem):
    kerja, pre_dir, _ = keluaran
    notebook = pd.read_csv(kerja / "data" / "clean" / f"{stem}.csv")
    pipeline = pd.read_csv(pre_dir / f"{stem}.csv")
    pd.testing.assert_frame_equal(pipeline, notebook, check_dtype=False)


@pytest.mark.parametrize(
    "nama, kolom_segmen",
    [
        ("teks_bersih", "segmen_responden"),
        ("aspek_komentar", "segmen_responden"),
        ("frekuensi_aspek", "segmen"),
        ("prioritas_aspek", "segmen"),
        ("mds_responden", "segmen_responden"),
        ("mds_vektor_aspek", "segmen"),
        ("mds_titik_aspek", "segmen"),
        ("mds_stress", "segmen"),
    ],
)
def test_analisis_identik_dengan_notebook(keluaran, nama, kolom_segmen):
    kerja, _, an_dir = keluaran
    stem = contract.file_name("analisis", nama, "mahasiswa")
    notebook = pd.read_csv(kerja / "data" / "analytics" / f"{stem}.csv")
    pipeline = pd.read_csv(an_dir / f"{stem}.csv")
    if kolom_segmen == "segmen":
        pipeline = pipeline[pipeline["segmen"] == SEMUA]
    if nama == "mds_stress":  # pipeline menambah baris MDS aspek 3D
        pipeline = pipeline[pipeline["analisis"].isin(notebook["analisis"])]
    pipeline = pipeline[list(notebook.columns)].reset_index(drop=True)
    pd.testing.assert_frame_equal(pipeline, notebook, check_dtype=False)
