"""
### form_web_to_pipeline — respons form web SatisView masuk ke pipeline

Respons dari halaman form kuisioner dikirim API ke **Kafka**, lalu Kafka
consumer menulis batch CSV ke HDFS `/satisview/raw/form_web/<responden>/`.
DAG ini memeriksa folder tersebut secara berkala; bila ada batch baru, DAG
`preprocessing_analysis` dan `ingestion_raw_data_kuisioner` dipicu sehingga
dashboard ikut diperbarui tanpa menunggu jadwal `gdrive_to_hdfs`.

Jadwal: `SATISVIEW_FORM_WEB_SCHEDULE` (default tiap 15 menit, "none" = manual).
"""

from __future__ import annotations

from airflow.decorators import dag, task
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

from satisview.airflow_helpers import DEFAULT_ARGS, FORM_WEB_SCHEDULE, START_DATE, run_step


@dag(
    dag_id="form_web_to_pipeline",
    description="Batch respons form web (Kafka -> HDFS) baru? Picu preprocessing & ingestion",
    schedule=FORM_WEB_SCHEDULE,
    start_date=START_DATE,
    catchup=False,
    max_active_runs=1,
    default_args=DEFAULT_ARGS,
    tags=["satisview", "kafka", "form-web"],
    doc_md=__doc__,
)
def form_web_to_pipeline():
    @task.short_circuit(task_id="cek_batch_form_web_baru")
    def cek() -> dict | bool:
        from satisview import pipeline

        hasil = run_step(pipeline.cek_form_web_baru)
        return hasil if hasil["berubah"] else False

    @task(task_id="simpan_penanda")
    def simpan(hasil: dict) -> None:
        from satisview import pipeline

        pipeline.simpan_jejak_form_web(hasil["jejak"])

    hasil = cek()
    picu_proses = TriggerDagRunOperator(
        task_id="trigger_preprocessing_analysis",
        trigger_dag_id="preprocessing_analysis",
        conf={"dipicu_oleh": "{{ dag.dag_id }}/{{ run_id }}"},
    )
    picu_raw = TriggerDagRunOperator(
        task_id="trigger_ingestion_raw_data_kuisioner",
        trigger_dag_id="ingestion_raw_data_kuisioner",
        conf={"dipicu_oleh": "{{ dag.dag_id }}/{{ run_id }}"},
    )
    hasil >> [picu_proses, picu_raw]
    [picu_proses, picu_raw] >> simpan(hasil)


form_web_to_pipeline()
