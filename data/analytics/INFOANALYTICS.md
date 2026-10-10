# Ringkasan 8 Data Hasil Analytics Mahasiswa

Dokumen ini merangkum 8 file CSV baru yang dihasilkan oleh tiga notebook analitik: **MDS**, **Text Analytics**, dan **Priority Analysis**. Semua file disimpan di `data/analytics/`.

Dokumen ini menjelaskan **struktur, fungsi, dan cara membaca** tiap file. Angka hasil analisis belum dicantumkan di sini. Isi bagian "Temuan" di akhir dokumen setelah notebook dijalankan.

---

## 1. Gambaran Umum

| Notebook | Input | Output | Jumlah File |
|---|---|---|---:|
| `mds_mahasiswa.ipynb` | `skor_aspek_mahasiswa.csv` | Koordinat, vektor aspek, titik aspek, stress | 4 |
| `text_analytics_mahasiswa.ipynb` | `teks_mahasiswa_clean.csv`, `kamus_item_aspek_mahasiswa.csv` | Teks bersih, aspek per komentar, frekuensi aspek | 3 |
| `priority_analysis_mahasiswa.ipynb` | `ringkasan_aspek_*`, `ringkasan_item_*`, `kategori_*`, `frekuensi_aspek_*` | Ranking prioritas perbaikan | 1 |

```text
skor_aspek_mahasiswa.csv ─────────────► MDS ────────────► 4 file (mds_*)
                                                              
teks_mahasiswa_clean.csv ─► Text Analytics ─► 3 file ─┐
                                                      ├─► Priority Analysis ─► prioritas_aspek_mahasiswa.csv
ringkasan_aspek / ringkasan_item / kategori ──────────┘
```

Urutan menjalankan: MDS dan Text Analytics bisa dijalankan bebas urutan. **Priority Analysis harus terakhir**, karena membaca `frekuensi_aspek_mahasiswa.csv` dari Text Analytics.

---

## 2. Tabel Ringkasan 8 File

| No | File | Notebook | Isi Singkat | Level |
|---|---|---|---|---|
| 1 | `mds_responden_mahasiswa.csv` | MDS | Koordinat 2 dimensi tiap responden | Per responden |
| 2 | `mds_vektor_aspek_mahasiswa.csv` | MDS | Korelasi tiap aspek dengan dimensi 1 dan 2 | Per aspek |
| 3 | `mds_titik_aspek_mahasiswa.csv` | MDS | Koordinat 2 dimensi tiap aspek | Per aspek |
| 4 | `mds_stress_mahasiswa.csv` | MDS | Nilai stress dan interpretasi kecocokan | Per analisis |
| 5 | `teks_bersih_mahasiswa.csv` | Text | Komentar asli, versi bersih, dan aspek yang terdeteksi | Per komentar |
| 6 | `aspek_komentar_mahasiswa.csv` | Text | Pasangan komentar dan aspek (long format) | Per komentar-aspek |
| 7 | `frekuensi_aspek_mahasiswa.csv` | Text | Jumlah komentar yang menyebut tiap aspek, plus ranking | Per aspek |
| 8 | `prioritas_aspek_mahasiswa.csv` | Priority | Skor, ranking, level, dan kuadran prioritas per aspek | Per aspek |

---

## 3. Kelompok MDS (File 1 sampai 4)

MDS memetakan kemiripan persepsi ke ruang 2 dimensi. Input-nya adalah matriks responden × aspek. Aspek **Klinik tidak ikut** karena datanya kosong untuk mayoritas responden.

### 3.1 `mds_responden_mahasiswa.csv`

| Kolom | Arti |
|---|---|
| `response_id` | ID responden |
| `dim1`, `dim2` | Posisi responden di perceptual map |

- **Cara membaca:** dua responden yang berdekatan memberi pola skor aspek yang mirip. Jarak jauh berarti pola persepsi berbeda.
- **Fungsi:** titik-titik pada perceptual map di dashboard. Digabung dengan kolom profil (misal Program Studi) untuk melihat apakah ada kelompok yang membentuk gerombol.
- **Catatan:** responden yang masih punya nilai kosong pada aspek yang dipakai tidak ikut di file ini.

### 3.2 `mds_vektor_aspek_mahasiswa.csv`

| Kolom | Arti |
|---|---|
| `aspek` | Nama aspek |
| `korelasi_dim1`, `korelasi_dim2` | Korelasi skor aspek dengan sumbu dimensi 1 dan 2 |

- **Cara membaca:** nilai mendekati +1 atau −1 berarti aspek itu kuat berkaitan dengan dimensi tersebut. Arah panah dari titik pusat menunjukkan ke mana responden dengan skor tinggi di aspek itu cenderung berada.
- **Fungsi:** panah overlay pada peta responden, untuk membantu menamai arti tiap dimensi.
- **Catatan:** sesuai README, vektor ini adalah **overlay post-hoc hasil interpretasi**, bukan keluaran wajib MDS.

### 3.3 `mds_titik_aspek_mahasiswa.csv`

| Kolom | Arti |
|---|---|
| `aspek` | Nama aspek |
| `dim1`, `dim2` | Posisi aspek di peta |

- **Cara membaca:** jarak antar aspek dihitung dari `1 − korelasi`. Dua aspek yang berdekatan cenderung dinilai searah oleh responden (yang puas di satu aspek biasanya puas juga di aspek lainnya).
- **Fungsi:** peta kedekatan antar aspek, versi kedua dari visualisasi yang disebut README ("titik = aspek").

### 3.4 `mds_stress_mahasiswa.csv`

| Kolom | Arti |
|---|---|
| `analisis` | `mds_responden_2d` atau `mds_aspek_2d` |
| `stress1` | Nilai Kruskal stress-1 |
| `interpretasi` | Sangat baik, baik, cukup, atau kurang baik |

- **Cara membaca:** semakin kecil semakin baik. Pedoman kasar yang dipakai notebook:

| Stress-1 | Interpretasi |
|---|---|
| < 0,05 | Sangat baik |
| 0,05 sampai < 0,10 | Baik |
| 0,10 sampai < 0,20 | Cukup |
| ≥ 0,20 | Kurang baik |

- **Fungsi:** KPI analitik "Stress MDS sebagai indikator goodness-of-fit" di README. Wajib ditampilkan di dashboard agar pengguna tahu seberapa bisa dipercaya perceptual map-nya.
- **Catatan:** stress untuk MDS responden sering lebih tinggi daripada MDS aspek karena jumlah titiknya jauh lebih banyak. Itu wajar.

---

## 4. Kelompok Text Analytics (File 5 sampai 7)

Text analytics hanya menghitung **aspek yang paling sering dibicarakan**, tanpa sentiment analysis, sesuai README. Tahapan: case folding → cleaning → normalisasi → tokenization → stopword removal → stemming → identifikasi aspek dengan dictionary kata kunci.

### 4.1 `teks_bersih_mahasiswa.csv`

| Kolom | Arti |
|---|---|
| `response_id` | ID responden |
| `teks_komentar` | Komentar asli |
| `teks_bersih` | Komentar setelah preprocessing |
| `aspek` | Aspek yang terdeteksi, dipisah `;`. Kosong bila tidak ada |

- **Fungsi:** arsip hasil preprocessing teks, sekaligus bahan untuk mengecek akurasi deteksi aspek secara manual.
- **Peringatan privasi:** file ini memuat **komentar asli**. Komentar bebas bisa memuat nama dosen atau staf. Periksa isinya sebelum file ini masuk repo public.

### 4.2 `aspek_komentar_mahasiswa.csv`

| Kolom | Arti |
|---|---|
| `response_id` | ID responden |
| `aspek` | Satu aspek yang disebut dalam komentar responden itu |

- **Cara membaca:** satu baris per pasangan komentar dan aspek. Satu komentar yang menyebut dua aspek menghasilkan dua baris.
- **Fungsi:** format long yang mudah di-`groupby` atau di-join ke profil responden. Misalnya untuk menghitung aspek yang dikeluhkan per Program Studi.

### 4.3 `frekuensi_aspek_mahasiswa.csv`

| Kolom | Arti |
|---|---|
| `aspek` | Nama aspek |
| `frekuensi` | Jumlah komentar yang menyebut aspek itu |
| `persen_komentar` | Frekuensi dibagi total komentar |
| `ranking` | Urutan dari yang paling sering disebut |

- **Fungsi:** output utama text analytics sesuai README (tabel Aspek dan Frekuensi). Dipakai dashboard bagian "tema/aspek komentar", dan menjadi **salah satu dari tiga input Priority Analysis**.
- **Catatan:** satu komentar dihitung satu kali per aspek, jadi persentase bisa berjumlah lebih dari 100% bila banyak komentar menyebut lebih dari satu aspek.

---

## 5. Kelompok Priority Analysis (File 8)

### 5.1 `prioritas_aspek_mahasiswa.csv`

| Kolom | Arti |
|---|---|
| `aspek` | Nama aspek (12 aspek, termasuk Klinik) |
| `skor_kepuasan` | Rata-rata skor aspek (skala 1 sampai 4), dari `ringkasan_aspek_mahasiswa.csv` |
| `jumlah_dipilih`, `persen_dipilih` | Berapa responden memilih aspek ini sebagai prioritas peningkatan |
| `frekuensi_komentar` | Jumlah komentar yang menyebut aspek, dari file 7 |
| `norm_ketidakpuasan`, `norm_pilihan`, `norm_komentar` | Tiga komponen setelah dinormalisasi 0 sampai 1 |
| `skor_prioritas` | Gabungan tiga komponen (0 sampai 1, semakin tinggi semakin mendesak) |
| `ranking` | Urutan prioritas |
| `level_prioritas` | Tinggi, Sedang, atau Rendah (dibagi tiga berdasarkan ranking) |
| `kuadran` | Hasil pemetaan kepuasan vs seberapa sering dipilih |

**Rumus usulan:**

```text
skor_prioritas = 1/3 × (1 − skor_kepuasan ternormalisasi)
               + 1/3 × persen_dipilih ternormalisasi
               + 1/3 × frekuensi_komentar ternormalisasi
```

**Empat kuadran:**

| Kuadran | % dipilih | Skor kepuasan | Makna |
|---|---|---|---|
| Prioritas Utama | Di atas rata-rata | Di bawah rata-rata | Banyak diminta diperbaiki dan skornya rendah |
| Pertahankan | Di atas rata-rata | Di atas rata-rata | Penting bagi responden dan sudah baik |
| Prioritas Rendah | Di bawah rata-rata | Di bawah rata-rata | Skor rendah tapi kurang jadi perhatian |
| Sudah Cukup | Di bawah rata-rata | Di atas rata-rata | Tidak mendesak |

- **Fungsi:** menjawab item roadmap "Priority analysis" dan fitur dashboard "prioritas perbaikan".
- **Penting:** README **belum mendefinisikan rumus** Priority Analysis. Bobot sama rata (1/3 tiap komponen) hanya usulan awal dan **perlu disepakati tim**. Perubahan bobot cukup dilakukan di Cell 6 notebook.
- **Catatan:** pemetaan pilihan prioritas ke aspek memakai kata kunci (`KATA_PILIHAN`) yang harus dicocokkan dengan isi opsi di form.

---

## 6. Ketergantungan Antar File

| File | Bergantung pada |
|---|---|
| 1, 2, 3, 4 | `skor_aspek_mahasiswa.csv` |
| 5, 6, 7 | `teks_mahasiswa_clean.csv`, `kamus_item_aspek_mahasiswa.csv` |
| 8 | `ringkasan_aspek_mahasiswa.csv`, `ringkasan_item_mahasiswa.csv`, `kategori_mahasiswa_clean.csv`, file 7 |

Jika kamus item→aspek atau skor aspek diubah, semua file di atas harus dijalankan ulang agar konsisten.

---

## 7. Pemetaan ke README

| Kebutuhan di README | File |
|---|---|
| Perceptual map MDS | 1, 2, 3 |
| KPI Stress MDS | 4 |
| Frekuensi penyebutan aspek pada komentar | 7 (dan 5, 6 sebagai pendukung) |
| Ranking aspek | 7 |
| Prioritas perbaikan | 8 |

Usulan pemetaan ke layer `analytics` PostgreSQL (perlu dikonfirmasi dengan pemegang `schema.sql`):

| Tabel di README | File CSV |
|---|---|
| `analytics.mds_result` | 1, 2, 3, 4 |
| `analytics.aspect_frequency` | 6, 7 |
| `analytics.priority_result` | 8 |
| `processed` (teks bersih) | 5 |

Endpoint API yang relevan: `GET /api/mds`, `GET /api/aspects`, `GET /api/priority`.

---

## 8. Catatan Kualitas yang Perlu Dicek

1. **Dictionary aspek di text analytics adalah tebakan awal.** Cek output `komentar tanpa aspek` dan daftar kata terbanyak di notebook, lalu lengkapi kata kuncinya. Semakin banyak komentar yang tidak terdeteksi, semakin rendah angka frekuensi dan makin bias rankingnya.
2. **Deteksi aspek berbasis kata kunci bisa salah.** Kata seperti "lab" atau "ac" bisa muncul pada konteks lain. Cek sampel manual sebelum angka dipakai di dashboard.
3. **Jumlah responden berbeda tiap analisis.** MDS hanya memakai responden tanpa nilai kosong. Text analytics hanya memakai responden yang menulis komentar. Pilihan prioritas hanya dari responden yang mengisi pertanyaannya. Catat jumlah masing-masing saat melaporkan.
4. **Aspek Klinik** ada di file 7 dan 8 tetapi tidak di file 1 sampai 4.
5. **Pola yang sama untuk kelompok lain.** Dosen, karyawan, mitra kerja sama, dan mitra pengadaan memakai struktur yang sama dengan mengganti sufiks `_mahasiswa`. Dictionary aspek dan pemetaan pilihan prioritas harus dibuat ulang per kelompok.

---

## 9. Temuan (Isi Setelah Notebook Dijalankan)

| Pertanyaan | Jawaban |
|---|---|
| Jumlah responden dipakai di MDS | |
| Stress-1 MDS responden dan interpretasinya | |
| Stress-1 MDS aspek dan interpretasinya | |
| Aspek yang paling sering disebut di komentar (3 teratas) | |
| Persentase komentar yang tidak terdeteksi aspeknya | |
| Aspek dengan skor kepuasan terendah | |
| Aspek dengan ranking prioritas teratas (3 teratas) | |
| Aspek di kuadran Prioritas Utama | |
