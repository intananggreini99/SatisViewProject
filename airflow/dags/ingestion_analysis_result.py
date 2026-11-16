"""
### SatisView · 3b) ingestion_analysis_result

Langkah (f) untuk hasil analisis: setiap file CSV di HDFS
`/satisview/analysis/<responden>/` diekstraksi dan disimpan ke database
PostgreSQL **analysis_<responden>** (analysis_mahasiswa, analysis_dosen,
analysis_karyawan, analysis_mitra_kerjasama, analysis_mitra_pengadaan).
Satu file = satu tabel, kolom & isi sel sama seperti filenya, tanpa relasi
atau tabel master. Data inilah yang ditampilkan dashboard SatisView.

**validation_ingestion** memeriksa setiap tabel terhadap file CSV sumbernya
(jumlah baris & kolom) dan memastikan tidak ada tabel tanpa file sumber.
"""

from __future__ import annotations

from airflow.decorators import dag, task

from satisview.airflow_helpers import DEFAULT_ARGS, START_DATE, run_step
from satisview.respondents import GROUPS


@dag(
    dag_id="ingestion_analysis_result",
    description="HDFS hasil analisis (CSV) -> PostgreSQL analysis_<responden>",
    schedule=None,  # dipicu oleh preprocessing_analysis (atau manual)
    start_date=START_DATE,
    catchup=False,
    max_active_runs=1,
    default_args=DEFAULT_ARGS,
    tags=["satisview", "ingestion", "postgresql"],
    doc_md=__doc__,
)
def ingestion_analysis_result():
    for group in GROUPS:

        @task(task_id=f"ingest_{group.key}")
        def ingest(key: str) -> dict:
            from satisview import pipeline

            return run_step(pipeline.ingest_analysis, key)

        @task(task_id=f"validation_ingestion_{group.key}", retries=0)
        def validation_ingestion(hasil: dict, key: str) -> dict:
            from satisview import pipeline

            return run_step(pipeline.validate_ingestion_analysis, key)

        validation_ingestion(ingest(group.key), group.key)


ingestion_analysis_result()
