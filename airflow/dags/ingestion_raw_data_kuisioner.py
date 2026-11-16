"""
### SatisView · 3a) ingestion_raw_data_kuisioner

Langkah (f) untuk raw data: file CSV raw data respon kuisioner di HDFS
(`/satisview/raw/csv/kuisioner_<responden>.csv`) diekstraksi lalu disimpan ke
database PostgreSQL **raw_data** — satu file menjadi satu tabel
(`kuisioner_<responden>`) dengan kolom dan isi sel sama seperti filenya.
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

        ingest(group.key)


ingestion_raw_data_kuisioner()
