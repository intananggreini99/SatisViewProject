import io

import pandas as pd
import pytest

from satisview import ingestion
from satisview.hdfs import WebHdfsClient


def test_safe_identifiers_keep_short_names_and_shorten_long_ones():
    long_a = "Administrasi Akademik [Seberapa puas Anda dengan kejelasan informasi kalender akademik?]"
    long_b = "Administrasi Akademik [Seberapa puas Anda dengan kejelasan informasi jadwal ujian?]"
    names = ingestion.safe_identifiers(["Timestamp", "Departemen", long_a, long_b, "Timestamp"])
    assert names[:2] == ["Timestamp", "Departemen"]
    assert all(len(n.encode()) <= 63 for n in names)
    assert len(set(names)) == len(names)  # tetap unik walau awalan sama / duplikat


def test_type_inference_preserves_text():
    assert ingestion.infer_pg_type(pd.Series(["1", "20", "-3"])) == "BIGINT"
    assert ingestion.infer_pg_type(pd.Series(["1.5", "2", "3e2"])) == "DOUBLE PRECISION"
    assert ingestion.infer_pg_type(pd.Series(["007", "12"])) == "TEXT"  # nol di depan dipertahankan
    assert ingestion.infer_pg_type(pd.Series(["Puas", "Sangat Puas"])) == "TEXT"
    assert ingestion.infer_pg_type(pd.Series([], dtype=object)) == "TEXT"


def test_webhdfs_roundtrip(fake_hdfs, tmp_path):
    client = WebHdfsClient(base_url=fake_hdfs.url, max_retries=1, retry_wait=0)
    client.write_bytes("/satisview/test/a.csv", b"x,y\n1,2\n")
    assert client.exists("/satisview/test/a.csv")
    assert client.read_bytes("/satisview/test/a.csv") == b"x,y\n1,2\n"
    client.write_bytes("/satisview/test/a.csv", b"x,y\n3,4\n")  # overwrite atomik
    assert client.read_bytes("/satisview/test/a.csv") == b"x,y\n3,4\n"
    names = [f["pathSuffix"] for f in client.list("/satisview/test")]
    assert names == ["a.csv"]
    assert client.rename("/satisview/test", "/satisview/test2")
    assert client.list("/satisview/test") == []
    assert client.delete("/satisview/test2", recursive=True)
    with pytest.raises(FileNotFoundError):
        client.read_bytes("/satisview/test2/a.csv")


def test_load_csv_into_postgres(pg_config):
    import psycopg2

    long_header = "Lingkungan Kampus [Bagaimana tingkat kepuasan Anda terhadap ruang terbuka, penghijauan, dan fasilitas umum kampus?]"
    df = pd.DataFrame({"segmen": ["Semua", "A"], "indeks": ["80.5", "70"], long_header: ["Puas", None]})
    data = df.to_csv(index=False).encode()
    result = ingestion.load_csv_bytes("satisview_pytest", "uji_tabel", data, "pytest")
    assert result["baris"] == 2 and result["kolom_dipendekkan"] == 1
    conn = ingestion.connect("satisview_pytest")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT segmen, indeks FROM uji_tabel ORDER BY segmen")
            assert cur.fetchall() == [("A", 70.0), ("Semua", 80.5)]
            cur.execute(
                "SELECT col_description('uji_tabel'::regclass, 3)"
            )
            assert cur.fetchone()[0] == long_header
    finally:
        conn.close()
    reloaded = ingestion.read_csv_as_text(io.BytesIO(data).getvalue())
    assert list(reloaded.columns) == list(df.columns)
