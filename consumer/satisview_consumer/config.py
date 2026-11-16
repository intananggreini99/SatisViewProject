"""Konfigurasi Kafka consumer SatisView (environment variable)."""

from __future__ import annotations

import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, ""))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, ""))
    except ValueError:
        return default


KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC_RESPONS", "satisview.kuesioner.respons")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "satisview-hdfs-writer")

WEBHDFS_URL = (os.getenv("WEBHDFS_URL") or "http://namenode:9870/webhdfs/v1").rstrip("/")
HDFS_USER = os.getenv("HDFS_USER", "root")
HDFS_ROOT = (os.getenv("HDFS_ROOT") or "/satisview").rstrip("/")

KONTRAK_FILE = os.getenv("SATISVIEW_KUESIONER_FILE", "/opt/satisview/contracts/kuesioner.json")

# Batching: tulis ke HDFS setiap BATCH_MAKS pesan atau setelah BATCH_TUNGGU_DETIK.
BATCH_MAKS = max(1, _int("BATCH_MAKS", 200))
BATCH_TUNGGU_DETIK = max(0.5, _float("BATCH_TUNGGU_DETIK", 10.0))
# Jeda maksimum saat HDFS/Kafka bermasalah (backoff eksponensial).
BACKOFF_MAKS_DETIK = max(1.0, _float("BACKOFF_MAKS_DETIK", 60.0))

HEARTBEAT_FILE = os.getenv("HEARTBEAT_FILE", "/tmp/satisview-consumer.heartbeat")


def folder_form_web(kelompok: str) -> str:
    """Folder raw data respon kuisioner dari form web di HDFS."""
    return f"{HDFS_ROOT}/raw/form_web/{kelompok}"


def folder_ditolak() -> str:
    return f"{HDFS_ROOT}/raw/form_web/_ditolak"
