"""Fungsi analisis tim: text analytics, priority analysis, MDS."""

import numpy as np
import pandas as pd
import pytest
from sklearn.metrics.pairwise import euclidean_distances

from satisview.tim import mds
from satisview.tim import priority_analysis as pa
from satisview.tim import text_analytics as ta
from satisview.tim.konfigurasi import konfigurasi


# ---------------------------------------------------------- text analytics
def test_preprocessing_teks_tahapan_tim():
    token = ta.preprocessing_teks("Wi-Fi di gedung D4 gak stabil, tolong diperbaiki!! https://contoh.id")
    assert "wifi" in token  # "wi-fi" diseragamkan
    assert "tidak" not in token and "tolong" not in token  # slang -> baku -> stopword
    assert "baik" in token  # "diperbaiki" di-stem Sastrawi
    assert all(t.isalpha() and len(t) > 1 for t in token)  # angka, tanda baca, URL dibuang


def test_deteksi_aspek_banyak_aspek_dan_frasa():
    frasa = ta.bangun_aspek_frasa(konfigurasi("mahasiswa").aspek_kata_kunci)
    token = ta.preprocessing_teks("Parkir motor penuh dan wifi di kelas sering lemot")
    aspek = ta.deteksi_aspek(token, frasa)
    assert "Parkir kampus" in aspek and "TIK dan Sistem Informasi kampus" in aspek
    assert ta.ada_frasa(["ruang", "kuliah", "panas"], ["ruang", "kuliah"])
    assert not ta.ada_frasa(["ruang", "panas", "kuliah"], ["ruang", "kuliah"])


def test_frekuensi_tanpa_komentar_tidak_membagi_nol():
    kosong = pd.DataFrame({"aspek": pd.Series([], dtype=object)})
    frek = ta.hitung_frekuensi(kosong, ["A", "B"])
    assert frek["frekuensi"].tolist() == [0, 0] and frek["persen_komentar"].tolist() == [0.0, 0.0]
    assert frek["ranking"].tolist() == [1, 2]


def test_kata_kunci_otomatis_untuk_aspek_tanpa_kamus():
    efektif, peringatan = ta.lengkapi_kata_kunci({}, ["Pembayaran"], None)
    assert "bayar" in efektif["Pembayaran"] and peringatan
    frasa = ta.bangun_aspek_frasa(efektif)
    assert ta.deteksi_aspek(ta.preprocessing_teks("pembayaran termin sering terlambat"), frasa) == ["Pembayaran"]


# --------------------------------------------------------- priority analysis
def _prioritas(frek_c=6):
    df_aspek = pd.DataFrame({"aspek": ["A", "B", "C"], "rata_rata": [2.0, 3.0, 4.0], "jumlah_item": [1, 1, 1]})
    df_kategori = pd.DataFrame(
        {"response_id": ["R1", "R1", "R2", "R3"], "jenis_pertanyaan": "prioritas", "pilihan": ["A", "B", "A", "C"]}
    )
    df_frek = pd.DataFrame({"aspek": ["A", "B", "C"], "frekuensi": [10, 0, frek_c]})
    return pa.jalankan_priority_analysis(df_aspek, df_kategori, df_frek, {})


def test_skor_prioritas_rumus_tim():
    prior, info = _prioritas()
    p = prior.set_index("aspek")
    assert p.loc["A", "persen_dipilih"] == pytest.approx(66.7)
    assert p.loc["A", "skor_prioritas"] == pytest.approx(1.0)
    # C: ketidakpuasan 0, pilihan 0, komentar 6/10 -> 0.6/3
    assert p.loc["C", "skor_prioritas"] == pytest.approx(0.2)
    assert p.loc["B", "skor_prioritas"] == pytest.approx(round(0.5 / 3, 3))
    assert prior["aspek"].tolist() == ["A", "C", "B"] and prior["ranking"].tolist() == [1, 2, 3]
    assert prior["level_prioritas"].tolist() == ["Tinggi", "Sedang", "Rendah"]
    assert p.loc["A", "kuadran"] == "Prioritas Utama" and p.loc["B", "kuadran"] == "Sudah Cukup"
    assert info["total_responden_kategori"] == 3


def test_aspek_tanpa_skor_tidak_menjadi_prioritas_utama():
    df_aspek = pd.DataFrame({"aspek": ["A", "Klinik"], "rata_rata": [3.0, np.nan], "jumlah_item": [1, 1]})
    kosong = pd.DataFrame(columns=["response_id", "jenis_pertanyaan", "pilihan"])
    prior, info = pa.jalankan_priority_analysis(df_aspek, kosong, pd.DataFrame({"aspek": ["A"], "frekuensi": [1]}), {})
    assert prior["aspek"].tolist() == ["A"] and info["aspek_tanpa_data"] == ["Klinik"]


def test_pemetaan_pilihan_kata_kunci_tim():
    kata = konfigurasi("mahasiswa").kata_pilihan
    aspek = list(kata)
    assert pa.cocokkan_pilihan("Area parkir", kata, aspek) == "Parkir kampus"
    assert pa.cocokkan_pilihan("Pilihan asing", kata, aspek) == pa.TIDAK_TERPETAKAN
    # pilihan form Dosen/Karyawan = nama aspek
    assert pa.cocokkan_pilihan("SDM/Kepegawaian", {}, ["SDM/Kepegawaian"]) == "SDM/Kepegawaian"


# ------------------------------------------------------------------- MDS
def test_stress1_nol_untuk_konfigurasi_sempurna():
    titik = np.array([[0.0, 0.0], [3.0, 0.0], [0.0, 4.0]])
    assert mds.hitung_stress1(euclidean_distances(titik), titik) == 0
    assert [mds.interpretasi_stress(v) for v in (0.01, 0.07, 0.15, 0.3)] == ["sangat baik", "baik", "cukup", "kurang baik"]


def _skor_acak(n=40, seed=1):
    rng = np.random.default_rng(seed)
    data = rng.integers(1, 5, size=(n, 5)).astype(float)
    df = pd.DataFrame(data, columns=list("ABCDE"))
    df.insert(0, "response_id", [f"R{i}" for i in range(n)])
    return df


def test_siapkan_matriks_membuang_aspek_kosong_lebih_dari_separuh():
    df = _skor_acak()
    df.loc[: len(df) // 2 + 1, "E"] = np.nan
    df.loc[0, "A"] = np.nan
    matriks, kolom, dibuang = mds.siapkan_matriks(df)
    assert dibuang == ["E"] and kolom == list("ABCD")
    assert len(matriks) == len(df) - 1  # responden dengan nilai kosong dibuang


def test_mds_reprodusibel_random_state_42():
    matriks, kolom, _ = mds.siapkan_matriks(_skor_acak())
    jarak, n_kosong = mds.jarak_antar_aspek(matriks, kolom)
    assert n_kosong == 0 and np.allclose(jarak, jarak.T) and np.all(np.diag(jarak) == 0)
    t1, s1, _ = mds.mds_aspek(jarak, kolom, 2)
    t2, s2, _ = mds.mds_aspek(jarak, kolom, 2)
    pd.testing.assert_frame_equal(t1, t2)
    assert s1 == s2
    t3, s3, _ = mds.mds_aspek(jarak, kolom, 3)
    assert list(t3.columns) == ["aspek", "dim1", "dim2", "dim3"] and s3 <= s1 + 1e-9


def test_korelasi_tak_terdefinisi_dianggap_jarak_satu():
    df = _skor_acak()
    df["C"] = 3.0  # nilai seragam -> korelasi NaN
    matriks, kolom, _ = mds.siapkan_matriks(df)
    jarak, n_kosong = mds.jarak_antar_aspek(matriks, kolom)
    assert n_kosong > 0 and not np.isnan(jarak).any()
    i = kolom.index("C")
    assert np.allclose(np.delete(jarak[i], i), 1.0)


def test_procrustes_menyelaraskan_peta_segmen():
    rng = np.random.default_rng(3)
    acuan = rng.normal(size=(7, 2))
    acuan -= acuan.mean(axis=0)
    sudut = 0.9
    putar = np.array([[np.cos(sudut), -np.sin(sudut)], [np.sin(sudut), np.cos(sudut)]])
    segmen = (acuan @ putar) * np.array([1, -1]) + 5  # diputar, dicerminkan, digeser
    hasil = mds.selaraskan(segmen, acuan)
    assert np.allclose(hasil, acuan)
    assert np.allclose(euclidean_distances(hasil), euclidean_distances(segmen))  # jarak tidak berubah
