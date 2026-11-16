"""Loop Kafka Consumer: ambil pesan -> proses_batch -> commit offset.

Offset hanya di-commit setelah batch tertulis ke HDFS dan lolos verifikasi
baca-ulang (committed_offset). Bila HDFS/validasi gagal, posisi baca dikembalikan
ke awal batch sehingga pesan diproses ulang; deduplikasi mencegah baris ganda.
"""

from __future__ import annotations

import logging
import signal
import time
from pathlib import Path

from confluent_kafka import Consumer, KafkaError, KafkaException, TopicPartition

from . import config
from .batch import DaftarId, Pesan, proses_batch
from .hdfs import WebHdfsClient
from .kontrak import Kontrak

log = logging.getLogger("satisview.consumer")


class Berhenti(Exception):
    pass


def buat_consumer() -> Consumer:
    return Consumer(
        {
            "bootstrap.servers": config.KAFKA_BROKERS,
            "group.id": config.KAFKA_GROUP_ID,
            "client.id": "satisview-consumer",
            "enable.auto.commit": False,
            "auto.offset.reset": "earliest",
            "enable.partition.eof": False,
            "max.poll.interval.ms": 600_000,
            "session.timeout.ms": 45_000,
            "isolation.level": "read_committed",
            "log_level": 4,
        }
    )


def _heartbeat() -> None:
    try:
        Path(config.HEARTBEAT_FILE).write_text(str(time.time()))
    except OSError:
        pass


class Runner:
    def __init__(self, consumer: Consumer, kontrak: Kontrak, hdfs: WebHdfsClient) -> None:
        self.consumer = consumer
        self.kontrak = kontrak
        self.hdfs = hdfs
        self.indeks = DaftarId(hdfs, kontrak)
        self.jalan = True
        self.gagal_beruntun = 0

    def berhenti(self, *_args) -> None:
        log.info("Sinyal berhenti diterima; menyelesaikan batch yang sedang berjalan...")
        self.jalan = False

    def ambil_batch(self) -> list[Pesan]:
        batch: list[Pesan] = []
        mulai = None
        while self.jalan:
            _heartbeat()
            sisa_waktu = config.BATCH_TUNGGU_DETIK if mulai is None else config.BATCH_TUNGGU_DETIK - (time.monotonic() - mulai)
            if mulai is not None and sisa_waktu <= 0:
                break
            msgs = self.consumer.consume(num_messages=config.BATCH_MAKS - len(batch), timeout=min(1.0, max(0.1, sisa_waktu)))
            for m in msgs:
                err = m.error()
                if err is not None:
                    if err.code() == KafkaError._PARTITION_EOF:
                        continue
                    if err.fatal():
                        raise KafkaException(err)
                    log.warning("Kafka: %s", err)
                    continue
                batch.append(Pesan(m.topic(), m.partition(), m.offset(), m.key(), m.value()))
            if batch and mulai is None:
                mulai = time.monotonic()
            if len(batch) >= config.BATCH_MAKS:
                break
        return batch

    def ulangi_dari_awal(self, batch: list[Pesan]) -> None:
        """Kembalikan posisi baca ke offset pertama batch tiap partisi."""
        awal: dict[tuple[str, int], int] = {}
        for m in batch:
            kunci = (m.topic, m.partition)
            awal[kunci] = min(awal.get(kunci, m.offset), m.offset)
        for (topic, partition), offset in awal.items():
            try:
                self.consumer.seek(TopicPartition(topic, partition, offset))
            except KafkaException as exc:  # partisi sudah dipindah (rebalance): pemilik baru mengulang
                log.warning("Tidak bisa seek %s[%s]: %s", topic, partition, exc)

    def jalankan_sekali(self) -> bool:
        batch = self.ambil_batch()
        if not batch:
            return False
        try:
            hasil = proses_batch(batch, self.kontrak, self.hdfs, self.indeks)
            offsets = [TopicPartition(t, p, o) for (t, p), o in sorted(hasil.offset_commit.items())]
            self.consumer.commit(offsets=offsets, asynchronous=False)  # committed_offset
            log.info("Batch %s pesan: %s; offset di-commit %s", len(batch), hasil.ringkas(),
                     ", ".join(f"p{tp.partition}@{tp.offset}" for tp in offsets))
            self.gagal_beruntun = 0
        except Exception as exc:  # noqa: BLE001 - apa pun penyebabnya, offset tidak di-commit
            self.gagal_beruntun += 1
            jeda = min(config.BACKOFF_MAKS_DETIK, 2 ** min(self.gagal_beruntun, 6))
            log.error("Batch gagal (%s); offset TIDAK di-commit, diulang dalam %.0f detik.", exc, jeda)
            self.ulangi_dari_awal(batch)
            self.indeks._id.clear()  # muat ulang indeks dari HDFS agar konsisten
            tunggu = time.monotonic() + jeda
            while self.jalan and time.monotonic() < tunggu:
                _heartbeat()
                time.sleep(0.5)
        return True

    def jalankan(self) -> None:
        self.consumer.subscribe([config.KAFKA_TOPIC])
        log.info("Consumer '%s' membaca topik %s di %s", config.KAFKA_GROUP_ID, config.KAFKA_TOPIC, config.KAFKA_BROKERS)
        try:
            while self.jalan:
                self.jalankan_sekali()
        finally:
            self.consumer.close()
            log.info("Consumer berhenti.")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    kontrak = Kontrak.dari_file(config.KONTRAK_FILE)
    hdfs = WebHdfsClient(base_url=config.WEBHDFS_URL, user=config.HDFS_USER)
    runner = Runner(buat_consumer(), kontrak, hdfs)
    signal.signal(signal.SIGTERM, runner.berhenti)
    signal.signal(signal.SIGINT, runner.berhenti)
    runner.jalankan()


if __name__ == "__main__":
    main()
