"""Kode preprocessing tim (port preprocssing-mahasiswa-finalpakeygini.ipynb) untuk 5 kelompok."""

import numpy as np
import pandas as pd
import pytest

import data_sintetis as sample_data
from satisview.tim import preprocessing as pre
from satisview.tim.konfigurasi import konfigurasi


# ------------------------------------------------------------- fungsi tim
def test_ambil_skor_mengambil_angka_di_awal_jawaban():
    hasil = pre.ambil_skor(pd.Series(["4 - Sangat Baik", " 2 - Kurang Baik", "Sangat Baik", None, "abc"]))
    assert hasil.iloc[:2].tolist() == [4, 2]
    assert hasil.iloc[2:].isna().all()  # tanpa mapping label: sama seperti notebook


def test_ambil_skor_label_tanpa_angka_form_dosen():
    hasil = pre.ambil_skor(
        pd.Series(["Sangat Puas", "puas ", "Tidak Puas", "Sangat  Tidak Puas", "Tidak tahu"]),
        konfigurasi("dosen").mapping_likert,
    )
    assert hasil.iloc[:4].tolist() == [4, 3, 2, 1]
    assert np.isnan(hasil.iloc[4])


@pytest.mark.parametrize(
    "judul, aspek",
    [
        ("Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut? [Petugas ramah]", "Administrasi Akademik"),
        ("Bagaimana penilaian Anda terhadap fasilitas dan layanan Perpustakaan berikut? [Koleksi]", "Perpustakaan"),
        ("Bagaimana penilaian Anda terhadap Parkir kampus? [Luas area parkir]", "Parkir kampus"),
        ("Administrasi Akademik [Seberapa puas Anda terhadap kecepatan layanan?]", "Administrasi Akademik"),
        ("[Butir tanpa judul]", pre.TIDAK_TERDETEKSI),
    ],
)
def test_ekstrak_aspek_dari_judul_grid(judul, aspek):
    assert pre.ekstrak_aspek(judul) == aspek


def test_bangun_kamus_kode_item_berurutan():
    kamus = pre.bangun_kamus(["Ruang Kuliah [Kebersihan]", "Ruang Kuliah [Proyektor]"], "ITEM")
    assert kamus["item_kode"].tolist() == ["ITEM_01", "ITEM_02"]
    assert kamus["pertanyaan"].tolist() == ["Kebersihan", "Proyektor"]


# ---------------------------------------------------------- per kelompok
def test_mahasiswa_delapan_file_sesuai_notebook(hasil_preprocessing):
    tabel, meta = hasil_preprocessing["mahasiswa"]
    assert set(tabel) == {
        "likert_mahasiswa_utama_clean", "likert_mahasiswa_klinik_clean", "teks_mahasiswa_clean",
        "kategori_mahasiswa_clean", "kamus_item_aspek_mahasiswa", "skor_aspek_mahasiswa",
        "ringkasan_item_mahasiswa", "ringkasan_aspek_mahasiswa",
    }
    likert = tabel["likert_mahasiswa_utama_clean"]
    assert len(likert) == meta["n_responden"] == 418
    assert likert["response_id"].iloc[0] == "MHS_0001"
    assert list(likert.columns[:4]) == ["response_id", "Timestamp", "Program Studi", "Semester"]
    assert meta["kolom_pii_dibuang"] == ["Nomor Gopay"]
    assert all("Nomor Gopay" not in df.columns for df in tabel.values())

    kamus = tabel["kamus_item_aspek_mahasiswa"]
    klinik = kamus[kamus["aspek"] == "Klinik Kampus"]
    assert len(klinik) == len(sample_data.MAHASISWA_KLINIK[4])
    assert klinik["item_kode"].str.startswith("KLINIK_").all()
    assert len(meta["aspek"]) == len(sample_data.MAHASISWA_GRID) + 1
    assert pre.TIDAK_TERDETEKSI not in set(kamus["aspek"])

    # Bagian klinik hanya berisi responden yang pernah memakai klinik (dropna how="all")
    bersyarat = tabel["likert_mahasiswa_klinik_clean"]
    assert 0 < len(bersyarat) < len(likert)
    assert meta["kolom"]["gating"] == pre.normalisasi_judul(sample_data.MAHASISWA_GATING)
    for cek in meta["cek_konversi"]:
        assert cek["terisi_asli"] == cek["setelah_konversi"] and cek["di_luar_skala"] == 0


def test_skor_dalam_skala_dan_ringkasan_konsisten(hasil_preprocessing):
    for key, (tabel, meta) in hasil_preprocessing.items():
        f = meta["file"]
        kamus = tabel[f["kamus"]]
        likert = tabel[f["likert_utama"]]
        kolom = [k for k in kamus["nama_kolom_asli"] if k in likert.columns]
        nilai = likert[kolom].stack()
        assert nilai.between(1, 4).all(), key
        ra = tabel[f["ringkasan_aspek"]]
        ri = tabel[f["ringkasan_item"]]
        hitung = ri.groupby("aspek")["rata_rata"].mean().round(2)
        assert np.allclose(ra.set_index("aspek")["rata_rata"], hitung.reindex(ra["aspek"]).values), key
        assert ra["rata_rata"].is_monotonic_increasing, key  # notebook: sort_values("rata_rata")


@pytest.mark.parametrize(
    "key, segmen, n_aspek, teks",
    [
        ("dosen", "Departemen", len(sample_data.DOSEN_GRID), {"saran_perbaikan", "saran_birokrasi_hibah"}),
        ("karyawan", "Unit Kerja", len(sample_data.KARYAWAN_GRID), {"saran_perbaikan", "pengembangan_karier"}),
    ],
)
def test_dosen_karyawan_judul_kolom_asli(hasil_preprocessing, key, segmen, n_aspek, teks):
    tabel, meta = hasil_preprocessing[key]
    assert meta["kolom"]["segmen"] == segmen
    assert len(meta["aspek"]) == n_aspek
    assert set(meta["kolom"]["teks"]) == teks
    assert meta["kolom"]["kategori"] and not meta["kolom"]["tidak_ditemukan"]
    teks_df = tabel[meta["file"]["teks"]]
    assert set(teks_df["jenis_pertanyaan"]) == teks
    kategori = tabel[meta["file"]["kategori"]]
    assert not kategori["pilihan"].str.contains(",").any()  # pilihan dipisah koma lalu di-explode


@pytest.mark.parametrize(
    "key, segmen, pii, grid",
    [
        ("mitra_kerjasama", "Jenis Instansi", "Nama Instansi", sample_data.MITRA_KS_GRID),
        ("mitra_pengadaan", "Jenis Penyedia", "Nama Perusahaan", sample_data.MITRA_PB_GRID),
    ],
)
def test_mitra_kolom_dideteksi_otomatis(hasil_preprocessing, key, segmen, pii, grid):
    tabel, meta = hasil_preprocessing[key]
    assert meta["kolom"]["segmen"] == segmen
    assert meta["kolom_pii_dibuang"] == [pii]
    assert meta["aspek"] == [g[0] for g in grid]
    assert len(meta["kolom"]["teks"]) == 1 and len(meta["kolom"]["kategori"]) == 1
    assert len(tabel[meta["file"]["teks"]]) > 0


def test_pii_umum_dibuang_dan_judul_dinormalisasi():
    df = pd.DataFrame(
        {
            "Timestamp": ["2026-10-01 08:00:00"] * 3,
            "Email Address": ["a@contoh.id", "b@contoh.id", "c@contoh.id"],
            "Nama  Lengkap ": ["A", "B", "C"],
            "No. HP": ["0800", "0801", "0802"],
            "Jenis Instansi": ["Industri", "Industri", "Pemerintah"],
            "Pelayanan  Informasi [Kejelasan informasi]  ": ["Puas", "Sangat Puas", "Tidak Puas"],
            "Pelayanan Informasi [Kecepatan respons]": ["Puas", "Puas", "Sangat Tidak Puas"],
        }
    )
    tabel, meta = pre.jalankan_preprocessing(df, konfigurasi("mitra_kerjasama"))
    assert sorted(meta["kolom_pii_dibuang"]) == ["Email Address", "Nama Lengkap", "No. HP"]
    likert = tabel["likert_utama"]
    assert "Pelayanan Informasi [Kejelasan informasi]" in likert.columns  # spasi ganda/ujung dirapikan
    assert likert["Pelayanan Informasi [Kejelasan informasi]"].tolist() == [3, 4, 2]
    assert meta["aspek"] == ["Pelayanan Informasi"]
    assert meta["kolom"]["segmen"] == "Jenis Instansi"


def test_sheet_kosong_tetap_menghasilkan_struktur(sample_frames):
    tabel, meta = pre.jalankan_preprocessing(sample_frames["dosen"].iloc[0:0], konfigurasi("dosen"))
    assert meta["n_responden"] == 0
    assert len(tabel["kamus"]) == sum(len(g[3]) for g in sample_data.DOSEN_GRID)
    assert tabel["likert_utama"].empty and list(tabel["teks"].columns) == ["response_id", "jenis_pertanyaan", "teks_komentar"]
