# SatisView

> **Satisfaction & Integrity Service Analytics Dashboard**

SatisView adalah platform analitik survei untuk membantu **Tim Zona Integritas (ZI) kampus** memahami persepsi stakeholder terhadap kualitas pelayanan dan fasilitas secara terstruktur, berbasis data, dan mudah divisualisasikan.

## 🎯 Tujuan

- Mengolah data survei dari mahasiswa, dosen, tendik, dan mitra kampus.
- Mengubah respons Likert menjadi skor aspek.
- Memetakan pola persepsi menggunakan **Multidimensional Scaling (MDS)**.
- Mengidentifikasi aspek yang paling sering dibicarakan dalam komentar.
- Mendukung identifikasi prioritas perbaikan.
- Menyajikan hasil melalui dashboard agregat.

## 👥 Stakeholder

**Pengguna utama:** Tim Zona Integritas.

**Kelompok responden:**
1. Mahasiswa
2. Dosen
3. Tenaga Kependidikan (Tendik)
4. Mitra Kampus

---

## 🧩 Metodologi

### 1. Data Likert → Skor Aspek

Beberapa pertanyaan yang termasuk dalam satu aspek digabungkan menjadi satu skor per responden.

```text
Q1 ─┐
Q2 ─┤
Q3 ─┼──> ASPEK ──> Rata-rata skor
Q4 ─┤
Q5 ─┘
```

Dengan:

```text
Skor Aspek = mean(Q1, Q2, ..., Qn)
```

Pendekatan ini mempertahankan skala 1–4 dan memudahkan perbandingan antar-aspek.

> Instrumen survei telah diuji oleh tim sebelumnya, sehingga proyek ini tidak melakukan CFA sebagai pengujian konstruk ulang.

### 2. Multidimensional Scaling (MDS)

MDS digunakan untuk memvisualisasikan pola kemiripan/perbedaan persepsi.

```text
Data Likert
    ↓
Agregasi Item → Aspek
    ↓
Matriks Responden × Aspek
    ↓
Dissimilarity / Distance
    ↓
MDS
    ↓
Perceptual Map
```

Visualisasi dapat menggunakan:
- **Titik = responden + vektor = aspek**, untuk melihat pola persepsi responden.
- **Titik = aspek**, untuk melihat kedekatan antar-aspek.

Jika menggunakan vektor aspek, vektor merupakan **overlay hasil interpretasi/post-hoc**, bukan keluaran wajib MDS.

### 3. Text Analytics

Fokus text analytics adalah menemukan **aspek yang paling sering dibicarakan**, bukan melakukan sentiment analysis kompleks.

```text
Kritik & Saran
      ↓
Text Preprocessing
      ↓
Aspect Identification
      ↓
Aspect Frequency
      ↓
Ranking Aspek
```

Preprocessing dapat meliputi:
- Case folding
- Cleaning
- Normalisasi
- Tokenization
- Stopword removal
- Stemming

Output:

| Aspek | Frekuensi |
|---|---:|
| Parkir | 127 |
| Wi-Fi | 98 |
| Laboratorium | 76 |
| Toilet | 61 |

---

## 📊 Output Produk

### Dashboard Publik/Agregat
- Overview indeks
- Per-unit/group drill-down
- Prioritas perbaikan
- Tema/aspek komentar
- Export ringkasan

### Output Analitik
- Skor kepuasan per aspek
- Perceptual map MDS
- Distribusi/persebaran responden
- Frekuensi aspek komentar
- Ranking aspek
- Prioritas perbaikan

---

# 🏗️ Arsitektur Sistem

```text
                     GOOGLE FORM
                          │
                          ▼
                   GOOGLE SHEETS
                     Raw Source
                          │
                          ▼
                    ┌───────────┐
                    │  Airflow  │
                    │Orchestrator│
                    └─────┬─────┘
                          │
                          ▼
               ┌────────────────────┐
               │ Railway PostgreSQL │
               │                    │
               │ RAW                │
               │ PROCESSED          │
               │ ANALYTICS          │
               └─────────┬──────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        Preprocessing   MDS     Text Analytics
              │          │          │
              └──────────┼──────────┘
                         ▼
                  Analytics Results
                         │
                         ▼
                    ┌─────────┐
                    │ FastAPI │
                    │ Backend │
                    └────┬────┘
                         │
                         ▼
                 SatisView Dashboard
```

## 🔄 Data Pipeline

### 1. Collection

```text
Google Form → Google Sheets
```

Google Sheets menjadi raw data source.

### 2. Ingestion

Data diambil menggunakan Google Sheets API/library Python dan dimasukkan ke PostgreSQL.

```text
Google Sheets
     ↓
Google Sheets API
     ↓
Ingestion
     ↓
PostgreSQL / raw
```

Pipeline dirancang mendukung **incremental ingestion**, sehingga data baru dapat diproses tanpa mengulang seluruh dataset.

### 3. Preprocessing

- Validasi schema
- Missing value handling
- Duplicate checking
- Encoding Likert
- Standardisasi kategori
- Mapping pertanyaan → aspek
- Text preprocessing

Hasil disimpan pada layer `processed`.

### 4. Analytics

```text
Processed Data
      │
      ├── Satisfaction Analysis
      ├── MDS
      ├── Priority Analysis
      └── Text Analytics
```

Hasil disimpan pada layer `analytics`.

### 5. API & Dashboard

FastAPI menjadi serving layer:

```text
PostgreSQL → FastAPI → Dashboard
```

Contoh endpoint:

```text
GET /api/summary
GET /api/satisfaction
GET /api/mds
GET /api/priority
GET /api/aspects
```

---

# 🗄️ Struktur Database

PostgreSQL menjadi **central data storage**:

```text
PostgreSQL
│
├── raw
│   └── survey_response
│
├── processed
│   └── survey_clean
│
└── analytics
    ├── satisfaction
    ├── mds_result
    ├── priority_result
    └── aspect_frequency
```

### Layer

**RAW**  
Data asli dari sumber, dipertahankan sebagai source of truth.

**PROCESSED**  
Data yang sudah dibersihkan dan ditransformasikan.

**ANALYTICS**  
Hasil analisis yang digunakan oleh API dan dashboard.

---

# 👨‍💻 Kolaborasi Tim

### GitHub
Digunakan untuk source code, SQL, Airflow DAG, backend, dashboard, Docker, dan dokumentasi.

### DVC
Digunakan bila diperlukan untuk versioning dataset/model dan reproducibility.

### Railway
Digunakan sebagai platform deployment untuk PostgreSQL dan backend.

### Docker
Digunakan untuk konsistensi environment development dan deployment.

---

# 📁 Struktur Repository

```text
satisview/
│
├── backend/
│   ├── main.py
│   ├── api/
│   └── services/
│
├── ingestion/
│   ├── google_sheet.py
│   └── transform.py
│
├── preprocessing/
│   ├── likert.py
│   └── text.py
│
├── analytics/
│   ├── satisfaction.py
│   ├── mds.py
│   ├── priority.py
│   └── text_analytics.py
│
├── dashboard/
│   └── app.py
│
├── airflow/
│   └── dags/
│
├── sql/
│   ├── schema.sql
│   └── views.sql
│
├── tests/
├── docs/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── dvc.yaml
└── README.md
```

---

# 🛠️ Teknologi

| Komponen | Teknologi |
|---|---|
| Data Collection | Google Forms |
| Raw Source | Google Sheets |
| Ingestion | Python / Google Sheets API |
| Orchestration | Apache Airflow |
| Database | PostgreSQL |
| Hosting | Railway |
| Processing | Python / Pandas |
| MDS | Python / scikit-learn |
| Text Analytics | Python / NLP |
| Backend | FastAPI |
| Dashboard | Streamlit / Web UI |
| Version Control | Git + GitHub |
| Data/Model Versioning | DVC |
| Containerization | Docker |
| Deployment | Railway |

---

# 🎯 KPI

## KPI Produk

- Data baru dapat masuk secara otomatis.
- Dashboard dapat menampilkan data agregat.
- Dashboard mendukung drill-down.
- Hasil analitik dapat diperbarui tanpa pengolahan manual penuh.
- Pengguna dapat melihat prioritas perbaikan.
- Pengguna dapat melihat aspek yang paling sering dibicarakan.

## KPI Analitik

- Skor/indeks kepuasan.
- Distribusi skor per aspek.
- Persebaran pada perceptual map.
- **Stress MDS** sebagai indikator goodness-of-fit.
- Frekuensi penyebutan aspek pada komentar.
- Ranking aspek.
- Prioritas perbaikan.

---

# 🔐 Privacy & Data Governance

Dashboard publik hanya menampilkan **data agregat**.

Prinsip:
- Tidak menampilkan identitas pribadi responden.
- Tidak mengekspos raw response melalui API publik.
- Dashboard publik menggunakan data agregat.
- Database menggunakan role/access sesuai kebutuhan.
- Backend menggunakan credential yang aman.
- Secret dan credential tidak disimpan di repository.

---

# 🚀 Roadmap

## Phase 1 — Data & Analysis
- [ ] Finalisasi struktur dataset
- [ ] Mapping pertanyaan → aspek
- [ ] Data preprocessing
- [ ] Agregasi skor aspek
- [ ] MDS
- [ ] Text analytics
- [ ] Priority analysis

## Phase 2 — Pipeline
- [ ] Google Sheets API
- [ ] Incremental ingestion
- [ ] PostgreSQL
- [ ] ETL pipeline
- [ ] Airflow scheduling

## Phase 3 — Product
- [ ] FastAPI
- [ ] Dashboard
- [ ] Drill-down
- [ ] Export summary
- [ ] Access management

## Phase 4 — Deployment
- [ ] Docker
- [ ] Railway deployment
- [ ] Testing
- [ ] Monitoring
- [ ] Backup & recovery

---

# 👥 Team

| Nama | Role |
|---|---|
| Nama 1 | Data Engineer |
| Nama 2 | Data Scientist |
| Nama 3 | Backend Engineer |
| Nama 4 | Data Analyst / Dashboard |

---

# 📜 License

Tambahkan lisensi sesuai kebutuhan proyek dan kebijakan institusi.

---

## Project Status

**Status:** Development / Prototype

SatisView dikembangkan sebagai platform analitik survei untuk mendukung evaluasi kualitas pelayanan dan fasilitas kampus dalam konteks Zona Integritas.
#
