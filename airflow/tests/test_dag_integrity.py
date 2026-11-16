"""DAG harus bisa di-import Airflow dan sesuai desain arsitektur."""

from pathlib import Path

import pytest

airflow = pytest.importorskip("airflow", reason="Apache Airflow tidak terinstal")

DAG_FOLDER = Path(__file__).resolve().parents[1] / "dags"


@pytest.fixture(scope="module")
def dagbag():
    from airflow.models import DagBag

    return DagBag(dag_folder=str(DAG_FOLDER), include_examples=False)


def test_no_import_errors(dagbag):
    assert dagbag.import_errors == {}


def test_expected_dags(dagbag):
    assert set(dagbag.dag_ids) == {
        "gdrive_to_hdfs",
        "preprocessing_analysis",
        "ingestion_raw_data_kuisioner",
        "ingestion_analysis_result",
    }


def test_processing_chain_matches_architecture(dagbag):
    dag = dagbag.dags["preprocessing_analysis"]
    for group in ["mahasiswa", "dosen", "karyawan", "mitra_kerjasama", "mitra_pengadaan"]:
        chain = ["data_preprocessing", "validation_preprocessing", "analysis", "validation_analysis"]
        for upstream, downstream in zip(chain, chain[1:]):
            task = dag.get_task(f"{group}.{upstream}")
            assert f"{group}.{downstream}" in task.downstream_task_ids
    assert dag.get_task("trigger_ingestion_analysis_result").trigger_rule == "all_done"


def test_gdrive_dag_triggers_followups(dagbag):
    dag = dagbag.dags["gdrive_to_hdfs"]
    load = dag.get_task("load_volume_to_hdfs")
    assert load.downstream_task_ids == {"trigger_preprocessing_analysis", "trigger_ingestion_raw_data_kuisioner"}
