"""Task validation_preprocessing & validation_analysis."""

import copy

import pandas as pd
import pytest

from satisview import contract
from satisview.validation import validate_analysis, validate_preprocessed


def _salin(tabel):
    return {k: v.copy() for k, v in tabel.items()}


@pytest.mark.parametrize("key", ["mahasiswa", "dosen", "karyawan", "mitra_kerjasama", "mitra_pengadaan"])
def test_preprocessing_data_contoh_lolos(hasil_preprocessing, key):
    tabel, meta = hasil_preprocessing[key]
    laporan = validate_preprocessed(tabel, meta, key)
    assert laporan.passed, laporan.errors
    assert laporan.statistik["n_responden"] == meta["n_responden"]


def test_skor_di_luar_skala_gagal(hasil_preprocessing):
    tabel, meta = hasil_preprocessing["mahasiswa"]
    tabel = _salin(tabel)
    stem = meta["file"]["likert_utama"]
    kolom = tabel[meta["file"]["kamus"]]["nama_kolom_asli"].iloc[0]
    tabel[stem].loc[0, kolom] = 9
    laporan = validate_preprocessed(tabel, meta, "mahasiswa")
    assert laporan.status == "gagal"
    assert any("di luar skala" in e for e in laporan.errors)


def test_kolom_pii_tidak_boleh_ikut(hasil_preprocessing):
    tabel, meta = hasil_preprocessing["mahasiswa"]
    tabel = _salin(tabel)
    stem = meta["file"]["teks"]
    tabel[stem]["Nomor Gopay"] = "0800000000"
    laporan = validate_preprocessed(tabel, meta, "mahasiswa")
    assert any("data pribadi" in e for e in laporan.errors)


def test_konversi_gagal_di_atas_ambang_menggagalkan(hasil_preprocessing, monkeypatch):
    tabel, meta = hasil_preprocessing["dosen"]
    meta = copy.deepcopy(meta)
    cek = meta["cek_konversi"][0]
    cek["setelah_konversi"] = cek["terisi_asli"] - 1
    cek["contoh_gagal"] = {"Netral": 1}
    assert validate_preprocessed(tabel, meta, "dosen").status == "lolos_dengan_peringatan"  # 1 sel < 1%
    monkeypatch.setattr("satisview.config.MAX_GAGAL_KONVERSI", 0.0)
    laporan = validate_preprocessed(tabel, meta, "dosen")
    assert laporan.status == "gagal" and any("Netral" in e for e in laporan.errors)


def test_file_wajib_hilang_gagal(hasil_preprocessing):
    tabel, meta = hasil_preprocessing["karyawan"]
    tabel = _salin(tabel)
    del tabel[meta["file"]["kategori"]]
    laporan = validate_preprocessed(tabel, meta, "karyawan")
    assert any("tidak ditemukan" in e for e in laporan.errors)


def test_aspek_tidak_terdeteksi_gagal(hasil_preprocessing):
    tabel, meta = hasil_preprocessing["karyawan"]
    tabel = _salin(tabel)
    tabel[meta["file"]["kamus"]].loc[0, "aspek"] = "TIDAK TERDETEKSI"
    assert any("gagal terdeteksi aspeknya" in e for e in validate_preprocessed(tabel, meta, "karyawan").errors)


def test_analisis_kolom_wajib_hilang_gagal(hasil_analisis, hasil_preprocessing):
    tabel, info = hasil_analisis["dosen"]
    _, meta = hasil_preprocessing["dosen"]
    tabel = _salin(tabel)
    stem = contract.file_name("analisis", "prioritas_aspek", "dosen")
    tabel[stem] = tabel[stem].drop(columns="skor_prioritas")
    laporan = validate_analysis(tabel, meta, "dosen", info=info)
    assert laporan.status == "gagal" and any("skor_prioritas" in e for e in laporan.errors)


def test_analisis_nilai_tidak_valid_gagal(hasil_analisis, hasil_preprocessing):
    tabel, info = hasil_analisis["dosen"]
    _, meta = hasil_preprocessing["dosen"]
    stem = contract.file_name("analisis", "prioritas_aspek", "dosen")
    rusak = _salin(tabel)
    rusak[stem].loc[0, "level_prioritas"] = "Darurat"
    assert any("tidak dikenal" in e for e in validate_analysis(rusak, meta, "dosen", info=info).errors)

    rusak = _salin(tabel)
    rusak[stem].loc[1, "ranking"] = rusak[stem].loc[0, "ranking"]
    assert any("tidak berurutan" in e for e in validate_analysis(rusak, meta, "dosen", info=info).errors)


def test_analisis_n_responden_dan_ringkasan_lintas_tahap(hasil_analisis, hasil_preprocessing):
    tabel, info = hasil_analisis["mahasiswa"]
    tabel_pre, meta = hasil_preprocessing["mahasiswa"]
    meta = {**meta, "n_responden": meta["n_responden"] + 1}
    assert any("n_responden" in e for e in validate_analysis(tabel, meta, "mahasiswa", info=info).errors)

    _, meta = hasil_preprocessing["mahasiswa"]
    ringkasan = tabel_pre[meta["file"]["ringkasan_aspek"]].copy()
    ringkasan.loc[0, "rata_rata"] += 0.5
    errors = validate_analysis(tabel, meta, "mahasiswa", info=info, ringkasan_aspek=ringkasan).errors
    assert any("ringkasan_aspek" in e for e in errors)


def test_kolom_dan_tabel_tambahan_diperbolehkan(hasil_analisis, hasil_preprocessing):
    tabel, info = hasil_analisis["mitra_pengadaan"]
    _, meta = hasil_preprocessing["mitra_pengadaan"]
    tabel = _salin(tabel)
    stem = contract.file_name("analisis", "kpi_aspek", "mitra_pengadaan")
    tabel[stem]["catatan_tim"] = "ok"
    tabel["sentimen_mitra_pengadaan"] = pd.DataFrame({"id_komentar": ["K00001"], "sentimen": ["positif"]})
    assert validate_analysis(tabel, meta, "mitra_pengadaan", info=info).passed
