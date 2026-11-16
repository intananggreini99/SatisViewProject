"""Nama tampilan aspek (layanan/fasilitas) untuk dashboard.

Nama aspek dari kode tim tetap menjadi kunci data (mis. ``"Parkir kampus"``).
Untuk tampilan dibuat:

  label     = "Layanan Administrasi Keuangan" / "Parkir Kampus"  (judul akordeon)
  singkatan = "Adm. Keuangan" / "Parkir" / "TIK & SI"             (label titik peta)
  kelompok  = "Layanan" | "Fasilitas"                             (warna titik peta)
"""

from __future__ import annotations

import re

FASILITAS_PATTERN = re.compile(
    r"\b(ruang|laboratorium|lab|perpustakaan|toilet|wc|parkir|lingkungan|tik|internet|wi-?fi|"
    r"sarana|prasarana|fasilitas|gedung|kantin|ibadah|masjid|mushol+a|olahraga|kebersihan)\b"
    r"|teknologi informasi|sistem informasi",
    re.IGNORECASE,
)

_ENUM_RE = re.compile(r"^\s*(?:[A-Za-z]|\d{1,2}|[IVX]{1,4})[.)]\s+")


def clean_text(value: object) -> str:
    text = str(value if value is not None else "").replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def canonical_layanan(name: str) -> str:
    """Hapus penomoran ("1. ", "A. ") dan awalan "Layanan "."""
    text = _ENUM_RE.sub("", clean_text(name))
    text = re.sub(r"^layanan\s+", "", text, flags=re.IGNORECASE)
    return text.strip(" :-") or clean_text(name)


def kelompok_layanan(name: str) -> str:
    return "Fasilitas" if FASILITAS_PATTERN.search(canonical_layanan(name)) else "Layanan"


SERVICE_UNIT_PATTERN = re.compile(
    r"^(administrasi|kemahasiswaan|kepegawaian|sdm|penelitian|pengabdian|akademik|keuangan|klinik)\b", re.IGNORECASE
)


def label_layanan(name: str) -> str:
    """Awalan "Layanan" untuk unit layanan (gaya desain); "kampus" ditulis kapital."""
    canon = re.sub(r"\bkampus\b", "Kampus", canonical_layanan(name))
    if kelompok_layanan(canon) == "Layanan" and SERVICE_UNIT_PATTERN.search(canon):
        return f"Layanan {canon}"
    return canon


_SHORT_RULES: tuple[tuple[str, str], ...] = (
    (r"\bTIK\s*(?:&|dan)\s*Sistem Informasi\b", "TIK & SI"),
    (r"\bTeknologi Informasi(?: dan| &) Komunikasi\b", "TIK"),
    (r"\bSistem Informasi\b", "SI"),
    (r"\bAdministrasi\b", "Adm."),
    (r"\bPenelitian\s*(?:&|dan)\s*Pengabdian(?: kepada Masyarakat)?\b", "Penelitian & PkM"),
    (r"\bLingkungan Kampus\b", "Lingkungan"),
    (r"\bKerja\s*Sama\b", "Kerja Sama"),
    (r"\s+kampus$", ""),  # "Parkir kampus" -> "Parkir", "TIK & SI kampus" -> "TIK & SI"
)


# Dipakai hanya bila singkatan masih terlalu panjang.
_SHORT_RULES_PANJANG: tuple[tuple[str, str], ...] = (
    (r"\s+dan\s+", " & "),
    (r"^(?:proses|pelayanan)\s+", ""),  # "Proses Pemilihan Penyedia" -> "Pemilihan Penyedia"
)


def singkatan_layanan(name: str, max_len: int = 24) -> str:
    text = canonical_layanan(name)
    for pattern, repl in _SHORT_RULES:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    for pattern, repl in _SHORT_RULES_PANJANG:
        if len(text) <= max_len:
            break
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE).strip()
    if len(text) > max_len:  # potong di batas kata
        kata, hasil = text.split(" "), ""
        for k in kata:
            if len(f"{hasil} {k}".strip()) > max_len - 1:
                break
            hasil = f"{hasil} {k}".strip()
        text = (hasil or text[: max_len - 1]).rstrip(" &,") + "…"
    return text[:1].upper() + text[1:]


def slug(text: str) -> str:
    value = re.sub(r"[^0-9a-zA-Z]+", "_", clean_text(text).lower()).strip("_")
    return value or "kolom"
