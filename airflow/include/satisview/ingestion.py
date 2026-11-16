"""Ingestion file CSV (dari HDFS) ke PostgreSQL.

Aturan: **satu file = satu tabel**, nama kolom & isi sel sama seperti file.
Tidak ada relasi maupun tabel master. Tabel lama diganti secara atomik
dalam satu transaksi (DROP + CREATE + COPY).

Catatan batas PostgreSQL: nama kolom maksimal 63 byte. Judul kolom Google
Form yang lebih panjang dipotong + diberi kode hash pendek agar tetap unik,
dan judul lengkapnya disimpan sebagai COMMENT kolom (bukan tabel tambahan).
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import re
from datetime import datetime, timezone

import pandas as pd

from . import config

log = logging.getLogger(__name__)

PG_IDENT_MAX = 63
_INT_RE = re.compile(r"^[+-]?(0|[1-9]\d*)$")
_FLOAT_RE = re.compile(r"^[+-]?((0|[1-9]\d*)(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")  # tanpa nol di depan


def connect(dbname: str):
    import psycopg2

    return psycopg2.connect(
        host=config.PG_HOST,
        port=config.PG_PORT,
        user=config.PG_USER,
        password=config.PG_PASSWORD,
        dbname=dbname,
        connect_timeout=15,
        application_name="satisview-ingestion",
    )


def ensure_database(dbname: str) -> None:
    """Buat database bila belum ada (script init Postgres juga membuatnya)."""
    import psycopg2
    from psycopg2 import sql

    conn = psycopg2.connect(
        host=config.PG_HOST, port=config.PG_PORT, user=config.PG_USER,
        password=config.PG_PASSWORD, dbname=config.PG_MAINTENANCE_DB, connect_timeout=15,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname)))
                log.info("Database %s dibuat", dbname)
    finally:
        conn.close()


def _grant_dashboard_access(cur, table: str) -> None:
    """Beri role baca-saja dashboard hak SELECT (jika role tersebut ada)."""
    from psycopg2 import sql

    role = config.DASHBOARD_DB_USER
    if not role:
        return
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,))
    if cur.fetchone() is None:
        return
    cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(role)))
    cur.execute(sql.SQL("GRANT SELECT ON {} TO {}").format(sql.Identifier(table), sql.Identifier(role)))


def _truncate_utf8(text: str, max_bytes: int) -> str:
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    return encoded[:max_bytes].decode("utf-8", "ignore").rstrip()


def safe_identifiers(names: list[str]) -> list[str]:
    """Nama kolom sama persis seperti file bila <= 63 byte; jika tidak, dipotong + hash."""
    result: list[str] = []
    used: set[str] = set()
    for raw in names:
        name = str(raw).strip() or "kolom"
        if len(name.encode("utf-8")) > PG_IDENT_MAX:
            digest = hashlib.md5(name.encode("utf-8")).hexdigest()[:6]
            name = f"{_truncate_utf8(name, PG_IDENT_MAX - 8)}~{digest}"
        candidate, n = name, 2
        while candidate in used:
            suffix = f"_{n}"
            candidate = _truncate_utf8(name, PG_IDENT_MAX - len(suffix)) + suffix
            n += 1
        used.add(candidate)
        result.append(candidate)
    return result


def infer_pg_type(values: pd.Series) -> str:
    """Tipe kolom dari teks CSV tanpa mengubah isi sel."""
    non_null = values.dropna()
    non_null = non_null[non_null.str.strip() != ""]
    if non_null.empty:
        return "TEXT"
    if non_null.map(lambda v: bool(_INT_RE.match(v.strip()))).all():
        try:
            if non_null.map(lambda v: abs(int(v)) < 2**63).all():
                return "BIGINT"
        except ValueError:
            return "TEXT"
    if non_null.map(lambda v: bool(_FLOAT_RE.match(v.strip()))).all():
        return "DOUBLE PRECISION"
    lowered = set(non_null.str.strip().str.lower())
    if lowered <= {"true", "false"}:
        return "BOOLEAN"
    return "TEXT"


def read_csv_as_text(data: bytes) -> pd.DataFrame:
    """Baca CSV apa adanya (semua kolom teks, sel kosong -> NULL)."""
    return pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False, na_values=[""], encoding="utf-8-sig")


def table_name_for(file_name: str) -> str:
    stem = re.sub(r"\.csv$", "", file_name, flags=re.IGNORECASE)
    return _truncate_utf8(stem, PG_IDENT_MAX)


def load_dataframe(dbname: str, table: str, df: pd.DataFrame, source: str) -> dict:
    """Ganti isi tabel ``table`` dengan ``df`` (semua kolom bertipe str/NaN)."""
    from psycopg2 import sql

    ensure_database(dbname)
    original_cols = [str(c) for c in df.columns]
    pg_cols = safe_identifiers(original_cols)
    df = df.astype(object).where(df.notna(), None)
    types = [infer_pg_type(df[c].dropna().astype(str)) for c in df.columns]

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    for row in df.itertuples(index=False, name=None):
        writer.writerow(["" if (v is None or (isinstance(v, float) and v != v)) else v for v in row])
    buf.seek(0)

    conn = connect(dbname)
    try:
        with conn:  # satu transaksi: tabel lama diganti atomik
            with conn.cursor() as cur:
                cur.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(table)))
                column_defs = sql.SQL(", ").join(
                    sql.SQL("{} {}").format(sql.Identifier(col), sql.SQL(typ)) for col, typ in zip(pg_cols, types)
                )
                cur.execute(sql.SQL("CREATE TABLE {} ({})").format(sql.Identifier(table), column_defs))
                if len(df):
                    copy_stmt = sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT csv, NULL '')").format(
                        sql.Identifier(table), sql.SQL(", ").join(sql.Identifier(c) for c in pg_cols)
                    )
                    cur.copy_expert(copy_stmt.as_string(cur), buf)
                stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
                cur.execute(
                    sql.SQL("COMMENT ON TABLE {} IS %s").format(sql.Identifier(table)),
                    (f"sumber={source}; diingest={stamp}",),
                )
                for orig, pg_col in zip(original_cols, pg_cols):
                    if orig != pg_col:
                        cur.execute(
                            sql.SQL("COMMENT ON COLUMN {}.{} IS %s").format(sql.Identifier(table), sql.Identifier(pg_col)),
                            (orig,),
                        )
                _grant_dashboard_access(cur, table)
    finally:
        conn.close()
    renamed = sum(1 for a, b in zip(original_cols, pg_cols) if a != b)
    log.info("PostgreSQL %s.%s <- %s (%s baris, %s kolom)", dbname, table, source, len(df), len(pg_cols))
    return {"database": dbname, "tabel": table, "baris": int(len(df)), "kolom": len(pg_cols), "kolom_dipendekkan": renamed}


def load_csv_bytes(dbname: str, table: str, data: bytes, source: str) -> dict:
    return load_dataframe(dbname, table, read_csv_as_text(data), source)
