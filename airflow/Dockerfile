# Image Airflow SatisView: Apache Airflow 2.10.5 (Python 3.11) + dependensi pipeline.
ARG AIRFLOW_VERSION=2.10.5
ARG PYTHON_VERSION=3.11
FROM apache/airflow:${AIRFLOW_VERSION}-python${PYTHON_VERSION}

ARG AIRFLOW_VERSION=2.10.5
ARG PYTHON_VERSION=3.11

USER root
# Folder docker volume data SatisView (dimiliki grup root agar AIRFLOW_UID apa pun bisa menulis).
RUN mkdir -p /opt/satisview/data /opt/satisview/secrets /opt/satisview/contracts \
    && chown -R airflow:0 /opt/satisview \
    && chmod -R g+rwX /opt/satisview

USER airflow
COPY --chown=airflow:0 requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /tmp/requirements.txt \
      --constraint "https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt"

ENV PYTHONPATH=/opt/airflow/include
