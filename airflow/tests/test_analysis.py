"""Tahap analysis pipeline: kode tim per segmen + tabel KPI dashboard."""

import numpy as np
import pandas as pd
import pytest

from satisview import config, contract
from satisview.analysis import SEMUA, mutu_ikm, run_analysis
from satisview.respondents import GROUPS, get_group
from satisview.tim import preprocessing as tim_pre
from satisview.tim import priority_analysis as tim_prioritas
from satisview.tim import text_analytics as tim_teks
from satisview.tim.konfigurasi import konfigurasi
from satisview.validation import validate_analysis


def _t(hasil_analisis, key, nama):
    tabel, _ = hasil_analisis[key]
    return tabel[contract.file_name("analisis", nama, key)]


@pytest.mark.parametrize("key", [g.key for g in GROUPS])
def test_tiga_belas_tabel_sesuai_kontrak_dan_lolos_validasi(hasil_preprocessing, hasil_analisis, key):
    tabel, info = hasil_analisis[key]
    tabel_pre, meta = hasil_preprocessing[key]
    assert set(tabel) == {contract.file_name("analisis", n, key) for n in contract.table_names("analisis")}
    for nama in contract.table_names("analisis"):
        df = tabel[contract.file_name("analisis", nama, key)]
        assert list(df.columns[: len(contract.columns("analisis", nama))]) == contract.columns("analisis", nama)
    ringkasan = tabel_pre[meta["file"]["ringkasan_aspek"]]
    laporan = validate_analysis(tabel, meta, key, info=info, ringkasan_aspek=ringkasan)
    assert laporan.passed, laporan.errors


def test_mutu_ikm_permenpanrb():
    assert mutu_ikm(88.31) == ("A", "Sangat Baik")
    assert mutu_ikm(88.30) == ("B", "Baik")
    assert mutu_ikm(76.61) == ("B", "Baik")
    assert mutu_ikm(65.0) == ("C", "Kurang Baik")
    assert mutu_ikm(64.99) == ("D", "Tidak Baik")
    assert mutu_ikm(None) == (None, None)


def test_baris_semua_sama_dengan_hasil_kode_tim(hasil_preprocessing, hasil_analisis):
    """Segmen 'Semua' = keluaran notebook tim untuk seluruh responden."""
    tabel_pre, meta = hasil_preprocessing["mahasiswa"]
    f = meta["file"]
    cfg = konfigurasi("mahasiswa")

    kpi_aspek = _t(hasil_analisis, "mahasiswa", "kpi_aspek")
    semua = kpi_aspek[kpi_aspek["segmen"] == SEMUA].set_index("aspek")
    ringkasan = tabel_pre[f["ringkasan_aspek"]].set_index("aspek")
    assert np.allclose(semua.loc[ringkasan.index, "rata_rata"], ringkasan["rata_rata"])
    assert np.allclose(semua["indeks"], (semua["rata_rata"] / 4 * 100).round(2))

    # text analytics + priority analysis tim langsung pada seluruh data
    kamus = tabel_pre[f["kamus"]]
    efektif, _ = tim_teks.lengkapi_kata_kunci(cfg.aspek_kata_kunci, list(dict.fromkeys(kamus["aspek"])), kamus)
    komentar = tim_teks.proses_komentar(tabel_pre[f["teks"]], tim_teks.bangun_aspek_frasa(efektif))
    frek = tim_teks.hitung_frekuensi(komentar, list(efektif))
    prior, _ = tim_prioritas.jalankan_priority_analysis(
        tabel_pre[f["ringkasan_aspek"]], tabel_pre[f["kategori"]], frek,
        tim_prioritas.lengkapi_kata_pilihan(cfg.kata_pilihan, tabel_pre[f["ringkasan_aspek"]]["aspek"].tolist()),
    )
    hasil = _t(hasil_analisis, "mahasiswa", "prioritas_aspek")
    hasil = hasil[hasil["segmen"] == SEMUA].drop(columns="segmen").reset_index(drop=True)
    pd.testing.assert_frame_equal(hasil, prior, check_dtype=False)

    frek_hasil = _t(hasil_analisis, "mahasiswa", "frekuensi_aspek")
    frek_hasil = frek_hasil[frek_hasil["segmen"] == SEMUA].drop(columns="segmen").reset_index(drop=True)
    pd.testing.assert_frame_equal(frek_hasil, frek, check_dtype=False)


def test_segmen_lengkap_dan_jumlah_responden(hasil_preprocessing, hasil_analisis):
    for key in ("mahasiswa", "dosen", "karyawan"):
        tabel_pre, meta = hasil_preprocessing[key]
        kpi = _t(hasil_analisis, key, "kpi_ringkasan")
        likert = tabel_pre[meta["file"]["likert_utama"]]
        kolom_segmen = meta["kolom"]["segmen"]
        harapan = [SEMUA] + sorted(likert[kolom_segmen].dropna().unique(), key=str.lower)
        assert kpi["segmen"].tolist() == harapan
        assert (kpi["dimensi_segmen"] == kolom_segmen).all()
        n = kpi.set_index("segmen")["n_responden"]
        assert n[SEMUA] == len(likert) == n.drop(SEMUA).sum()


def test_kpi_ringkasan_konsisten(hasil_analisis):
    kpi = _t(hasil_analisis, "mahasiswa", "kpi_ringkasan").set_index("segmen")
    aspek = _t(hasil_analisis, "mahasiswa", "kpi_aspek")
    semua = aspek[aspek["segmen"] == SEMUA]
    baris = kpi.loc[SEMUA]
    assert baris["rata_rata_total"] == pytest.approx(round(semua["rata_rata"].mean(), 2))
    assert baris["indeks_total"] == pytest.approx(round(semua["rata_rata"].mean() / 4 * 100, 2))
    assert baris["mutu"] == mutu_ikm(baris["indeks_total"])[0]
    assert baris["indeks_tertinggi"] == semua["indeks"].max()
    assert baris["indeks_terendah"] == semua["indeks"].min()
    assert sorted(semua["peringkat"]) == sorted(semua["rata_rata"].rank(ascending=False, method="min").astype(int))


def test_komentar_multi_aspek_dan_id_unik(hasil_analisis):
    teks = _t(hasil_analisis, "mahasiswa", "teks_bersih")
    long = _t(hasil_analisis, "mahasiswa", "aspek_komentar")
    assert teks["id_komentar"].is_unique and teks["id_komentar"].iloc[0] == "K00001"
    jumlah = long.groupby("id_komentar").size()
    assert (jumlah > 1).any()  # satu komentar bisa menyebut beberapa aspek
    contoh = jumlah.idxmax()
    aspek_teks = teks.set_index("id_komentar").loc[contoh, "aspek"].split("; ")
    assert sorted(aspek_teks) == sorted(long.loc[long["id_komentar"] == contoh, "aspek"])
    assert set(teks["segmen_responden"]) <= set(_t(hasil_analisis, "mahasiswa", "kpi_ringkasan")["segmen"])


def test_mds_semua_dan_segmen(hasil_analisis):
    stress = _t(hasil_analisis, "mahasiswa", "mds_stress")
    semua = stress[stress["segmen"] == SEMUA].set_index("analisis")
    assert {"mds_responden_2d", "mds_aspek_2d", "mds_aspek_3d"} <= set(semua.index)
    titik = _t(hasil_analisis, "mahasiswa", "mds_titik_aspek")
    titik3 = _t(hasil_analisis, "mahasiswa", "mds_titik_aspek_3d")
    n_aspek = int(semua["n_aspek"].iloc[0])
    assert (titik.groupby("segmen").size() == n_aspek).all()
    assert set(titik["segmen"]) == set(titik3["segmen"]) == set(stress["segmen"])
    assert "Klinik Kampus" not in set(titik["aspek"])  # kosong > 50% -> dibuang (aturan notebook)
    resp = _t(hasil_analisis, "mahasiswa", "mds_responden")
    assert resp["response_id"].is_unique and resp["segmen_responden"].notna().all()
    _, info = hasil_analisis["mahasiswa"]
    kecil = {d["segmen"] for d in info["mds_dilewati"]}
    assert all(d["n_responden"] < config.MIN_RESPONDEN_MDS for d in info["mds_dilewati"])
    assert not kecil & set(titik["segmen"])


def test_tanpa_respons_semua_tabel_kosong(sample_frames):
    group = get_group("karyawan")
    tabel_pre, meta = tim_pre.jalankan_preprocessing(sample_frames["karyawan"].iloc[0:0], konfigurasi("karyawan"))
    tabel_pre = {meta["file"][k]: v for k, v in tabel_pre.items()}
    hasil, info = run_analysis(tabel_pre, meta, group)
    assert len(hasil) == len(contract.table_names("analisis"))
    assert all(df.empty for df in hasil.values())
    assert validate_analysis(hasil, meta, group.key, info=info).status == "kosong"
