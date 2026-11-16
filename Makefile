# Perintah singkat SatisView (opsional; setara perintah docker compose di README).
.PHONY: setup up down logs ps trigger test reset

setup:            ## salin .env contoh (sekali saja)
	@test -f .env || cp .env.example .env
	@echo "Edit .env bila perlu (password, akses Google Drive)."

up: setup         ## build & jalankan semua service
	docker compose up -d --build

down:             ## hentikan service (data tetap tersimpan di volume)
	docker compose down

logs:             ## ikuti log scheduler Airflow
	docker compose logs -f airflow-scheduler

ps:               ## status container
	docker compose ps

trigger:          ## jalankan pipeline sekarang (tanpa menunggu jadwal)
	docker compose exec airflow-scheduler airflow dags trigger gdrive_to_hdfs

test:             ## uji pipeline (butuh Python 3.11 + requirements) & API
	pytest airflow/tests -q
	cd backend && npm test

reset:            ## HAPUS semua data (HDFS, PostgreSQL, log) lalu mulai ulang
	docker compose down -v
