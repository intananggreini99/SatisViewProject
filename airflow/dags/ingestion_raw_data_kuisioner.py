"""
### SatisView · 3a) ingestion_raw_data_kuisioner

Langkah (f) untuk raw data: raw data respon kuisioner di HDFS — sheet Google
Form (`/satisview/raw/csv/kuisioner_<responden>.csv`) ditambah respons form web
dari Kafka consumer (`/satisview/raw/form_web/<responden>/batch_*.csv`) —
disimpan ke database PostgreSQL **raw_data**, satu tabel per kelompok
(`kuisioner_<responden>`, kolom sama dengan sheet + kolom `Sumber`).

**validation_ingestion** lalu memastikan isi tabel sama dengan raw data di HDFS
(jumlah baris per sumber, kolom, tanpa kolom data pribadi). Laporannya disimpan
di `/satisview/validation/<responden>/validation_ingestion_raw.json`.
"""

from __future__ import annotations

from airflow.decorators import dag, task

from satisview.airflow_helpers import DEFAULT_ARGS, START_DATE, run_step
from satisview.respondents import GROUPS


@dag(
    dag_id="ingestion_raw_data_kuisioner",
    description="HDFS raw data kuisioner (CSV) -> PostgreSQL raw_data",
    schedule=None,  # dipicu oleh gdrive_to_hdfs (atau manual)
    start_date=START_DATE,
    catchup=False,
    max_active_runs=1,
    default_args=DEFAULT_ARGS,
    tags=["satisview", "ingestion", "postgresql"],
    doc_md=__doc__,
)
def ingestion_raw_data_kuisioner():
    for group in GROUPS:

        @task(task_id=f"ingest_{group.key}")
        def ingest(key: str) -> dict:
            from satisview import pipeline

            return run_step(pipeline.ingest_raw, key)

        @task(task_id=f"validation_ingestion_{group.key}", retries=0)
        def validation_ingestion(hasil: dict, key: str) -> dict:
            from satisview import pipeline

            return run_step(pipeline.validate_ingestion_raw, key)

        validation_ingestion(ingest(group.key), group.key)


ingestion_raw_data_kuisioner()
