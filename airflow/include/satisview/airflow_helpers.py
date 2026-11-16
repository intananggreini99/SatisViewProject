"""Bagian yang dipakai bersama oleh DAG SatisView (import ringan)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Callable

import pendulum

from . import config

START_DATE = pendulum.datetime(2026, 1, 1, tz="Asia/Jakarta")
SCHEDULE = config.SCHEDULE
FORM_WEB_SCHEDULE = config.FORM_WEB_SCHEDULE

DEFAULT_ARGS: dict[str, Any] = {
    "owner": "satisview",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=10),
}


def run_step(func: Callable, *args: Any, **kwargs: Any) -> Any:
    """Jalankan langkah pipeline & terjemahkan exception ke status Airflow.

    * ``SkipGroup``        -> task SKIPPED (data kelompok belum tersedia)
    * ``ValidationFailed`` -> task FAILED tanpa retry (data tidak lolos validasi)
    """
    from airflow.exceptions import AirflowFailException, AirflowSkipException

    from .pipeline import SkipGroup
    from .validation import ValidationFailed

    try:
        return func(*args, **kwargs)
    except SkipGroup as exc:
        raise AirflowSkipException(str(exc)) from exc
    except ValidationFailed as exc:
        raise AirflowFailException(str(exc)) from exc
