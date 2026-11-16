"""Integrasi dengan broker Kafka sungguhan (protokol Kafka).

Jalankan dengan broker uji, mis.:  SATISVIEW_TEST_KAFKA=127.0.0.1:19092 pytest consumer/tests
(di Docker: broker `kafka:9092`). Dilewati bila variabel tidak di-set.
"""

import json
import time
import uuid

import pytest
from conftest import kafka_tersedia

from satisview_consumer import config

BROKER = kafka_tersedia()
pytestmark = pytest.mark.skipif(not BROKER, reason="SATISVIEW_TEST_KAFKA tidak di-set")


@pytest.fixture
def topik(monkeypatch):
    from confluent_kafka.admin import AdminClient, NewTopic

    nama = f"uji.kuesioner.{uuid.uuid4().hex[:8]}"
    admin = AdminClient({"bootstrap.servers": BROKER})
    admin.create_topics([NewTopic(nama, num_partitions=2, replication_factor=1)])[nama].result(15)
    monkeypatch.setattr(config, "KAFKA_BROKERS", BROKER)
    monkeypatch.setattr(config, "KAFKA_TOPIC", nama)
    monkeypatch.setattr(config, "KAFKA_GROUP_ID", f"grup-{nama}")
    monkeypatch.setattr(config, "BATCH_TUNGGU_DETIK", 1.0)
    monkeypatch.setattr(config, "BACKOFF_MAKS_DETIK", 1.0)
    return nama


def _kirim(topik, daftar):
    from confluent_kafka import Producer

    p = Producer({"bootstrap.servers": BROKER, "acks": "all"})
    for pesan in daftar:
        p.produce(topik, key=pesan["kelompok"], value=json.dumps(pesan).encode("utf-8"))
    assert p.flush(15) == 0


def _runner(kontrak, hdfs_client):
    from satisview_consumer.app import Runner, buat_consumer

    return Runner(buat_consumer(), kontrak, hdfs_client)


def _committed(topik):
    from confluent_kafka import Consumer, TopicPartition

    c = Consumer({"bootstrap.servers": BROKER, "group.id": config.KAFKA_GROUP_ID})
    try:
        return {tp.partition: tp.offset for tp in c.committed([TopicPartition(topik, i) for i in range(2)], timeout=10)}
    finally:
        c.close()


def _jalankan_sampai(runner, kondisi, batas=30):
    mulai = time.time()
    while time.time() - mulai < batas and not kondisi():
        runner.jalankan_sekali()


def test_alur_kafka_ke_hdfs_dan_commit_offset(kontrak, hdfs_client, pesan_dari_api, topik):
    semua = [p for daftar in pesan_dari_api.values() for p in daftar]
    _kirim(topik, semua + semua[:3])  # tiga pesan terkirim ganda
    runner = _runner(kontrak, hdfs_client)
    runner.consumer.subscribe([topik])
    jumlah = lambda: sum(len(runner.indeks.muat(k)) for k in pesan_dari_api)  # noqa: E731
    _jalankan_sampai(runner, lambda: jumlah() >= len(semua) and sum(max(o, 0) for o in _committed(topik).values()) >= len(semua) + 3)
    runner.consumer.close()
    assert jumlah() == len(semua)
    assert sum(max(o, 0) for o in _committed(topik).values()) == len(semua) + 3


def test_hdfs_gagal_offset_tidak_dicommit_lalu_diulang(kontrak, hdfs_client, pesan_dari_api, topik, monkeypatch):
    _kirim(topik, pesan_dari_api["dosen"])
    runner = _runner(kontrak, hdfs_client)
    runner.consumer.subscribe([topik])
    asli = hdfs_client.write_bytes
    percobaan = {"n": 0}

    def kadang_gagal(*a, **k):
        percobaan["n"] += 1
        if percobaan["n"] == 1:
            raise ConnectionError("namenode belum siap")
        return asli(*a, **k)

    monkeypatch.setattr(hdfs_client, "write_bytes", kadang_gagal)
    _jalankan_sampai(runner, lambda: percobaan["n"] >= 1)
    assert sum(max(o, 0) for o in _committed(topik).values()) == 0  # belum di-commit
    _jalankan_sampai(runner, lambda: len(runner.indeks.muat("dosen")) == 3)
    _jalankan_sampai(runner, lambda: sum(max(o, 0) for o in _committed(topik).values()) == 3, batas=10)
    runner.consumer.close()
    assert len(runner.indeks.muat("dosen")) == 3
    assert sum(max(o, 0) for o in _committed(topik).values()) == 3
