#!/bin/bash
# Dijalankan otomatis oleh image postgres saat volume data pertama kali dibuat.
# Membuat database sesuai desain arsitektur SatisView:
#   raw_data, analysis_mahasiswa, analysis_dosen, analysis_karyawan,
#   analysis_mitra_kerjasama, analysis_mitra_pengadaan
set -eo pipefail

DATABASES="${SATISVIEW_DATABASES:-raw_data analysis_mahasiswa analysis_dosen analysis_karyawan analysis_mitra_kerjasama analysis_mitra_pengadaan}"

for db in $DATABASES; do
  echo "[satisview] membuat database ${db}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE ${db} OWNER "${POSTGRES_USER}"'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')\gexec
EOSQL
done

# Pengguna baca-saja untuk API dashboard (prinsip least privilege).
if [ -n "${DASHBOARD_DB_USER:-}" ] && [ -n "${DASHBOARD_DB_PASSWORD:-}" ]; then
  echo "[satisview] membuat role baca-saja ${DASHBOARD_DB_USER}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DASHBOARD_DB_USER}') THEN
        CREATE ROLE "${DASHBOARD_DB_USER}" LOGIN PASSWORD '${DASHBOARD_DB_PASSWORD}';
      END IF;
    END
    \$\$;
EOSQL
  for db in $DATABASES; do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
      GRANT CONNECT ON DATABASE ${db} TO "${DASHBOARD_DB_USER}";
      GRANT USAGE ON SCHEMA public TO "${DASHBOARD_DB_USER}";
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${DASHBOARD_DB_USER}";
      ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public GRANT SELECT ON TABLES TO "${DASHBOARD_DB_USER}";
EOSQL
  done
fi
echo "[satisview] inisialisasi database selesai"
