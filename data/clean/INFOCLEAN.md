# Ringkasan Output Preprocessing Mahasiswa (Phase 1)

Dokumen ini menjelaskan 8 file CSV hasil preprocessing data survei **mahasiswa**, fungsi masing-masing, dan kaitannya dengan roadmap **Phase 1 — Data & Analysis** di README SatisView.

Semua file disimpan di `data/clean/`.

---

## 1. Gambaran Alur

```text
Pelayanan Kepuasan - Mahasiswa.xlsx   (raw, 418 responden, 74 kolom)
        │
        ├─ buang PII (Nomor Gopay) + beri response_id
        │
        ├─ Likert utama (58 item) ──► likert_mahasiswa_utama_clean.csv
        ├─ Likert klinik (9 item) ──► likert_mahasiswa_klinik_clean.csv
        ├─ Teks terbuka ───────────► teks_mahasiswa_clean.csv
        ├─ Pilihan prioritas ──────► kategori_mahasiswa_clean.csv
        │
        ├─ Mapping item → aspek ───► kamus_item_aspek_mahasiswa.csv
        │
        ├─ Agregasi per responden ─► skor_aspek_mahasiswa.csv
        └─ Agregasi lintas responden
              ├─► ringkasan_item_mahasiswa.csv
              └─► ringkasan_aspek_mahasiswa.csv
```

Empat file pertama adalah **hasil cleaning**. Empat file terakhir adalah **hasil turunan** yang dibuat dari file cleaning dan kamus.

---

## 2. Tabel Ringkasan 8 File

| No | File | Isi | Level | Item Roadmap Phase 1 |
|---|---|---|---|---|
| 1 | `likert_mahasiswa_utama_clean.csv` | Skor 1–4 untuk 58 pertanyaan wajib, satu kolom per pertanyaan | Per responden, per item | Data preprocessing |
| 2 | `likert_mahasiswa_klinik_clean.csv` | Skor 1–4 untuk 9 pertanyaan klinik, hanya responden yang mengisi | Per responden, per item | Data preprocessing |
| 3 | `teks_mahasiswa_clean.csv` | Komentar/saran terbuka, format long | Per jawaban | Data preprocessing (siap text analytics) |
| 4 | `kategori_mahasiswa_clean.csv` | Pilihan layanan prioritas (maks. 3 per responden), satu baris per pilihan | Per pilihan | Data preprocessing (input priority analysis) |
| 5 | `kamus_item_aspek_mahasiswa.csv` | Tabel label: setiap pertanyaan masuk aspek apa | Per item | Mapping pertanyaan → aspek |
| 6 | `skor_aspek_mahasiswa.csv` | Rata-rata skor per aspek untuk setiap responden | Per responden, per aspek | Agregasi skor aspek, input MDS |
| 7 | `ringkasan_item_mahasiswa.csv` | Rata-rata tiap pertanyaan dari seluruh responden | Per item (lintas responden) | Dashboard: drill-down |
| 8 | `ringkasan_aspek_mahasiswa.csv` | Rata-rata tiap aspek dari seluruh responden | Per aspek (lintas responden) | Dashboard: overview indeks |

---

## 3. Penjelasan per File

### 3.1 `likert_mahasiswa_utama_clean.csv`
- **Isi:** `response_id`, kolom profil (Timestamp, Program Studi, Semester), dan 58 kolom pertanyaan Likert.
- **Proses:** teks skala seperti `"3 - Baik"` diambil angka depannya menjadi `3`. Skala 1–4 (1 = Tidak Baik, 2 = Kurang Baik, 3 = Baik, 4 = Sangat Baik).
- **Fungsi:** sumber data utama. File 6, 7, dan 8 dihitung dari file ini.

### 3.2 `likert_mahasiswa_klinik_clean.csv`
- **Isi:** `response_id` dan 9 kolom pertanyaan klinik.
- **Mengapa dipisah:** pertanyaan klinik bersifat bersyarat. Hanya mahasiswa yang pernah memakai layanan klinik yang menjawab, sehingga nilai kosong di sini berarti "tidak relevan", bukan "data hilang".
- **Fungsi:** menjaga jumlah responden (N) item klinik tidak tercampur dengan item lain. Baris yang seluruh kolom kliniknya kosong dibuang.

### 3.3 `teks_mahasiswa_clean.csv`
- **Isi:** `response_id`, `jenis_pertanyaan`, `teks_komentar`.
- **Fungsi:** bahan untuk text analytics (aspek yang paling sering dibicarakan). Baris kosong sudah dibuang.

### 3.4 `kategori_mahasiswa_clean.csv`
- **Isi:** `response_id`, `jenis_pertanyaan`, `pilihan`.
- **Proses:** jawaban multi-pilih ("A, B, C") dipecah menjadi satu baris per pilihan.
- **Fungsi:** menghitung layanan/fasilitas yang paling sering dipilih sebagai prioritas peningkatan. Ini menjadi masukan untuk **priority analysis**.

### 3.5 `kamus_item_aspek_mahasiswa.csv`
- **Isi:** `item_kode`, `pertanyaan`, `aspek`, `nama_kolom_asli`.
- **Proses:** aspek diekstrak otomatis dari teks nama kolom, bukan dari hitungan baris manual, supaya tidak ada item yang salah label.
- **Fungsi:** tabel referensi bersama. Karena README tidak memakai CFA, pengelompokan item ke aspek ditentukan dari struktur form dan **perlu disepakati tim**.

Hasil verifikasi terhadap file asli:

| Aspek | Jumlah Item |
|---|---:|
| Administrasi Akademik | 9 |
| Kemahasiswaan | 10 |
| Administrasi Keuangan | 9 |
| Administrasi Umum | 9 |
| Ruang Kuliah | 3 |
| Laboratorium | 3 |
| Perpustakaan | 3 |
| TIK dan Sistem Informasi | 3 |
| Toilet | 3 |
| Parkir | 3 |
| Lingkungan Kampus | 3 |
| Klinik Kampus | 9 |

### 3.6 `skor_aspek_mahasiswa.csv`
- **Isi:** `response_id` dan satu kolom per aspek (12 aspek).
- **Rumus:** `Skor Aspek = mean(Q1, Q2, ..., Qn)` untuk item-item dalam aspek itu, dihitung per responden.
- **Fungsi:** inilah **Matriks Responden × Aspek** pada diagram README, yaitu input MDS. Kolom Klinik bernilai kosong untuk responden yang tidak mengisi.

### 3.7 `ringkasan_item_mahasiswa.csv`
- **Isi:** `item_kode`, `pertanyaan`, `aspek`, `rata_rata`, `n_responden`.
- **Fungsi:** dashboard bagian drill-down, untuk melihat pertanyaan spesifik mana yang skornya rendah di dalam suatu aspek.

### 3.8 `ringkasan_aspek_mahasiswa.csv`
- **Isi:** `aspek`, `rata_rata`, `jumlah_item`, diurutkan dari skor terendah.
- **Rumus:** rata-rata dari rata-rata item di aspek tersebut.
- **Fungsi:** dashboard bagian overview indeks, dan petunjuk awal prioritas perbaikan.

---

## 4. Pemetaan ke Roadmap Phase 1

| Item Roadmap Phase 1 | Status | File Terkait |
|---|---|---|
| Finalisasi struktur dataset | Selesai untuk mahasiswa | File 1–4 |
| Mapping pertanyaan → aspek | Selesai untuk mahasiswa (perlu disepakati tim) | File 5 |
| Data preprocessing | Selesai untuk mahasiswa | File 1–4 |
| Agregasi skor aspek | Selesai untuk mahasiswa | File 6, 7, 8 |
| MDS | Menunggu (orang 2) | Input: file 6 |
| Text analytics | Menunggu | Input: file 3 |
| Priority analysis | Menunggu | Input: file 4, 7, 8 |

---

## 5. Siapa Memakai File Apa

| Peran | File yang dipakai |
|---|---|
| Analisis MDS | `skor_aspek_mahasiswa.csv` |
| Text analytics | `teks_mahasiswa_clean.csv` |
| Priority analysis | `kategori_mahasiswa_clean.csv`, `ringkasan_aspek_mahasiswa.csv`, `ringkasan_item_mahasiswa.csv` |
| Backend/API | Semua, sebagai acuan skema tabel |
| Dashboard | `ringkasan_aspek_mahasiswa.csv`, `ringkasan_item_mahasiswa.csv`, hasil text analytics |

---

## 6. Kaitan dengan Skema PostgreSQL (Usulan)

README merancang tiga layer: `raw`, `processed`, `analytics`. Usulan pemetaan, **perlu dikonfirmasi dengan pemegang `schema.sql`**:

| Layer | File CSV |
|---|---|
| `processed` | File 1, 2, 3, 4 |
| `analytics` | File 6, 7, 8 |
| Tabel referensi | File 5 |

CSV ini adalah bentuk sementara selama Phase 1. Di Phase 2, logikanya dipindahkan ke `preprocessing/likert.py` dan `preprocessing/text.py`, lalu dijalankan terhadap data dari PostgreSQL.

---

## 7. Catatan Penting

1. **Privasi.** `Nomor Gopay` sudah dibuang dan tidak ada di file clean. Namun `Timestamp`, `Program Studi`, dan `Semester` masih ada, dan kolom komentar bebas bisa memuat nama orang. Karena repo bersifat public, periksa isi file sebelum di-push.
2. **Kolom yang tidak masuk tabel.** Pertanyaan gerbang klinik ("Apakah Anda pernah menggunakan layanan Klinik?") tidak disimpan. Gunakan untuk mengecek bahwa jumlah responden klinik sesuai dengan jumlah "Ya".
3. **Cara hitung skor aspek.** Skor aspek per responden (file 6) dan rata-rata aspek lintas responden (file 8) bisa berbeda sedikit karena jumlah data kosong per item tidak selalu sama. Keduanya valid untuk tujuan yang berbeda: file 6 untuk MDS, file 8 untuk dashboard.
4. **Konsistensi skala.** Mahasiswa memakai skala 1–4, sesuai README. Pastikan kelompok lain memakai skala yang sama sebelum digabung.
5. **Pola yang sama untuk kelompok lain.** Dosen, karyawan, mitra kerja sama, dan mitra pengadaan mengikuti struktur ini dengan mengganti sufiks `_mahasiswa`. Kamus item→aspek harus dibuat ulang per kelompok karena isi pertanyaannya berbeda.
