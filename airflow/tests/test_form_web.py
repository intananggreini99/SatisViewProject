"""Respons form web (Kafka consumer -> HDFS) ikut diproses pipeline & divalidasi saat ingestion.

Batch ditulis memakai kode Kafka consumer sungguhan (consumer/satisview_consumer)
agar format file yang dibaca Airflow sama dengan yang ditulis consumer.
"""

from __future__ import annotations

import json
import random
import sys
import uuid
from pathlib import Path

import pytest
from data_sintetis import KONTRAK, build_sample_frames, to_xlsx_bytes

from satisview import gdrive
from satisview.respondents import GROUPS

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "consumer"))
from satisview_consumer import batch as consumer_batch  # noqa: E402
from satisview_consumer import config as consumer_config  # noqa: E402
from satisview_consumer.hdfs import WebHdfsClient as ConsumerHdfs  # noqa: E402
from satisview_consumer.kontrak import Kontrak  # noqa: E402

NAMA_DRIVE = {
    "mahasiswa": "Pelayanan Kepuasan - Mahasiswa (Jawaban)",
    "dosen": "Pelayanan Kepuasan - Dosen (Responses)",
    "karyawan": "Pelayanan Kepuasan - Karyawan (Responses)",
    "mitra_kerjasama": "Pelayanan Kepuasan - Mitra Kerja sama (Responses)",
    "mitra_pengadaan": "Pelayanan Kepuasan - Mitra pengadaan barang & jasa (Responses)",
}


class DriveTiruan:
    mode = "tiruan"

    def __init__(self, frames):
        self.frames = frames

    def list_folder(self, folder_id):
        if folder_id != "folder-data":
            return []
        return [gdrive.DriveFile(id=f"id-{k}", name=NAMA_DRIVE[k], mime_type=gdrive.MIME_GSHEET, modified_time="2026-11-16")
                for k in self.frames]

    def fetch_spreadsheet(self, file):
        df = self.frames[file.id.removeprefix("id-")]
        return to_xlsx_bytes(df), df.to_csv(index=False).encode("utf-8")


KOMENTAR_WEB = ["Parkir perlu diperluas", "Wifi sering lambat di gedung kuliah", "Pelayanan administrasi sudah baik",
                "Proses pembayaran perlu dipercepat", "Komunikasi dengan pihak kampus responsif", "Tidak ada"]


def _baris_valid(key: str, rng: random.Random) -> dict:
    """Satu baris respons yang lolos validasi form web (struktur sheet asli)."""
    g = KONTRAK["kelompok"][key]
    baris, lewati = {}, set()
    for bagian in g["bagian"]:
        for q in bagian["pertanyaan"]:
            if bagian["id"] in lewati:
                if q["jenis"] == "grid":
                    baris.update({b["kolom"]: "" for b in q["baris"]})
                else:
                    baris[q["kolom"]] = ""
                continue
            jenis = q["jenis"]
            if jenis == "grid":
                for b in q["baris"]:
                    baris[b["kolom"]] = rng.choices(q["skala"], weights=[1, 2, 5, 4])[0]
            elif jenis == "teks_singkat":
                baris[q["kolom"]] = "081234567890" if q.get("validasi", {}).get("pola") else "PT Mitra Uji"
            elif jenis == "paragraf":
                baris[q["kolom"]] = rng.choice(KOMENTAR_WEB)
            elif jenis in ("pilihan_ganda", "dropdown"):
                baris[q["kolom"]] = rng.choice(q["opsi"])
                if q.get("lompat") and baris[q["kolom"]] in q["lompat"]:
                    target = q["lompat"][baris[q["kolom"]]]
                    ids = [b["id"] for b in g["bagian"]]
                    lewati.update(ids[ids.index(bagian["id"]) + 1 : ids.index(target)])
            elif jenis == "kotak_centang":
                pilih = set(rng.sample(q["opsi"], k=rng.randint(1, min(3, q.get("maks_pilihan") or 3))))
                baris[q["kolom"]] = ", ".join(o for o in q["opsi"] if o in pilih)
    return baris


def _pesan_form_web(key: str, n: int, seed: int = 7) -> list[dict]:
    """Pesan Kafka seperti buatan API untuk n respons valid."""
    rng = random.Random(f"{key}-{seed}")
    hasil = []
    for i in range(n):
        baris = {"Timestamp": f"2026-11-16 10:{i // 60:02d}:{i % 60:02d}", **_baris_valid(key, rng)}
        hasil.append({"versi": 1, "id_respons": str(uuid.uuid4()), "kelompok": key, "sumber": "form_web",
                      "diterima_pada": f"2026-11-16T03:{i // 60:02d}:{i % 60:02d}+00:00", "baris": baris})
    return hasil


def _tulis_batch(hdfs_url: str, pesan: list[dict], ukuran: int = 7) -> int:
    """Jalankan logika consumer: batching, dedup, validasi, tulis HDFS (offset tiruan)."""
    consumer_config.HDFS_ROOT = "/satisview"
    hdfs = ConsumerHdfs(base_url=hdfs_url, user="root", max_retries=1, retry_wait=0)
    kontrak = Kontrak(KONTRAK)
    indeks = consumer_batch.DaftarId(hdfs, kontrak)
    ditolak = 0
    for awal in range(0, len(pesan), ukuran):
        potong = pesan[awal : awal + ukuran]
        msgs = [consumer_batch.Pesan("satisview.kuesioner.respons", 0, awal + i, p["kelompok"].encode(),
                                     json.dumps(p).encode()) for i, p in enumerate(potong)]
        ditolak += consumer_batch.proses_batch(msgs, kontrak, hdfs, indeks).ditolak
    return ditolak


@pytest.fixture
def lingkungan(tmp_path, monkeypatch, fake_hdfs):
    drive = build_sample_frames(empty=("dosen", "karyawan"))  # seperti Drive saat ini: Dosen/Karyawan belum ada respons
    monkeypatch.setattr(gdrive, "make_client", lambda: DriveTiruan(drive))
    monkeypatch.setattr("satisview.config.GDRIVE_DATA_FOLDER_ID", "folder-data")
    monkeypatch.setattr("satisview.config.DATA_DIR", tmp_path / "data")
    monkeypatch.setattr("satisview.config.LANDING_DIR", tmp_path / "data" / "landing")
    monkeypatch.setattr("satisview.config.STAGING_DIR", tmp_path / "data" / "staging")
    from satisview import pipeline

    pipeline.load_landing_to_hdfs(pipeline.extract_from_gdrive())
    jumlah = {"dosen": 30, "karyawan": 25, "mahasiswa": 40, "mitra_kerjasama": 9, "mitra_pengadaan": 6}
    pesan = []
    for key, n in jumlah.items():
        pesan += _pesan_form_web(key, n)
    pesan += pesan[:5]  # retry producer: lima pesan terkirim dua kali
    assert _tulis_batch(fake_hdfs.url, pesan) == 0
    return pipeline, drive, jumlah


def test_form_web_dibaca_tanpa_duplikat(lingkungan, fake_hdfs):
    from satisview import form_web
    from satisview.hdfs import WebHdfsClient

    _, _, jumlah = lingkungan
    hdfs = WebHdfsClient(base_url=fake_hdfs.url, max_retries=1, retry_wait=0)
    for key, n in jumlah.items():
        df = form_web.baca(hdfs, key)
        assert len(df) == n and df[form_web.KOLOM_ID].is_unique
        assert str(df["Timestamp"].dtype).startswith("datetime64")
    assert form_web.jejak(hdfs, "dosen") and not form_web.jejak(hdfs, "alumni")


def test_preprocessing_menggabung_google_form_dan_form_web(lingkungan):
    pipeline, drive, jumlah = lingkungan
    hasil = pipeline.step_preprocessing("mahasiswa")
    assert hasil["sumber_raw"] == {"google_form": len(drive["mahasiswa"]), "form_web": 40}
    assert hasil["baris"] == len(drive["mahasiswa"]) + 40
    hasil = pipeline.step_validation_analysis(pipeline.step_analysis(pipeline.step_validation_preprocessing(hasil)))
    assert hasil["validasi"] in {"lolos", "lolos_dengan_peringatan"}


def test_kelompok_tanpa_respons_google_form_tetap_diproses_dari_form_web(lingkungan):
    pipeline, _, jumlah = lingkungan
    hasil = pipeline.step_preprocessing("dosen")  # sheet Drive hanya judul kolom
    assert hasil["sumber_raw"] == {"google_form": 0, "form_web": 30} and hasil["baris"] == 30
    hasil = pipeline.step_validation_preprocessing(hasil)
    assert hasil["validasi"] != "kosong"


@pytest.mark.parametrize("key", ["mitra_kerjasama", "mitra_pengadaan"])
def test_mitra_struktur_asli_lolos_sampai_analisis(lingkungan, key):
    pipeline, drive, jumlah = lingkungan
    hasil = pipeline.step_validation_preprocessing(pipeline.step_preprocessing(key))
    assert hasil["baris"] == len(drive[key]) + jumlah[key]
    akhir = pipeline.step_validation_analysis(pipeline.step_analysis(hasil))
    assert akhir["validasi"] in {"lolos", "lolos_dengan_peringatan"}


def test_cek_form_web_baru_hanya_saat_ada_batch_baru(lingkungan, fake_hdfs):
    pipeline, _, _ = lingkungan
    pertama = pipeline.cek_form_web_baru()
    assert set(pertama["berubah"]) == {g.key for g in GROUPS}
    pipeline.simpan_jejak_form_web(pertama["jejak"])
    assert pipeline.cek_form_web_baru()["berubah"] == []
    _tulis_batch(fake_hdfs.url, _pesan_form_web("karyawan", 2, seed=99))
    assert pipeline.cek_form_web_baru()["berubah"] == ["karyawan"]


def test_ingestion_raw_dan_validation_ingestion(lingkungan, pg_config):
    pipeline, drive, jumlah = lingkungan
    from satisview import ingestion
    from satisview.validation import ValidationFailed

    for key in ["mahasiswa", "dosen", "mitra_kerjasama"]:
        raw = pipeline.ingest_raw(key)
        assert raw["sumber_raw"] == {"google_form": len(drive[key]), "form_web": jumlah[key]}
        assert raw["baris"] == len(drive[key]) + jumlah[key]
        cek = pipeline.validate_ingestion_raw(key)
        assert cek["validasi"] == "lolos", cek

    conn = ingestion.connect("raw_data")
    try:
        with conn, conn.cursor() as cur:
            cur.execute('SELECT "Sumber", count(*) FROM kuisioner_mahasiswa GROUP BY 1 ORDER BY 1')
            assert cur.fetchall() == [("Form Web SatisView", 40), ("Google Form", len(drive["mahasiswa"]))]
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'kuisioner_mahasiswa'")
            kolom = {r[0] for r in cur.fetchall()}
            assert "Nomor Gopay" not in kolom and not any(k.startswith("_") for k in kolom)
            cur.execute('DELETE FROM kuisioner_mahasiswa WHERE ctid IN (SELECT ctid FROM kuisioner_mahasiswa LIMIT 1)')
    finally:
        conn.close()
    with pytest.raises(ValidationFailed):  # tabel tidak lagi sama dengan raw data di HDFS
        pipeline.validate_ingestion_raw("mahasiswa")


def test_ingestion_analysis_dan_validation_ingestion(lingkungan, pg_config):
    pipeline, _, _ = lingkungan
    from satisview import ingestion
    from satisview.validation import ValidationFailed

    pipeline.step_validation_analysis(pipeline.step_analysis(pipeline.step_validation_preprocessing(
        pipeline.step_preprocessing("mitra_pengadaan"))))
    pipeline.ingest_analysis("mitra_pengadaan")
    assert pipeline.validate_ingestion_analysis("mitra_pengadaan")["validasi"] == "lolos"
    conn = ingestion.connect("analysis_mitra_pengadaan")
    try:
        with conn, conn.cursor() as cur:
            cur.execute("CREATE TABLE tabel_liar (x int)")
    finally:
        conn.close()
    with pytest.raises(ValidationFailed):
        pipeline.validate_ingestion_analysis("mitra_pengadaan")
