"""Validasi pesan respons form web terhadap contracts/kuesioner.json.

Aturannya sama dengan validasi API (backend/src/kuesioner/validasi.js), tetapi
yang diperiksa di sini adalah *baris* sheet yang sudah disusun API — consumer
tidak mempercayai isi topik begitu saja (dataValidation sebelum ke HDFS).
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

MAKS_TEKS = {"teks_singkat": 300, "paragraf": 5000, "lainnya": 200}
POLA_WAKTU = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")


@dataclass(frozen=True)
class Kelompok:
    key: str
    data: dict
    kolom: list[str]

    @property
    def pertanyaan(self) -> list[tuple[str, dict]]:
        return [(b["id"], q) for b in self.data["bagian"] for q in b["pertanyaan"]]


class Kontrak:
    def __init__(self, data: dict) -> None:
        self.data = data
        self.versi = data["versi"]
        self.kolom_waktu = data["kolom_waktu"]
        self.pemisah = data.get("pemisah_pilihan", ", ")
        self.kelompok: dict[str, Kelompok] = {}
        for key, g in data["kelompok"].items():
            kolom = [self.kolom_waktu]
            for b in g["bagian"]:
                for q in b["pertanyaan"]:
                    kolom += [r["kolom"] for r in q["baris"]] if q["jenis"] == "grid" else [q["kolom"]]
            self.kelompok[key] = Kelompok(key, g, kolom)

    @classmethod
    def dari_file(cls, path: str | Path) -> "Kontrak":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    # ------------------------------------------------------------------ util
    def _bagian_dilalui(self, g: Kelompok, baris: dict) -> set[str]:
        ids = [b["id"] for b in g.data["bagian"]]
        dilalui: list[str] = []
        i = 0
        while i < len(ids) and len(dilalui) <= len(ids):
            bagian = g.data["bagian"][i]
            dilalui.append(bagian["id"])
            target = None
            for q in bagian["pertanyaan"]:
                lompat = q.get("lompat") or {}
                nilai = baris.get(q.get("kolom", ""), "")
                if nilai in lompat:
                    target = lompat[nilai]
            nxt = ids.index(target) if target in ids else i + 1
            i = nxt if nxt > i else i + 1
        return set(dilalui)

    def _pecah_centang(self, q: dict, nilai: str) -> tuple[list[str], str]:
        """"A, C, isian lain" -> (["A", "C"], "isian lain") sesuai urutan opsi form."""
        sisa = nilai
        dipilih = []
        for opsi in q["opsi"]:
            if sisa == opsi:
                dipilih.append(opsi)
                sisa = ""
                break
            if sisa.startswith(opsi + self.pemisah):
                dipilih.append(opsi)
                sisa = sisa[len(opsi) + len(self.pemisah):]
        return dipilih, sisa

    # ------------------------------------------------------------- validasi
    def validasi_pesan(self, pesan: object) -> list[str]:
        """Daftar kesalahan (kosong = valid)."""
        if not isinstance(pesan, dict):
            return ["pesan bukan objek JSON"]
        galat: list[str] = []
        if pesan.get("versi") != 1:
            galat.append("versi pesan tidak dikenal")
        try:
            uuid.UUID(str(pesan.get("id_respons")))
        except ValueError:
            galat.append("id_respons bukan UUID")
        if pesan.get("sumber") != "form_web":
            galat.append("sumber harus form_web")
        try:
            datetime.fromisoformat(str(pesan.get("diterima_pada")).replace("Z", "+00:00"))
        except ValueError:
            galat.append("diterima_pada bukan waktu ISO-8601")
        g = self.kelompok.get(pesan.get("kelompok"))
        if g is None:
            return galat + [f"kelompok tidak dikenal: {pesan.get('kelompok')!r}"]
        baris = pesan.get("baris")
        if not isinstance(baris, dict):
            return galat + ["baris tidak ada"]
        if set(baris) != set(g.kolom):
            hilang = [k for k in g.kolom if k not in baris]
            lebih = [k for k in baris if k not in g.kolom]
            return galat + [f"kolom tidak sesuai kontrak (hilang {len(hilang)}, asing {len(lebih)})"]
        if any(not isinstance(v, str) for v in baris.values()):
            return galat + ["semua nilai sel harus teks"]
        if not POLA_WAKTU.match(baris[self.kolom_waktu]):
            galat.append("format Timestamp tidak sesuai")

        dilalui = self._bagian_dilalui(g, baris)
        for bagian_id, q in g.pertanyaan:
            aktif = bagian_id in dilalui
            nama = q["id"]
            if q["jenis"] == "grid":
                for r in q["baris"]:
                    v = baris[r["kolom"]]
                    if not aktif:
                        if v:
                            galat.append(f"{nama}.{r['id']}: harus kosong (bagian dilewati)")
                    elif v and v not in q["skala"]:
                        galat.append(f"{nama}.{r['id']}: nilai di luar skala")
                    elif not v and q.get("wajib"):
                        galat.append(f"{nama}.{r['id']}: wajib diisi")
                continue
            v = baris[q["kolom"]]
            if not aktif:
                if v:
                    galat.append(f"{nama}: harus kosong (bagian dilewati)")
                continue
            if not v:
                if q.get("wajib"):
                    galat.append(f"{nama}: wajib diisi")
                continue
            jenis = q["jenis"]
            if jenis in ("teks_singkat", "paragraf"):
                maks = (q.get("validasi") or {}).get("maks") or MAKS_TEKS[jenis]
                if len(v) > maks:
                    galat.append(f"{nama}: melebihi {maks} karakter")
                pola = (q.get("validasi") or {}).get("pola")
                if pola and not re.search(pola, v):
                    galat.append(f"{nama}: format tidak sesuai")
            elif jenis in ("pilihan_ganda", "dropdown"):
                if v not in q["opsi"] and not (q.get("lainnya") and len(v) <= MAKS_TEKS["lainnya"]):
                    galat.append(f"{nama}: pilihan tidak tersedia")
            elif jenis == "kotak_centang":
                dipilih, lainnya = self._pecah_centang(q, v)
                if lainnya and not q.get("lainnya"):
                    galat.append(f"{nama}: pilihan tidak tersedia")
                jumlah = len(dipilih) + (1 if lainnya else 0)
                if q.get("maks_pilihan") and jumlah > q["maks_pilihan"]:
                    galat.append(f"{nama}: lebih dari {q['maks_pilihan']} pilihan")
            else:
                galat.append(f"{nama}: jenis pertanyaan tidak dikenal")
        return galat
