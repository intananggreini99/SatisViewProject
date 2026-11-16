import copy
import csv
import io
import json
import uuid

import pytest
from conftest import KOLOM_SHEET

from satisview_consumer import config
from satisview_consumer.batch import KOLOM_META, DaftarId, Pesan, ValidasiTulisGagal, proses_batch

TOPIK = "satisview.kuesioner.respons"


def _pesan_kafka(daftar, partisi=0, mulai=0):
    return [
        Pesan(TOPIK, partisi, mulai + i, p["kelompok"].encode(), json.dumps(p).encode("utf-8"))
        for i, p in enumerate(daftar)
    ]


def _baca(hdfs, path):
    return list(csv.DictReader(io.StringIO(hdfs.read_bytes(path).decode("utf-8"))))


def test_respons_valid_tertulis_ke_hdfs_dengan_kolom_sheet(kontrak, hdfs_client, pesan_dari_api):
    semua = [p for daftar in pesan_dari_api.values() for p in daftar]
    hasil = proses_batch(_pesan_kafka(semua), kontrak, hdfs_client, DaftarId(hdfs_client, kontrak))
    assert hasil.ditolak == 0 and hasil.duplikat == 0
    assert hasil.diterima == {k: 3 for k in pesan_dari_api}
    assert hasil.offset_commit == {(TOPIK, 0): len(semua)}
    for key in pesan_dari_api:
        folder = config.folder_form_web(key)
        [st] = hdfs_client.list(folder)
        path = f"{folder}/{st['pathSuffix']}"
        with io.StringIO(hdfs_client.read_bytes(path).decode("utf-8")) as f:
            header = next(csv.reader(f))
        assert header == KOLOM_SHEET[key] + KOLOM_META
        rows = _baca(hdfs_client, path)
        assert [r["_id_respons"] for r in rows] == [p["id_respons"] for p in pesan_dari_api[key]]
        assert all(r["_sumber"] == "form_web" for r in rows)


def test_deduplikasi_dalam_batch_dan_lintas_batch(kontrak, hdfs_client, pesan_dari_api):
    daftar = pesan_dari_api["dosen"]
    # batch 1: pesan pertama terkirim dua kali (retry producer)
    hasil1 = proses_batch(_pesan_kafka([daftar[0], daftar[0], daftar[1]]), kontrak, hdfs_client, DaftarId(hdfs_client, kontrak))
    assert hasil1.diterima == {"dosen": 2} and hasil1.duplikat == 1
    # batch 2 (consumer dimulai ulang -> indeks dibangun dari HDFS): semua sudah ada kecuali satu
    indeks_baru = DaftarId(hdfs_client, kontrak)
    hasil2 = proses_batch(_pesan_kafka(daftar, mulai=3), kontrak, hdfs_client, indeks_baru)
    assert hasil2.diterima == {"dosen": 1} and hasil2.duplikat == 2
    total = sum(len(_baca(hdfs_client, f"{config.folder_form_web('dosen')}/{st['pathSuffix']}"))
                for st in hdfs_client.list(config.folder_form_web("dosen")))
    assert total == 3


def test_batch_yang_sama_diulang_menimpa_file_yang_sama(kontrak, hdfs_client, pesan_dari_api):
    pesan = _pesan_kafka(pesan_dari_api["karyawan"])
    h1 = proses_batch(pesan, kontrak, hdfs_client, DaftarId(hdfs_client, kontrak))
    # proses ulang setelah "crash" sebelum commit: indeks kosong (tidak dimuat), file sama ditimpa
    indeks = DaftarId(hdfs_client, kontrak)
    indeks._id["karyawan"] = set()
    h2 = proses_batch(pesan, kontrak, hdfs_client, indeks)
    assert h1.file == h2.file
    assert len(hdfs_client.list(config.folder_form_web("karyawan"))) == 1


def test_pesan_tidak_valid_masuk_folder_ditolak_tanpa_menghentikan_batch(kontrak, hdfs_client, pesan_dari_api):
    rusak = copy.deepcopy(pesan_dari_api["mitra_kerjasama"][0])
    rusak["id_respons"] = str(uuid.uuid4())
    rusak["baris"]["Jenis Instansi"] = ""
    pesan = _pesan_kafka([pesan_dari_api["mitra_kerjasama"][1], rusak]) + [Pesan(TOPIK, 1, 7, None, b"{bukan json")]
    hasil = proses_batch(pesan, kontrak, hdfs_client, DaftarId(hdfs_client, kontrak))
    assert hasil.diterima == {"mitra_kerjasama": 1} and hasil.ditolak == 2
    assert hasil.offset_commit == {(TOPIK, 0): 2, (TOPIK, 1): 8}
    nama = sorted(st["pathSuffix"] for st in hdfs_client.list(config.folder_ditolak()))
    assert nama == [f"{TOPIK}_p0_o1.json", f"{TOPIK}_p1_o7.json"]
    catatan = json.loads(hdfs_client.read_bytes(f"{config.folder_ditolak()}/{TOPIK}_p0_o1.json"))
    assert any("jenis_instansi" in g for g in catatan["galat"])


def test_hdfs_gagal_tidak_mengubah_indeks(kontrak, hdfs_client, pesan_dari_api, monkeypatch):
    indeks = DaftarId(hdfs_client, kontrak)
    asli = hdfs_client.write_bytes

    def gagal(*a, **k):
        raise ConnectionError("namenode mati")

    monkeypatch.setattr(hdfs_client, "write_bytes", gagal)
    with pytest.raises(ConnectionError):
        proses_batch(_pesan_kafka(pesan_dari_api["mitra_pengadaan"]), kontrak, hdfs_client, indeks)
    assert indeks.muat("mitra_pengadaan") == set()
    monkeypatch.setattr(hdfs_client, "write_bytes", asli)
    hasil = proses_batch(_pesan_kafka(pesan_dari_api["mitra_pengadaan"]), kontrak, hdfs_client, indeks)
    assert hasil.diterima == {"mitra_pengadaan": 3}


def test_verifikasi_baca_ulang_mendeteksi_file_rusak(kontrak, hdfs_client, pesan_dari_api, monkeypatch):
    asli = hdfs_client.read_bytes

    def rusak(path):
        data = asli(path)
        return data[: len(data) // 2] if path.endswith(".csv") else data

    monkeypatch.setattr(hdfs_client, "read_bytes", rusak)
    indeks = DaftarId(hdfs_client, kontrak)
    indeks._id["mahasiswa"] = set()
    with pytest.raises(ValidasiTulisGagal):
        proses_batch(_pesan_kafka(pesan_dari_api["mahasiswa"]), kontrak, hdfs_client, indeks)
    assert indeks.muat("mahasiswa") == set()
