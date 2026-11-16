"""Inti Kafka Consumer sesuai diagram arsitektur SatisView:

    batching_deduplication_dataValidation -> HDFS_writer -> data_validation -> committed_offset

Modul ini tidak bergantung pada Kafka agar mudah diuji; ``app.py`` yang
mengambil pesan dari topik lalu meng-commit offset setelah fungsi
``proses_batch`` di sini selesai tanpa error.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from . import config
from .hdfs import WebHdfsClient
from .kontrak import Kontrak

log = logging.getLogger(__name__)

KOLOM_META = ["_id_respons", "_diterima_pada", "_sumber", "_kafka"]


class ValidasiTulisGagal(RuntimeError):
    """data_validation: isi file di HDFS tidak sama dengan yang ditulis."""


@dataclass(frozen=True)
class Pesan:
    topic: str
    partition: int
    offset: int
    key: bytes | None
    value: bytes | None


@dataclass
class HasilBatch:
    diterima: dict[str, int] = field(default_factory=dict)  # kelompok -> baris baru
    duplikat: int = 0
    ditolak: int = 0
    file: list[str] = field(default_factory=list)
    offset_commit: dict[tuple[str, int], int] = field(default_factory=dict)  # (topic, partisi) -> offset berikutnya

    def ringkas(self) -> str:
        baru = sum(self.diterima.values())
        return f"{baru} respons baru, {self.duplikat} duplikat dilewati, {self.ditolak} ditolak, {len(self.file)} file"


class DaftarId:
    """Indeks id_respons yang sudah tersimpan di HDFS (deduplikasi lintas batch).

    Dibangun dari isi folder HDFS saat consumer mulai, sehingga tetap benar
    walau consumer berhenti di tengah jalan (file = sumber kebenaran).
    """

    def __init__(self, hdfs: WebHdfsClient, kontrak: Kontrak) -> None:
        self.hdfs = hdfs
        self.kontrak = kontrak
        self._id: dict[str, set[str]] = {}

    def muat(self, kelompok: str) -> set[str]:
        if kelompok in self._id:
            return self._id[kelompok]
        ids: set[str] = set()
        folder = config.folder_form_web(kelompok)
        if self.hdfs.exists(folder):
            for st in self.hdfs.list(folder):
                nama = st["pathSuffix"]
                if st.get("type") != "FILE" or not nama.endswith(".csv"):
                    continue
                teks = self.hdfs.read_bytes(f"{folder}/{nama}").decode("utf-8")
                ids.update(r["_id_respons"] for r in csv.DictReader(io.StringIO(teks)) if r.get("_id_respons"))
        log.info("[%s] %s id respons form web sudah ada di HDFS", kelompok, len(ids))
        self._id[kelompok] = ids
        return ids

    def tambah(self, kelompok: str, ids: list[str]) -> None:
        self.muat(kelompok).update(ids)


def _csv(kolom: list[str], rows: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=kolom, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _nama_file(kelompok: str, pesan: list[Pesan], ids: list[str]) -> str:
    """Nama deterministik: batch yang sama (setelah retry) menimpa file yang sama."""
    partisi = "-".join(str(p) for p in sorted({m.partition for m in pesan}))
    awal = min(m.offset for m in pesan)
    akhir = max(m.offset for m in pesan)
    jejak = hashlib.sha1("\n".join(sorted(ids)).encode()).hexdigest()[:10]
    return f"{config.folder_form_web(kelompok)}/batch_p{partisi}_o{awal}-{akhir}_{jejak}.csv"


def _verifikasi(hdfs: WebHdfsClient, path: str, kolom: list[str], rows: list[dict]) -> None:
    """data_validation: baca ulang dari HDFS, pastikan kolom, jumlah baris & isi sama."""
    teks = hdfs.read_bytes(path).decode("utf-8")
    reader = csv.DictReader(io.StringIO(teks))
    if reader.fieldnames != kolom:
        raise ValidasiTulisGagal(f"{path}: kolom berbeda dari kontrak")
    terbaca = list(reader)
    if len(terbaca) != len(rows):
        raise ValidasiTulisGagal(f"{path}: {len(terbaca)} baris terbaca, seharusnya {len(rows)}")
    for a, b in zip(terbaca, rows):
        if a != b:
            raise ValidasiTulisGagal(f"{path}: isi baris {b['_id_respons']} berbeda setelah ditulis")


def proses_batch(pesan: list[Pesan], kontrak: Kontrak, hdfs: WebHdfsClient, indeks: DaftarId) -> HasilBatch:
    hasil = HasilBatch()
    for m in pesan:
        kunci = (m.topic, m.partition)
        hasil.offset_commit[kunci] = max(hasil.offset_commit.get(kunci, 0), m.offset + 1)

    # 1) batching_deduplication_dataValidation
    per_kelompok: dict[str, list[tuple[Pesan, dict]]] = {}
    ditolak: list[tuple[Pesan, list[str], str]] = []
    dilihat: set[str] = set()
    for m in pesan:
        mentah = (m.value or b"").decode("utf-8", errors="replace")
        try:
            data = json.loads(mentah)
        except json.JSONDecodeError:
            ditolak.append((m, ["bukan JSON"], mentah[:2000]))
            continue
        galat = kontrak.validasi_pesan(data)
        if galat:
            ditolak.append((m, galat, mentah[:20000]))
            continue
        kelompok, rid = data["kelompok"], data["id_respons"].lower()
        if rid in dilihat or rid in indeks.muat(kelompok):
            hasil.duplikat += 1
            continue
        dilihat.add(rid)
        baris = dict(data["baris"])
        baris.update(
            {
                "_id_respons": rid,
                "_diterima_pada": data["diterima_pada"],
                "_sumber": "form_web",
                "_kafka": f"{m.topic}:{m.partition}:{m.offset}",
            }
        )
        per_kelompok.setdefault(kelompok, []).append((m, baris))

    # 2) HDFS_writer  +  3) data_validation
    for kelompok, isi in per_kelompok.items():
        kolom = kontrak.kelompok[kelompok].kolom + KOLOM_META
        rows = [b for _, b in isi]
        ids = [b["_id_respons"] for b in rows]
        path = _nama_file(kelompok, [m for m, _ in isi], ids)
        hdfs.write_bytes(path, _csv(kolom, rows), overwrite=True)
        _verifikasi(hdfs, path, kolom, rows)
        indeks.tambah(kelompok, ids)
        hasil.diterima[kelompok] = len(rows)
        hasil.file.append(path)

    # Pesan tidak valid tidak hilang: disimpan untuk diperiksa (dead letter di HDFS).
    for m, galat, mentah in ditolak:
        path = f"{config.folder_ditolak()}/{m.topic}_p{m.partition}_o{m.offset}.json"
        dokumen = {
            "topic": m.topic,
            "partition": m.partition,
            "offset": m.offset,
            "galat": galat,
            "pesan": mentah,
            "dicatat_pada": datetime.now(timezone.utc).isoformat(),
        }
        data = json.dumps(dokumen, ensure_ascii=False, indent=1).encode("utf-8")
        hdfs.write_bytes(path, data, overwrite=True)
        if json.loads(hdfs.read_bytes(path))["offset"] != m.offset:
            raise ValidasiTulisGagal(f"{path}: catatan pesan ditolak tidak terbaca ulang")
        log.warning("Pesan %s:%s:%s ditolak: %s", m.topic, m.partition, m.offset, "; ".join(galat[:5]))
        hasil.ditolak += 1
    return hasil
