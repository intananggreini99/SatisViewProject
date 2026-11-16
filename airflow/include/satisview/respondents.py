"""Definisi kelompok responden SatisView.

Setiap kelompok punya satu sheet respons Google Form di folder Google Drive
"Data Responden" dan satu database analisis di PostgreSQL. Konfigurasi kolom
untuk kode tim ada di ``satisview.tim.konfigurasi``.
Modul ini sengaja ringan (tanpa pandas) karena di-import saat DAG di-parse.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RespondentGroup:
    key: str
    label: str
    # Pola regex (case-insensitive) untuk mengenali nama file di Google Drive.
    file_pattern: str
    # Nama dimensi segmen yang dipakai sebagai filter di dashboard (cadangan
    # bila kolom segmen tidak ditemukan di sheet).
    segment_label: str

    @property
    def analysis_db(self) -> str:
        return f"analysis_{self.key}"

    @property
    def raw_table(self) -> str:
        return f"kuisioner_{self.key}"

    def matches_file(self, name: str) -> bool:
        return re.search(self.file_pattern, name or "", flags=re.IGNORECASE) is not None


GROUPS: tuple[RespondentGroup, ...] = (
    RespondentGroup(key="mahasiswa", label="Mahasiswa", file_pattern=r"mahasiswa", segment_label="Program Studi"),
    RespondentGroup(key="dosen", label="Dosen", file_pattern=r"dosen", segment_label="Departemen"),
    RespondentGroup(
        key="karyawan", label="Karyawan", file_pattern=r"karyawan|tendik|tenaga\s*kependidikan", segment_label="Unit Kerja"
    ),
    RespondentGroup(
        key="mitra_kerjasama", label="Mitra Kerja Sama", file_pattern=r"kerja\s*-?\s*sama", segment_label="Jenis Instansi"
    ),
    RespondentGroup(
        key="mitra_pengadaan", label="Mitra Pengadaan", file_pattern=r"pengadaan", segment_label="Jenis Penyedia"
    ),
)

GROUPS_BY_KEY = {g.key: g for g in GROUPS}


def get_group(key: str) -> RespondentGroup:
    try:
        return GROUPS_BY_KEY[key]
    except KeyError as exc:  # pragma: no cover - guard
        raise KeyError(f"Kelompok responden tidak dikenal: {key!r}") from exc


def match_group_for_filename(name: str) -> RespondentGroup | None:
    """Kembalikan kelompok responden yang cocok dengan nama file Drive."""
    for group in GROUPS:
        if group.matches_file(name):
            return group
    return None
