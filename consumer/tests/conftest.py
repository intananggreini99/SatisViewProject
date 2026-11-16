from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "consumer"))
sys.path.insert(0, str(ROOT / "airflow" / "tests"))  # fake_webhdfs.py dipakai bersama

from fake_webhdfs import FakeWebHdfs  # noqa: E402
from satisview_consumer.kontrak import Kontrak  # noqa: E402

KONTRAK_FILE = ROOT / "contracts" / "kuesioner.json"
KOLOM_SHEET = json.loads((ROOT / "airflow" / "tests" / "data" / "kolom_sheet_asli.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def kontrak() -> Kontrak:
    return Kontrak.dari_file(KONTRAK_FILE)


@pytest.fixture
def fake_hdfs(tmp_path):
    server = FakeWebHdfs(tmp_path / "hdfs").start()
    yield server
    server.stop()


@pytest.fixture
def hdfs_client(fake_hdfs, monkeypatch):
    from satisview_consumer import config
    from satisview_consumer.hdfs import WebHdfsClient

    monkeypatch.setattr(config, "HDFS_ROOT", "/satisview")
    return WebHdfsClient(base_url=fake_hdfs.url, user="root", max_retries=1, retry_wait=0)


@pytest.fixture(scope="session")
def pesan_dari_api() -> dict[str, list[dict]]:
    """Pesan Kafka yang disusun API Node (validasi.js) untuk tiap kelompok.

    Memastikan aturan validasi API & consumer konsisten: semua pesan ini wajib lolos.
    """
    skrip = r"""
    import { loadKontrak, skemaPublik } from './src/kuesioner/kontrak.js';
    import { validasiJawaban } from './src/kuesioner/validasi.js';
    import { jawabanLengkap } from './test/helpers/jawaban.js';
    const k = loadKontrak(process.argv[1]);
    const out = {};
    for (const key of Object.keys(k.kelompok)) {
      const s = skemaPublik(k, key);
      out[key] = [];
      for (const [i, opsi] of [[0, {}], [1, {}], [2, { lompatKlinik: true }]].entries()) {
        const jawaban = jawabanLengkap(s, { pilih: opsi === undefined ? i : i, ...opsi });
        const { galat, baris } = validasiJawaban(k, key, jawaban, { waktu: new Date(Date.UTC(2026, 10, 16, 3, i)) });
        if (Object.keys(galat).length) throw new Error(key + JSON.stringify(galat));
        out[key].push(baris);
      }
    }
    process.stdout.write(JSON.stringify(out));
    """
    try:
        hasil = subprocess.run(
            ["node", "--input-type=module", "-e", skrip, str(KONTRAK_FILE)],
            cwd=ROOT / "backend", capture_output=True, text=True, timeout=60, check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:  # pragma: no cover
        pytest.skip(f"Node.js/backend tidak tersedia: {exc}")
    baris = json.loads(hasil.stdout)
    return {
        key: [
            {"versi": 1, "versi_kontrak": 1, "id_respons": str(uuid.uuid4()), "kelompok": key, "sumber": "form_web",
             "diterima_pada": "2026-11-16T03:00:00.000Z", "baris": b}
            for b in rows
        ]
        for key, rows in baris.items()
    }


def kafka_tersedia() -> str | None:
    return os.getenv("SATISVIEW_TEST_KAFKA")  # mis. 127.0.0.1:19092 (broker uji kfake)
