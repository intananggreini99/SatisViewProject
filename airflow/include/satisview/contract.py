"""Memuat kontrak file CSV (``contracts/data_contract.json``).

Kontrak punya dua tahap: ``preprocessing`` (8 file kode preprocessing tim) dan
``analisis`` (13 file hasil analisis). Kunci tabel adalah nama logis
(mis. ``prioritas_aspek``); nama file nyata didapat dari ``file_name``.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from . import config

_FALLBACKS = (
    Path(__file__).resolve().parents[3] / "contracts" / "data_contract.json",  # repo lokal
    Path(__file__).resolve().parent / "data_contract.json",
)

TAHAP = ("preprocessing", "analisis")


@lru_cache(maxsize=1)
def load_contract() -> dict:
    for path in (config.CONTRACT_FILE, *_FALLBACKS):
        if path and Path(path).is_file():
            return json.loads(Path(path).read_text(encoding="utf-8"))
    raise FileNotFoundError(
        "Kontrak data tidak ditemukan. Pastikan folder ./contracts di-mount ke "
        "/opt/satisview/contracts (lihat docker-compose.yml)."
    )


def tables(tahap: str) -> dict[str, dict]:
    return load_contract()[tahap]


def table_names(tahap: str) -> list[str]:
    return list(tables(tahap).keys())


def spec(tahap: str, nama: str) -> dict:
    return tables(tahap)[nama]


def columns(tahap: str, nama: str) -> list[str]:
    return list(spec(tahap, nama)["kolom"].keys())


def file_name(tahap: str, nama: str, responden: str, bersyarat: str = "bersyarat") -> str:
    return spec(tahap, nama)["file"].format(responden=responden, bersyarat=bersyarat)
