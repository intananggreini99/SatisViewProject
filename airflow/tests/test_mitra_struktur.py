"""Variasi struktur sheet Mitra yang dikenali otomatis.

Form Mitra dibuat anggota tim yang berbeda, jadi preprocessing tidak boleh
bergantung pada satu bentuk: grid ``Judul [butir]`` atau pertanyaan tunggal,
skala 4 tingkat, 5 tingkat berlabel ("Cukup Puas"), atau skala linier 1-5.
Butir Mitra Kerja Sama mengikuti sheet tim "ItemKuisioner" (tab "Mitra KS").
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from satisview.analysis import run_analysis
from satisview.preprocessing import run_preprocessing
from satisview.respondents import get_group
from satisview.tim import preprocessing as pre
from satisview.tim.konfigurasi import konfigurasi
from satisview.validation import validate_analysis, validate_preprocessed

from conftest import lewat_csv

PERTANYAAN_MKS = [
    "Bagaimana tingkat kepuasan Anda terhadap komunikasi dan kecepatan respons pihak kampus selama kerja sama?",
    "Bagaimana tingkat kepuasan Anda terhadap kemudahan proses administrasi dan koordinasi kerja sama?",
    "Bagaimana tingkat kepuasan Anda terhadap kesesuaian pelaksanaan kegiatan dengan rencana atau kesepakatan bersama?",
    "Bagaimana tingkat kepuasan Anda terhadap kompetensi dan profesionalisme dosen, tenaga kependidikan, dan/atau mahasiswa yang terlibat?",
    "Bagaimana tingkat kepuasan Anda terhadap kualitas hasil atau luaran yang dihasilkan dari kerja sama?",
    "Bagaimana tingkat kepuasan Anda terhadap manfaat kerja sama dalam mendukung kebutuhan, kegiatan, atau pengembangan institusi/usaha/masyarakat Anda?",
    "Bagaimana tingkat kepuasan Anda terhadap kontribusi kerja sama dalam membantu menyelesaikan permasalahan atau kebutuhan nyata mitra?",
    "Bagaimana tingkat kepuasan Anda terhadap kesesuaian kegiatan kerja sama dengan program pemerintah, prioritas pembangunan, atau kebutuhan masyarakat yang relevan?",
    "Bagaimana tingkat kepuasan Anda terhadap potensi keberlanjutan dan pengembangan hasil kerja sama setelah kegiatan selesai?",
    "Secara keseluruhan, bagaimana tingkat kepuasan Anda terhadap kerja sama yang telah dilaksanakan dengan kampus?",
]
SARAN_MKS = (
    "Apa hal utama yang perlu diperbaiki atau dikembangkan agar kerja sama berikutnya memberikan manfaat dan "
    "dampak yang lebih besar bagi mitra?"
)
LABEL_5 = ["Sangat Tidak Puas", "Tidak Puas", "Cukup Puas", "Puas", "Sangat Puas"]
KOMENTAR = [
    "Komunikasi dengan pihak kampus kadang lambat dibalas",
    "Mohon tindak lanjut hasil kerja sama lebih rutin",
    "Manfaat program sangat terasa bagi masyarakat",
    "Proses administrasi MoU perlu dipercepat",
    "",
]


def _sheet_mitra_ks(n: int = 40, seed: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    data = {
        "Timestamp": pd.date_range("2026-09-01", periods=n, freq="6h").strftime("%d/%m/%Y %H:%M:%S"),
        "Nama Instansi": [f"Instansi {i}" for i in range(n)],
        "Jenis Instansi": rng.choice(["Industri", "Pemerintah", "Perguruan Tinggi"], n),
    }
    for i, q in enumerate(PERTANYAAN_MKS):
        skor = np.clip(np.round(rng.normal(3.6 + 0.05 * i, 0.8, n)), 1, 5).astype(int)
        data[q] = [LABEL_5[s - 1] for s in skor]
    data[SARAN_MKS] = rng.choice(KOMENTAR, n)
    return pd.DataFrame(data)


def test_pertanyaan_tunggal_skala_lima_berlabel():
    df = _sheet_mitra_ks()
    kolom = pre.tentukan_kolom(df, konfigurasi("mitra_kerjasama"))
    assert kolom.likert_utama == PERTANYAAN_MKS
    assert kolom.segmen == "Jenis Instansi"
    assert "Nama Instansi" in kolom.pii and SARAN_MKS in kolom.teks.values()

    tabel, meta = pre.jalankan_preprocessing(df, konfigurasi("mitra_kerjasama"))
    assert meta["skala"] == {"min": 1, "maks": 5}
    cek = meta["cek_konversi"][0]
    assert cek["terisi_asli"] == cek["setelah_konversi"] == 40 * 10 and cek["di_luar_skala"] == 0
    # Komponen tim (ItemKuisioner) menjadi aspek; 10 butir -> 7 komponen
    assert meta["aspek"] == [
        "Komunikasi dan Koordinasi",
        "Pelaksanaan Kerja Sama",
        "Kualitas Luaran",
        "Manfaat dan Dampak",
        "Relevansi Program",
        "Keberlanjutan Kerja Sama",
        "Kepuasan Keseluruhan",
    ]
    assert tabel["likert_utama"][PERTANYAAN_MKS[0]].between(1, 5).all()


def test_mitra_lima_tingkat_lolos_validasi_dan_analisis(tmp_path):
    group = get_group("mitra_kerjasama")
    tabel, meta = run_preprocessing(_sheet_mitra_ks(), group)
    tabel_csv = lewat_csv(tabel, tmp_path / "pre", baca_persis=True)
    laporan = validate_preprocessed(tabel_csv, meta, group.key)
    assert laporan.passed, laporan.errors

    hasil, info = run_analysis(lewat_csv(tabel, tmp_path / "pre2"), meta, group)
    stem = f"kpi_ringkasan_{group.key}"
    ringkasan = hasil[stem].set_index("segmen").loc["Semua"]
    assert ringkasan["skala_maks"] == 5 and 0 < ringkasan["indeks_total"] <= 100
    lap = validate_analysis(lewat_csv(hasil, tmp_path / "an", baca_persis=True), meta, group.key, info=info,
                            ringkasan_aspek=tabel_csv[meta["file"]["ringkasan_aspek"]])
    assert lap.passed, lap.errors


@pytest.mark.parametrize(
    "jawaban,skala",
    [
        (["1", "2", "3", "4", "5"], (1, 5)),  # skala linier 1-5
        (["1 - Sangat Tidak Puas", "2 - Tidak Puas", "3 - Puas", "4 - Sangat Puas"], (1, 4)),
        (["Sangat Tidak Puas", "Tidak Puas", "Puas", "Sangat Puas"], (1, 4)),
        (["Tidak Puas", "Netral", "Puas", "Sangat Puas"], (1, 5)),
    ],
)
def test_deteksi_skala(jawaban, skala):
    judul = "Pembayaran [Seberapa puas Anda dengan ketepatan waktu pembayaran?]"
    df = pd.DataFrame({"Timestamp": ["1/9/2026"] * 8, judul: (jawaban * 2)[:8]})
    hasil, mapping = pre.deteksi_skala(df, [judul], konfigurasi("mitra_pengadaan"))
    assert hasil == skala
    skor = pre.ambil_skor(df[judul], mapping)
    assert skor.notna().all() and skor.between(*skala).all()


def test_skala_tetap_kelompok_lain_tidak_berubah():
    df = pd.DataFrame({"x [a]": ["5"] * 3})
    assert pre.deteksi_skala(df, ["x [a]"], konfigurasi("mahasiswa"))[0] == (1, 4)


def test_angka_bukan_penilaian_tidak_dianggap_likert():
    df = pd.DataFrame(
        {
            "Timestamp": ["1/9/2026"] * 6,
            "Berapa kali perusahaan Anda mengikuti pengadaan di PENS?": ["1", "2", "3", "2", "5", "1"],
            "Lama menjadi mitra": ["1-2 tahun", "3 tahun", "1-2 tahun", "4 tahun", "3 tahun", "1-2 tahun"],
            "Seberapa puas Anda dengan kejelasan spesifikasi pengadaan?": ["4", "5", "3", "4", "5", "2"],
        }
    )
    kolom = pre.tentukan_kolom(df, konfigurasi("mitra_pengadaan"))
    assert kolom.likert_utama == ["Seberapa puas Anda dengan kejelasan spesifikasi pengadaan?"]
