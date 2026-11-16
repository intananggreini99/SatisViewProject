"""Uji ujung-ke-ujung: Google Drive (tiruan) -> HDFS (tiruan) -> kode tim -> validasi -> PostgreSQL.

Klien Drive diganti tiruan yang menyajikan file dengan NAMA ASLI folder
"Data Responden". Isinya data sintetis (tes tidak boleh bergantung pada akses
Drive maupun menyimpan data pribadi responden). Seperti kondisi Drive saat ini,
sheet Dosen & Karyawan hanya berisi baris judul (belum ada respons).
"""

import json

import pytest
from data_sintetis import build_sample_frames, to_xlsx_bytes

from satisview import contract, gdrive
from satisview.respondents import GROUPS

NAMA_DRIVE = {
    "mahasiswa": "Pelayanan Kepuasan - Mahasiswa (Jawaban)",
    "dosen": "Pelayanan Kepuasan - Dosen (Responses)",
    "karyawan": "Pelayanan Kepuasan - Karyawan (Responses)",
    "mitra_kerjasama": "Pelayanan Kepuasan - Mitra Kerja sama (Responses)",
    "mitra_pengadaan": "Pelayanan Kepuasan - Mitra pengadaan barang & jasa (Responses)",
}


class DriveTiruan:
    """Pengganti ``gdrive.make_client()``: folder data berisi 5 Google Sheets."""

    mode = "tiruan"

    def __init__(self, frames, folder_data):
        self.frames = frames
        self.folder_data = folder_data

    def list_folder(self, folder_id):
        if folder_id != self.folder_data:
            return []  # folder laporan kosong
        return [
            gdrive.DriveFile(id=f"id-{key}", name=NAMA_DRIVE[key], mime_type=gdrive.MIME_GSHEET, modified_time="2026-09-12")
            for key in self.frames
        ]

    def fetch_spreadsheet(self, file):
        df = self.frames[file.id.removeprefix("id-")]
        return to_xlsx_bytes(df), df.to_csv(index=False).encode("utf-8")


@pytest.fixture
def pipeline_env(tmp_path, monkeypatch, fake_hdfs):
    frames = build_sample_frames(empty=("dosen", "karyawan"))
    monkeypatch.setattr(gdrive, "make_client", lambda: DriveTiruan(frames, "folder-data"))
    monkeypatch.setattr("satisview.config.GDRIVE_DATA_FOLDER_ID", "folder-data")
    monkeypatch.setattr("satisview.config.DATA_DIR", tmp_path / "data")
    monkeypatch.setattr("satisview.config.LANDING_DIR", tmp_path / "data" / "landing")
    monkeypatch.setattr("satisview.config.STAGING_DIR", tmp_path / "data" / "staging")
    from satisview import pipeline

    return pipeline


def _hdfs(fake_hdfs):
    from satisview.hdfs import WebHdfsClient

    return WebHdfsClient(base_url=fake_hdfs.url, max_retries=1, retry_wait=0)


def _ls(client, folder):
    return sorted(f["pathSuffix"] for f in client.list(folder))


def test_preprocessing_analisis_tersimpan_di_hdfs(pipeline_env, fake_hdfs):
    pipeline = pipeline_env
    pipeline.load_landing_to_hdfs(pipeline.extract_from_gdrive())
    hasil = pipeline.step_validation_preprocessing(pipeline.step_preprocessing("mahasiswa"))
    assert hasil["validasi"] == "lolos" and hasil["baris"] == 418
    akhir = pipeline.step_validation_analysis(pipeline.step_analysis(hasil))

    client = _hdfs(fake_hdfs)
    assert _ls(client, "/satisview/preprocessed/mahasiswa") == sorted(
        [f"{stem}.csv" for stem in hasil["file"]] + ["meta_preprocessing_mahasiswa.json"]
    )
    harapan = sorted(f"{contract.file_name('analisis', n, 'mahasiswa')}.csv" for n in contract.table_names("analisis"))
    assert _ls(client, "/satisview/analysis/mahasiswa") == harapan
    assert akhir["tabel"] == sorted(s[:-4] for s in harapan)
    laporan = json.loads(client.read_bytes("/satisview/validation/mahasiswa/validation_preprocessing.json"))
    assert laporan["status"] == "lolos" and laporan["statistik"]["n_aspek"] == 12


def test_data_mentah_belum_ada_di_skip(pipeline_env):
    with pytest.raises(pipeline_env.SkipGroup):
        pipeline_env.step_preprocessing("dosen")


def test_validasi_gagal_hasil_lama_di_hdfs_tetap(pipeline_env, fake_hdfs):
    pipeline = pipeline_env
    pipeline.load_landing_to_hdfs(pipeline.extract_from_gdrive())
    hasil = pipeline.step_validation_preprocessing(pipeline.step_preprocessing("mitra_pengadaan"))
    baik = pipeline.step_validation_analysis(pipeline.step_analysis(hasil))
    analisis = pipeline.step_analysis(hasil)
    stem = contract.file_name("analisis", "prioritas_aspek", "mitra_pengadaan")
    with open(analisis["tabel"][stem], "w", encoding="utf-8") as fh:
        fh.write("aspek,segmen\nPembayaran,Semua\n")  # file rusak
    from satisview.validation import ValidationFailed

    with pytest.raises(ValidationFailed):
        pipeline.step_validation_analysis(analisis)
    client = _hdfs(fake_hdfs)
    csv = client.read_bytes(f"{baik['hdfs_dir']}/{stem}.csv").decode()
    assert csv.splitlines()[0].startswith("aspek,skor_kepuasan,jumlah_dipilih")
    laporan = json.loads(client.read_bytes("/satisview/validation/mitra_pengadaan/validation_analysis.json"))
    assert laporan["status"] == "gagal"


def test_ekstraksi_memakai_nama_file_asli_drive(pipeline_env):
    manifest = pipeline_env.extract_from_gdrive()
    assert manifest["sumber"] == "google_drive" and manifest["mode_akses"] == "tiruan"
    assert {k: v["nama_file_drive"] for k, v in manifest["kuisioner"].items()} == NAMA_DRIVE
    assert "SatisView_Report.pdf belum ada di folder laporan Drive." in manifest["peringatan"]


def test_kolom_pribadi_dikenali_dari_judul_asli(sample_frames):
    pipeline = __import__("satisview.pipeline", fromlist=["kolom_pribadi"])
    assert pipeline.kolom_pribadi(sample_frames["mahasiswa"], "mahasiswa") == ["Nomor Gopay"]
    pribadi_mitra = pipeline.kolom_pribadi(sample_frames["mitra_kerjasama"], "mitra_kerjasama")
    assert pribadi_mitra and all(k in sample_frames["mitra_kerjasama"].columns for k in pribadi_mitra)


def test_pipeline_lengkap_sampai_postgresql(pipeline_env, pg_config):
    pipeline = pipeline_env
    manifest = pipeline.extract_from_gdrive()
    assert set(manifest["kuisioner"]) == {g.key for g in GROUPS}
    assert pipeline.load_landing_to_hdfs(manifest)["laporan"] is None

    from satisview import ingestion

    # tabel sisa skema lama harus ikut dihapus (DB = cermin folder HDFS)
    ingestion.ensure_database("analysis_mahasiswa")
    conn = ingestion.connect("analysis_mahasiswa")
    with conn, conn.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS indeks_layanan (x int)")
    conn.close()

    status = {}
    for group in GROUPS:
        hasil = pipeline.step_preprocessing(group.key)
        hasil = pipeline.step_validation_preprocessing(hasil)
        hasil = pipeline.step_analysis(hasil)
        hasil = pipeline.step_validation_analysis(hasil)
        status[group.key] = hasil["validasi"]
        raw = pipeline.ingest_raw(group.key)
        assert raw["tabel"] == f"kuisioner_{group.key}"
        if group.key == "mahasiswa":
            assert raw["kolom_pribadi_tidak_dimuat"] == ["Nomor Gopay"]
        dimuat = pipeline.ingest_analysis(group.key)
        harapan = {contract.file_name("analisis", n, group.key) for n in contract.table_names("analisis")}
        assert {t["tabel"] for t in dimuat["tabel"]} == harapan
        if group.key == "mahasiswa":
            assert dimuat["tabel_dihapus"] == ["indeks_layanan"]

    assert status["dosen"] == status["karyawan"] == "kosong"
    assert status["mahasiswa"] in {"lolos", "lolos_dengan_peringatan"}

    conn = ingestion.connect("analysis_mahasiswa")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT n_responden, mutu FROM kpi_ringkasan_mahasiswa WHERE segmen = 'Semua'")
            n, mutu = cur.fetchone()
            assert n == 418 and mutu in {"A", "B", "C", "D"}
            cur.execute("SELECT count(*) FROM prioritas_aspek_mahasiswa WHERE segmen = 'Semua'")
            assert cur.fetchone()[0] == 12
    finally:
        conn.close()
    conn = ingestion.connect("raw_data")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM kuisioner_mahasiswa")
            assert cur.fetchone()[0] == 418
    finally:
        conn.close()
