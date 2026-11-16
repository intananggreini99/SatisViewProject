"""
### SatisView · 1) Google Drive → Docker Volume → HDFS

Langkah (a) dan (b) pada desain arsitektur:

1. **extract_gdrive_to_volume** — mengambil sheet respons kuisioner dari folder
   *Data Responden* (diekspor sebagai XLSX + CSV) dan `SatisView_Report.pdf`
   dari folder laporan, lalu menyimpannya di docker volume `satisview_data`.
2. **load_volume_to_hdfs** — menyimpan raw data kuisioner dan dokumen laporan ke HDFS
   (`/satisview/raw/...`, `/satisview/report/...`).
3. Memicu DAG `preprocessing_analysis` dan `ingestion_raw_data_kuisioner`.

Jadwal diatur lewat `SATISVIEW_SCHEDULE` (default tiap 6 jam). Bisa juga dijalankan
manual dari tombol ▶ di Airflow UI.
"""

from __future__ import annotations

from airflow.decorators import dag, task
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

from satisview.airflow_helpers import DEFAULT_ARGS, SCHEDULE, START_DATE, run_step


@dag(
    dag_id="gdrive_to_hdfs",
    description="Ambil data respon kuisioner & laporan dari Google Drive lalu simpan ke HDFS",
    schedule=SCHEDULE,
    start_date=START_DATE,
    catchup=False,
    max_active_runs=1,
    default_args=DEFAULT_ARGS,
    tags=["satisview", "google-drive", "hdfs"],
    doc_md=__doc__,
)
def gdrive_to_hdfs():
    @task(task_id="extract_gdrive_to_volume")
    def extract_gdrive_to_volume() -> dict:
        from satisview import pipeline

        return run_step(pipeline.extract_from_gdrive)

    @task(task_id="load_volume_to_hdfs")
    def load_volume_to_hdfs(manifest: dict) -> dict:
        from satisview import pipeline

        return run_step(pipeline.load_landing_to_hdfs, manifest)

    loaded = load_volume_to_hdfs(extract_gdrive_to_volume())

    trigger_processing = TriggerDagRunOperator(
        task_id="trigger_preprocessing_analysis",
        trigger_dag_id="preprocessing_analysis",
        conf={"dipicu_oleh": "{{ dag.dag_id }}/{{ run_id }}"},
    )
    trigger_raw_ingestion = TriggerDagRunOperator(
        task_id="trigger_ingestion_raw_data_kuisioner",
        trigger_dag_id="ingestion_raw_data_kuisioner",
        conf={"dipicu_oleh": "{{ dag.dag_id }}/{{ run_id }}"},
    )
    loaded >> [trigger_processing, trigger_raw_ingestion]


gdrive_to_hdfs()
