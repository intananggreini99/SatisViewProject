"""SatisView data pipeline.

Paket ini dipakai oleh DAG Airflow (folder ``dags/``) dan berisi seluruh logika
pipeline sehingga bisa diuji tanpa Airflow:

    Google Drive -> docker volume -> HDFS -> preprocessing -> validasi
    -> analisis -> validasi -> HDFS -> PostgreSQL -> dashboard
"""

__version__ = "1.2.0"
