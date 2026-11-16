"""
### SatisView · 2) Preprocessing & Analisis

Langkah (c), (d), (e) pada desain arsitektur. Untuk setiap kelompok responden
(Mahasiswa, Dosen, Karyawan, Mitra Kerja Sama, Mitra Pengadaan) dijalankan:

`data_preprocessing → validation_preprocessing → analysis → validation_analysis`

* **data_preprocessing** — raw data kuisioner (XLSX) diambil dari HDFS lalu
  diproses dengan kode preprocessing tim (`satisview/tim/preprocessing.py`,
  port `preprocssing-mahasiswa-finalpakeygini.ipynb`) menjadi 7–8 CSV:
  `likert_<r>_utama_clean`, `teks_<r>_clean`, `kategori_<r>_clean`,
  `kamus_item_aspek_<r>`, `skor_aspek_<r>`, `ringkasan_item_<r>`,
  `ringkasan_aspek_<r>` (+ `likert_mahasiswa_klinik_clean` untuk Mahasiswa).
* **validation_preprocessing** — CSV tersebut divalidasi terhadap
  `contracts/data_contract.json` (+ cek konversi skor, PII, kamus aspek);
  bila lolos disimpan ke HDFS `/satisview/preprocessed/<responden>/`.
* **analysis** — kode analisis tim: text analytics (Sastrawi + kamus kata
  kunci), priority analysis (skor prioritas 1/3 + 1/3 + 1/3) dan MDS
  (scikit-learn, Stress-1), dijalankan untuk semua responden dan per segmen;
  ditambah tabel KPI untuk dashboard.
* **validation_analysis** — 13 CSV hasil analisis divalidasi terhadap
  `contracts/data_contract.json`; bila lolos menggantikan isi HDFS
  `/satisview/analysis/<responden>/`.

Kelompok yang belum punya data di-*skip*; kegagalan satu kelompok tidak
menghentikan kelompok lain. Setelah semuanya selesai, DAG
`ingestion_analysis_result` dipicu.
"""

from __future__ import annotations

from airflow.decorators import dag, task
from airflow.operators.trigger_dagrun import TriggerDagRunOperator
from airflow.utils.task_group import TaskGroup
from airflow.utils.trigger_rule import TriggerRule

from satisview.airflow_helpers import DEFAULT_ARGS, START_DATE, run_step
from satisview.respondents import GROUPS


@dag(
    dag_id="preprocessing_analysis",
    description="Preprocessing, validasi, analisis, dan validasi hasil analisis per kelompok responden",
    schedule=None,  # dipicu oleh gdrive_to_hdfs (atau manual)
    start_date=START_DATE,
    catchup=False,
    max_active_runs=1,
    default_args=DEFAULT_ARGS,
    tags=["satisview", "preprocessing", "analysis"],
    doc_md=__doc__,
)
def preprocessing_analysis():
    groups = []
    for group in GROUPS:
        with TaskGroup(group_id=group.key, tooltip=f"Responden {group.label}") as tg:

            @task(task_id="data_preprocessing")
            def data_preprocessing(key: str) -> dict:
                from satisview import pipeline

                return run_step(pipeline.step_preprocessing, key)

            @task(task_id="validation_preprocessing", retries=0)
            def validation_preprocessing(result: dict) -> dict:
                from satisview import pipeline

                return run_step(pipeline.step_validation_preprocessing, result)

            @task(task_id="analysis")
            def analysis(result: dict) -> dict:
                from satisview import pipeline

                return run_step(pipeline.step_analysis, result)

            @task(task_id="validation_analysis", retries=0)
            def validation_analysis(result: dict) -> dict:
                from satisview import pipeline

                return run_step(pipeline.step_validation_analysis, result)

            validation_analysis(analysis(validation_preprocessing(data_preprocessing(group.key))))
        groups.append(tg)

    trigger_ingestion = TriggerDagRunOperator(
        task_id="trigger_ingestion_analysis_result",
        trigger_dag_id="ingestion_analysis_result",
        conf={"dipicu_oleh": "{{ dag.dag_id }}/{{ run_id }}"},
        trigger_rule=TriggerRule.ALL_DONE,  # tetap jalan walau ada kelompok yang gagal/skip
    )
    groups >> trigger_ingestion


preprocessing_analysis()
