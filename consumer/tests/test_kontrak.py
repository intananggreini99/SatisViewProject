import copy

import pytest
from conftest import KOLOM_SHEET


def test_kolom_kontrak_sama_dengan_sheet_asli(kontrak):
    for key, g in kontrak.kelompok.items():
        assert g.kolom == KOLOM_SHEET[key], key


def test_pesan_dari_api_lolos_validasi_consumer(kontrak, pesan_dari_api):
    assert set(pesan_dari_api) == set(kontrak.kelompok)
    for key, daftar in pesan_dari_api.items():
        for pesan in daftar:
            assert kontrak.validasi_pesan(pesan) == [], key


def _pesan(pesan_dari_api, key="dosen"):
    return copy.deepcopy(pesan_dari_api[key][0])


@pytest.mark.parametrize(
    "ubah,pola",
    [
        (lambda p: p.update(versi=2), "versi"),
        (lambda p: p.update(id_respons="bukan-uuid"), "UUID"),
        (lambda p: p.update(kelompok="alumni"), "kelompok"),
        (lambda p: p["baris"].pop("Departemen"), "kolom tidak sesuai"),
        (lambda p: p["baris"].update({"Kolom Asing": "x"}), "kolom tidak sesuai"),
        (lambda p: p["baris"].update(Timestamp="16/11/2026"), "Timestamp"),
        (lambda p: p["baris"].update(Departemen="Departemen Fiktif"), "departemen"),
        (lambda p: p["baris"].update(Departemen=""), "departemen: wajib"),
        (lambda p: p["baris"].update({k: "Lumayan" for k in list(p["baris"]) if k.startswith("Parkir [")}), "parkir"),
        (lambda p: p["baris"].update({k: 5 for k in list(p["baris"])[:2]}), "teks"),
    ],
)
def test_pesan_rusak_ditolak(kontrak, pesan_dari_api, ubah, pola):
    pesan = _pesan(pesan_dari_api)
    ubah(pesan)
    galat = kontrak.validasi_pesan(pesan)
    assert galat and any(pola.lower() in g.lower() for g in galat), galat


def test_centang_maksimal_dan_isian_lainnya(kontrak, pesan_dari_api):
    p = _pesan(pesan_dari_api, "mitra_pengadaan")
    kolom = "Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3 pilihan)"
    p["baris"][kolom] = "Komunikasi, Administrasi, Perencanaan Kebutuhan"  # isian "Yang lain" boleh
    assert kontrak.validasi_pesan(p) == []
    p["baris"][kolom] = "Kecepatan pelayanan, Komunikasi, Administrasi, Profesionalisme tim"
    assert any("lebih dari 3" in g for g in kontrak.validasi_pesan(p))
    d = _pesan(pesan_dari_api, "dosen")  # form Dosen tidak punya opsi "Yang lain"
    d["baris"]["Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3) "] = "Kantin"
    assert any("tidak tersedia" in g for g in kontrak.validasi_pesan(d))


def test_bagian_klinik_dilewati_harus_kosong(kontrak, pesan_dari_api):
    lewat = [p for p in pesan_dari_api["mahasiswa"] if p["baris"]["Apakah Anda pernah menggunakan layanan Klinik Kampus PENS?  "] == "Tidak"]
    assert lewat, "fixture harus memuat responden yang tidak pernah ke klinik"
    p = copy.deepcopy(lewat[0])
    assert kontrak.validasi_pesan(p) == []
    k = next(k for k in p["baris"] if "aspek layanan Klinik" in k)
    p["baris"][k] = "3 - Baik"
    assert any("dilewati" in g for g in kontrak.validasi_pesan(p))
