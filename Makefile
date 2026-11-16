# Perintah singkat SatisView (opsional; setara perintah docker compose di README).
.PHONY: setup up down logs logs-form ps trigger pengguna test reset

setup:            ## salin .env contoh (sekali saja)
	@test -f .env || cp .env.example .env
	@echo "Edit .env bila perlu (password, akses Google Drive)."

up: setup         ## build & jalankan semua service
	docker compose up -d --build

down:             ## hentikan service (data tetap tersimpan di volume)
	docker compose down

logs:             ## ikuti log scheduler Airflow
	docker compose logs -f airflow-scheduler

logs-form:        ## ikuti log API & Kafka consumer (respons form web)
	docker compose logs -f backend kafka-consumer

ps:               ## status container
	docker compose ps

trigger:          ## jalankan pipeline sekarang (tanpa menunggu jadwal)
	docker compose exec airflow-scheduler airflow dags trigger gdrive_to_hdfs

pengguna:         ## daftar akun pengelola dashboard
	docker compose exec backend npm run pengguna -- daftar

test:             ## uji pipeline, Kafka consumer (Python 3.11 + requirements), API & frontend
	pytest airflow/tests -q
	pytest consumer/tests -q
	cd backend && npm test
	cd frontend && npm run lint && npm run build

reset:            ## HAPUS semua data (HDFS, PostgreSQL, log) lalu mulai ulang
	docker compose down -v
