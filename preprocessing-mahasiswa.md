# Dokumentasi Preprocessing Data Survei Kepuasan Mahasiswa

> **Catatan:** Dokumen Markdown ini dihasilkan dari notebook [`Preprocessing-Mahasiswa.ipynb`](file:///c:/KULIAH/SEM%205/Project%20Analitika%20Data/Preprocessing/Preprocessing-Mahasiswa.ipynb) yang berisi seluruh kode program Python, penjelasan tahapan kerja, serta output eksekusi lengkapnya.

## Ringkasan Alur Preprocessing

Proses preprocessing ini mencakup tahap-tahap penting pembersihan data survei mahasiswa:

1. **Data Ingestion**: Deteksi direktori proyek dan pembacaan raw data Excel (`Pelayanan Kepuasan - Mahasiswa.xlsx`).
2. **Anonimisasi & Privasi (PII)**: Pembuatan ID responden (`MHS_XXXX`) dan penghapusan nomor telepon / e-wallet (`Nomor Gopay`).
3. **Pemisahan Entitas Data**: Pemilahan dataset mentah menjadi 3 dataset terpisah:
   - **Likert Utama**: 58 pertanyaan penilaian kepuasan layanan inti kampus.
   - **Likert Klinik**: 9 pertanyaan khusus bagi responden yang pernah memanfaatkan klinik kampus.
   - **Teks Umpan Balik**: Respon terbuka terkait saran/masukan perbaikan fasilitas.
4. **Standardisasi Nilai**: Konversi teks skala Likert (`1 - Tidak Baik`, `4 - Sangat Baik`, dll.) menjadi nilai numerik murni (`1` - `4`).
5. **Export & Verifikasi**: Penyimpanan ke file `.csv` di folder `data/clean/` dan validasi struktur data.

---

## 1. Import Library & Inisialisasi Direktori Proyek

Mendeteksi root direktori proyek secara dinamis, menentukan path file raw Excel, dan membuat folder `data/clean` sebagai lokasi penyimpanan hasil preprocessing.

```python
import os
from pathlib import Path
import pandas as pd
import numpy as np

# Deteksi otomatis root project, supaya tidak tergantung dari mana notebook dibuka
current = Path(os.getcwd())
if (current / "data").exists():
    BASE_DIR = current
elif (current.parent / "data").exists():
    BASE_DIR = current.parent
else:
    raise FileNotFoundError("Folder 'data' tidak ditemukan, cek ulang lokasi notebook")

RAW_PATH = BASE_DIR / "data" / "raw" / "Pelayanan Kepuasan - Mahasiswa.xlsx"
OUTPUT_DIR = BASE_DIR / "data" / "clean"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print("BASE_DIR   :", BASE_DIR)
print("RAW_PATH   :", RAW_PATH, "| ada?", RAW_PATH.exists())
print("OUTPUT_DIR :", OUTPUT_DIR, "| ada?", OUTPUT_DIR.exists())
```

#### Output:

```text
BASE_DIR   : c:\KULIAH\SEM 5\Project Analitika Data
RAW_PATH   : c:\KULIAH\SEM 5\Project Analitika Data\data\raw\Pelayanan Kepuasan - Mahasiswa.xlsx | ada? True
OUTPUT_DIR : c:\KULIAH\SEM 5\Project Analitika Data\data\clean | ada? True
```

---

## 2. Definisi Konfigurasi Kolom (PII, Profil, Kunci Klinik, Kolom Teks)

Menentukan kolom data pribadi (PII - Personally Identifiable Information) yang harus dianonimisasi/dibuang, kolom profil demografi responden, kata kunci penanda layanan klinik, dan kolom pertanyaan terbuka (komentar).

```python
# Kolom PII yang harus dibuang
KOLOM_PII = ["Nomor Gopay"]

# Kolom profil/identitas responden
KOLOM_PROFIL = ["Timestamp", "Program Studi", "Semester"]

# Kata kunci untuk mendeteksi kolom likert klinik (bersyarat)
KATA_KUNCI_KLINIK = "klinik"

# Kolom teks/open-ended - sesuaikan dengan redaksi persis di form
KOLOM_TEKS = [
    "Menurut Anda, layanan atau fasilitas apa yang perlu diperbaiki di kampus? Jelaskan perbaikan yang Anda harapkan. (Opsional)"
]
```

*(Tidak ada output terminal / cell hanya mendefinisikan variabel/fungsi)*

---

## 3. Pengecekan Keberadaan File Raw dan Membaca Dataset

Memeriksa apakah file dataset mentah `Pelayanan Kepuasan - Mahasiswa.xlsx` tersedia di direktori `data/raw/` dan memuatnya ke dalam DataFrame pandas.

```python
def cek_file(path):
    if not path.exists():
        print(f"File TIDAK ditemukan di path: {path}")
        folder_raw = path.parent
        if folder_raw.exists():
            print("Isi folder raw saat ini:")
            for nama_file in os.listdir(folder_raw):
                print(f"  - {nama_file}")
        else:
            print(f"  Folder juga tidak ditemukan: {folder_raw}")
        return False
    print(f"File ditemukan: {path}")
    return True

if cek_file(RAW_PATH):
    df_raw = pd.read_excel(RAW_PATH)
    print(f"\nJumlah baris : {df_raw.shape[0]}")
    print(f"Jumlah kolom : {df_raw.shape[1]}")
```

#### Output:

```text
File ditemukan: c:\KULIAH\SEM 5\Project Analitika Data\data\raw\Pelayanan Kepuasan - Mahasiswa.xlsx

Jumlah baris : 418
Jumlah kolom : 74
```

---

## 4. Inspeksi Struktur dan Daftar Nama Seluruh Kolom Raw

Menampilkan seluruh 70 nama kolom asli pada kuesioner mentah untuk memverifikasi kesesuaian penamaan kolom dengan konfigurasi.

```python
# Lihat semua nama kolom persis apa adanya, untuk cocokkan ke Cell 2
for i, kolom in enumerate(df_raw.columns, start=1):
    print(f"{i}. {kolom}")
```

#### Output:

```text
1. Timestamp
2. Nomor Gopay
3. Program Studi
4. Semester
5. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Persyaratan untuk mengurus layanan akademik jelas dan mudah dipenuhi]
6. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Langkah-langkah untuk mendapatkan layanan akademik jelas dan mudah dilakukan]
7. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Layanan akademik diselesaikan dengan cepat sesuai waktu yang dijanjikan]
8. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Informasi mengenai biaya layanan, jika ada, jelas dan sesuai dengan ketentuan]
9. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Hasil layanan akademik yang diterima sesuai dengan kebutuhan]
10. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Petugas mampu memberikan informasi dan membantu menyelesaikan kebutuhan akademik]
11. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Petugas ramah, sopan, dan membantu saat memberikan layanan]
12. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Keluhan atau masalah mudah disampaikan dan mendapatkan tindak lanjut]
13. Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Fasilitas dan sistem layanan akademik mudah digunakan dan berfungsi dengan baik]
14. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Persyaratan untuk mendapatkan layanan kemahasiswaan jelas dan mudah dipenuhi]
15. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Langkah-langkah untuk mendapatkan layanan kemahasiswaan jelas dan mudah dilakukan]
16. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Layanan kemahasiswaan diproses dengan cepat sesuai waktu yang dijanjikan]
17. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Informasi mengenai biaya layanan, jika ada, jelas dan sesuai ketentuan]
18. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Layanan yang diterima sesuai dengan kebutuhan sebagai mahasiswa]
19. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Petugas mampu memberikan informasi dan membantu menyelesaikan kebutuhan mahasiswa]
20. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Petugas ramah, sopan, dan membantu saat memberikan layanan]
21. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Keluhan atau masalah mudah disampaikan dan mendapatkan tindak lanjut]
22. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Fasilitas dan media informasi layanan kemahasiswaan mudah diakses dan digunakan]
23. Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?   [Informasi dan pengelolaan layanan beasiswa mahasiswa jelas dan mudah diakses]
24. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Persyaratan untuk mengurus administrasi keuangan jelas dan mudah dipenuhi]
25. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Proses pembayaran dan pengurusan administrasi keuangan jelas dan mudah dilakukan]
26. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Masalah administrasi keuangan ditangani dengan cepat]
27. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Informasi mengenai UKT, tagihan, dan biaya lainnya jelas dan mudah dipahami]
28. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Informasi dan hasil layanan keuangan yang diterima benar dan sesuai kebutuhan]
29. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Petugas mampu menjelaskan dan membantu menyelesaikan masalah administrasi keuangan]
30. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Petugas ramah, sopan, dan membantu saat memberikan layanan]
31. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Masalah pembayaran atau tagihan mudah disampaikan dan mendapatkan penyelesaian]
32. Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?   [Sistem dan fasilitas layanan keuangan mudah digunakan dan berfungsi dengan baik]
33. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Persyaratan untuk mendapatkan layanan administrasi umum jelas dan mudah dipenuhi]
34. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Langkah-langkah mendapatkan layanan jelas dan mudah dilakukan]
35. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Layanan diselesaikan dengan cepat sesuai waktu yang dijanjikan]
36. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Informasi mengenai biaya layanan, jika ada, jelas dan sesuai ketentuan]
37. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Hasil layanan yang diterima sesuai dengan kebutuhan]
38. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Petugas mampu memberikan informasi dan membantu kebutuhan mahasiswa]
39. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Petugas ramah, sopan, dan membantu saat memberikan layanan]
40. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Keluhan atau masalah mudah disampaikan dan mendapatkan tindak lanjut]
41. Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?   [Tempat dan fasilitas pelayanan nyaman dan mendukung proses pelayanan]
42. Bagaimana penilaian Anda terhadap Ruang Kuliah?   [Ruang kuliah bersih dan nyaman digunakan]
43. Bagaimana penilaian Anda terhadap Ruang Kuliah?   [Pencahayaan dan suhu/ventilasi ruang kuliah sudah nyaman]
44. Bagaimana penilaian Anda terhadap Ruang Kuliah?   [Meja, kursi, papan tulis, proyektor/TV, dan fasilitas pembelajaran lainnya tersedia dan berfungsi dengan baik]
45. Bagaimana penilaian Anda terhadap fasilitas Laboratorium?   [Alat dan fasilitas laboratorium tersedia sesuai kebutuhan praktikum]
46. Bagaimana penilaian Anda terhadap fasilitas Laboratorium?   [Alat laboratorium dalam kondisi baik dan dapat digunakan]
47. Bagaimana penilaian Anda terhadap fasilitas Laboratorium?   [Laboratorium bersih, nyaman, dan aman digunakan untuk praktikum]
48. Bagaimana penilaian Anda terhadap fasilitas dan layanan Perpustakaan?   [Buku, referensi, dan sumber belajar yang tersedia sesuai dengan kebutuhan]
49. Bagaimana penilaian Anda terhadap fasilitas dan layanan Perpustakaan?   [Layanan dan sumber digital perpustakaan mudah diakses]
50. Bagaimana penilaian Anda terhadap fasilitas dan layanan Perpustakaan?   [Ruang perpustakaan nyaman digunakan untuk membaca dan belajar]
51. Bagaimana penilaian Anda terhadap layanan TIK dan Sistem Informasi kampus?   [Internet/Wi-Fi kampus mudah diakses dan memiliki koneksi yang memadai]
52. Bagaimana penilaian Anda terhadap layanan TIK dan Sistem Informasi kampus?   [Sistem informasi/aplikasi kampus mudah digunakan dan dapat diakses saat dibutuhkan]
53. Bagaimana penilaian Anda terhadap layanan TIK dan Sistem Informasi kampus?   [Ketika terjadi kendala TIK, bantuan atau penanganannya mudah diperoleh]
54. Bagaimana penilaian Anda terhadap fasilitas Toilet kampus?   [Toilet kampus bersih, tidak bau dan nyaman digunakan]
55. Bagaimana penilaian Anda terhadap fasilitas Toilet kampus?   [Air, sabun, dan fasilitas pendukung toilet tersedia dengan baik]
56. Bagaimana penilaian Anda terhadap fasilitas Toilet kampus?   [Jumlah dan kondisi toilet memadai untuk kebutuhan mahasiswa]
57. Bagaimana penilaian Anda terhadap fasilitas Parkir kampus?   [Tempat parkir cukup untuk menampung kendaraan mahasiswa]
58. Bagaimana penilaian Anda terhadap fasilitas Parkir kampus?   [Area parkir tertata dan mudah digunakan]
59. Bagaimana penilaian Anda terhadap fasilitas Parkir kampus?   [Kendaraan cukup aman ketika diparkir di lingkungan kampus]
60. Bagaimana penilaian Anda terhadap Lingkungan Kampus?   [Lingkungan kampus bersih dan nyaman]
61. Bagaimana penilaian Anda terhadap Lingkungan Kampus?   [Lingkungan kampus aman untuk aktivitas mahasiswa]
62. Bagaimana penilaian Anda terhadap Lingkungan Kampus?   [Ruang terbuka, penghijauan, dan fasilitas umum di kampus sudah memadai]
63. Apakah Anda pernah menggunakan layanan Klinik Kampus PENS?  
64. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Persyaratan untuk mendapatkan layanan klinik mudah dipenuhi]
65. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Proses untuk mendapatkan layanan klinik mudah dilakukan]
66. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Pelayanan klinik dapat diperoleh dengan cepat saat dibutuhkan]
67. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Informasi mengenai jadwal, jenis layanan, dan ketentuan pelayanan klinik disampaikan dengan jelas]
68. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Layanan klinik yang diberikan sesuai dengan kebutuhan mahasiswa]
69. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Petugas klinik mampu memberikan pelayanan dan informasi dengan baik]
70. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Petugas klinik ramah, sopan, dan membantu]
71. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Keluhan atau kendala terkait layanan klinik mudah disampaikan dan mendapatkan tindak lanjut]
72. Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Ruang dan fasilitas klinik bersih, nyaman, dan mendukung pelayanan]
73. Menurut Anda, layanan atau fasilitas mana yang paling perlu ditingkatkan (pilih maksimum 3)?  
74. Menurut Anda, layanan atau fasilitas apa yang perlu diperbaiki di kampus? Jelaskan perbaikan yang Anda harapkan. (Opsional)
```

---

## 5. Pratinjau Data Mentah (Raw Data Head)

Menampilkan 5 baris pertama dari dataset mentah sebelum pembersihan.

```python
df_raw.head()
```

#### Output:

```text
Timestamp   Nomor Gopay                  Program Studi  \
0 2026-09-09 13:13:07.187  087859828830  STr. Sistem Pembangkit Energi   
1 2026-09-09 13:13:37.038  085732049620        STr. Sains Data Terapan   
2 2026-09-09 13:14:48.414  081229055480  STr./D3 Teknik Telekomunikasi   
3 2026-09-09 13:14:56.417  081233799323            STr. Bisnis Digital   
4 2026-09-09 13:15:43.711  089695111218  STr./D3 Teknik Telekomunikasi   

   Semester  \
0         3   
1         7   
2         3   
3         1   
4         1   

  Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Persyaratan untuk mengurus layanan akademik jelas dan mudah dipenuhi]  \
0                                    4 - Sangat Baik                                                                                                  
1                                           3 - Baik                                                                                                  
2                                    4 - Sangat Baik                                                                                                  
3                                           3 - Baik                                                                                                  
4                                           3 - Baik                                                                                                  

  Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Langkah-langkah untuk mendapatkan layanan akademik jelas dan mudah dilakukan]  \
0                                    4 - Sangat Baik                                                                                                          
1                                           3 - Baik                                                                                                          
2                                    4 - Sangat Baik                                                                                                          
3                                           3 - Baik                                                                                                          
4                                           3 - Baik                                                                                                          

  Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Layanan akademik diselesaikan dengan cepat sesuai waktu yang dijanjikan]  \
0                                    4 - Sangat Baik                                                                                                     
1                                           3 - Baik                                                                                                     
2                                    4 - Sangat Baik                                                                                                     
3                                           3 - Baik                                                                                                     
4                                           3 - Baik                                                                                                     

  Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Informasi mengenai biaya layanan, jika ada, jelas dan sesuai dengan ketentuan]  \
0                                    4 - Sangat Baik                                                                                                           
1                                           3 - Baik                                                                                                           
2                                    4 - Sangat Baik                                                                                                           
3                                           3 - Baik                                                                                                           
4                                           3 - Baik                                                                                                           

  Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Hasil layanan akademik yang diterima sesuai dengan kebutuhan]  \
0                                    4 - Sangat Baik                                                                                          
1                                           3 - Baik                                                                                          
2                                    4 - Sangat Baik                                                                                          
3                                           3 - Baik                                                                                          
4                                           3 - Baik                                                                                          

  Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Petugas mampu memberikan informasi dan membantu menyelesaikan kebutuhan akademik]  \
0                                    4 - Sangat Baik                                                                                                              
1                                           3 - Baik                                                                                                              
2                                    4 - Sangat Baik                                                                                                              
3                                           3 - Baik                                                                                                              
4                                           3 - Baik                                                                                                              

   ...  \
0  ...   
1  ...   
2  ...   
3  ...   
4  ...   

  Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Proses untuk mendapatkan layanan klinik mudah dilakukan]  \
0                                    4 - Sangat Baik                                                                                   
1                                           3 - Baik                                                                                   
2                                                NaN                                                                                   
3                                                NaN                                                                                   
4                                                NaN                                                                                   

  Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Pelayanan klinik dapat diperoleh dengan cepat saat dibutuhkan]  \
0                                    4 - Sangat Baik                                                                                         
1                                    2 - Kurang Baik                                                                                         
2                                                NaN                                                                                         
3                                                NaN                                                                                         
4                                                NaN                                                                                         

  Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Informasi mengenai jadwal, jenis layanan, dan ketentuan pelayanan klinik disampaikan dengan jelas]  \
0                                    4 - Sangat Baik                                                                                                                             
1                                    2 - Kurang Baik                                                                                                                             
2                                                NaN                                                                                                                             
3                                                NaN                                                                                                                             
4                                                NaN                                                                                                                             

  Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Layanan klinik yang diberikan sesuai dengan kebutuhan mahasiswa]  \
0                                    4 - Sangat Baik                                                                                           
1                                           3 - Baik                                                                                           
2                                                NaN                                                                                           
3                                                NaN                                                                                           
4                                                NaN                                                                                           

  Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Petugas klinik mampu memberikan pelayanan dan informasi dengan baik]  \
0                                    4 - Sangat Baik                                                                                               
1                                           3 - Baik                                                                                               
2                                                NaN                                                                                               
3                                                NaN                                                                                               
4                                                NaN                                                                                               

  Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Petugas klinik ramah, sopan, dan membantu]  \
0                                    4 - Sangat Baik                                                                     
1                                           3 - Baik                                                                     
2                                                NaN                                                                     
3                                                NaN                                                                     
4                                                NaN                                                                     

  Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Keluhan atau kendala terkait layanan klinik mudah disampaikan dan mendapatkan tindak lanjut]  \
0                                    4 - Sangat Baik                                                                                                                       
1                                           3 - Baik                                                                                                                       
2                                                NaN                                                                                                                       
3                                                NaN                                                                                                                       
4                                                NaN                                                                                                                       

  Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Ruang dan fasilitas klinik bersih, nyaman, dan mendukung pelayanan]  \
0                                    4 - Sangat Baik                                                                                              
1                                           3 - Baik                                                                                              
2                                                NaN                                                                                              
3                                                NaN                                                                                              
4                                                NaN                                                                                              

  Menurut Anda, layanan atau fasilitas mana yang paling perlu ditingkatkan (pilih maksimum 3)?    \
0  Layanan Kemahasiswaan, Internet/Wi-Fi dan Sist...                                               
1  Layanan Kemahasiswaan, Administrasi Keuangan, ...                                               
2  Administrasi Akademik, Layanan Kemahasiswaan, ...                                               
3        Internet/Wi-Fi dan Sistem Informasi, Toilet                                               
4        Internet/Wi-Fi dan Sistem Informasi, Parkir                                               

  Menurut Anda, layanan atau fasilitas apa yang perlu diperbaiki di kampus? Jelaskan perbaikan yang Anda harapkan. (Opsional)  
0                PARKIRANN menurutku terlalu sempit                                                                            
1                                                NaN                                                                           
2                                                NaN                                                                           
3                                                NaN                                                                           
4   MOHON PARKIRAN NYA MUNGKIN BISA DIBICARAKAN LAGI                                                                           

[5 rows x 74 columns]
```

---

## 6. Anonimisasi Data (Penambahan Response ID & Drop Kolom PII)

Menambahkan identifier unik `response_id` (format `MHS_0001`, `MHS_0002`, dst.) dan menghapus kolom sensitif (`Nomor Gopay`) demi menjaga privasi responden.

```python
df = df_raw.copy()
df.insert(0, "response_id", ["MHS_" + str(i + 1).zfill(4) for i in range(len(df))])

kolom_pii_ada = [k for k in KOLOM_PII if k in df.columns]
df = df.drop(columns=kolom_pii_ada)
print(f"Kolom PII dibuang: {kolom_pii_ada}")
```

#### Output:

```text
Kolom PII dibuang: ['Nomor Gopay']
```

---

## 7. Kategorisasi dan Pemisahan Kolom Survei

Memilah kolom pertanyaan berskala Likert (ditandai dengan tanda kurung siku `[...]`) menjadi dua kelompok: Likert Utama dan Likert Klinik, serta mengidentifikasi kolom teks terbuka.

```python
semua_kolom = df.columns.tolist()

# Kolom likert = kolom yang mengandung tanda kurung siku "[...]"
kolom_likert_semua = [k for k in semua_kolom if "[" in k and "]" in k]

# Pisahkan klinik dari yang wajib
kolom_klinik = [k for k in kolom_likert_semua if KATA_KUNCI_KLINIK.lower() in k.lower()]
kolom_likert_utama = [k for k in kolom_likert_semua if k not in kolom_klinik]

print(f"Kolom likert utama : {len(kolom_likert_utama)}")
print(f"Kolom likert klinik: {len(kolom_klinik)}")
print(f"Kolom teks terbuka : {len(KOLOM_TEKS)}")
```

#### Output:

```text
Kolom likert utama : 58
Kolom likert klinik: 9
Kolom teks terbuka : 1
```

---

## 8. Fungsi Pembersihan Nilai Skala Likert

Membuat fungsi `bersihkan_likert()` dengan regex untuk mengekstrak angka skor (misal `'1 - Tidak Baik'` menjadi angka numerik `1`) dan mengubah tipe data menjadi numerik.

```python
import re

def bersihkan_likert(df_input, kolom_likert):
    df_hasil = df_input[kolom_likert].copy()
    for kol in kolom_likert:
        # Ambil angka di awal string, misal "1 - Tidak Baik" -> "1"
        df_hasil[kol] = df_hasil[kol].astype(str).str.extract(r"^(\d+)")[0]
        df_hasil[kol] = df_hasil[kol].replace("nan", np.nan)  # kembalikan NaN yang sempat jadi teks "nan"
        df_hasil[kol] = pd.to_numeric(df_hasil[kol], errors="coerce")
    return df_hasil
```

*(Tidak ada output terminal / cell hanya mendefinisikan variabel/fungsi)*

---

## 9. Pembentukan dan Pembersihan Dataset Likert Utama

Menggabungkan `response_id`, kolom profil, dan 58 kolom skala likert utama, lalu menerapkan konversi skor numerik.

```python
kolom_dipakai_utama = ["response_id"] + KOLOM_PROFIL + kolom_likert_utama
df_likert_utama = df[kolom_dipakai_utama].copy()
df_likert_utama[kolom_likert_utama] = bersihkan_likert(df_likert_utama, kolom_likert_utama)

df_likert_utama.head()
```

#### Output:

```text
response_id               Timestamp                  Program Studi  \
0    MHS_0001 2026-09-09 13:13:07.187  STr. Sistem Pembangkit Energi   
1    MHS_0002 2026-09-09 13:13:37.038        STr. Sains Data Terapan   
2    MHS_0003 2026-09-09 13:14:48.414  STr./D3 Teknik Telekomunikasi   
3    MHS_0004 2026-09-09 13:14:56.417            STr. Bisnis Digital   
4    MHS_0005 2026-09-09 13:15:43.711  STr./D3 Teknik Telekomunikasi   

   Semester  \
0         3   
1         7   
2         3   
3         1   
4         1   

   Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Persyaratan untuk mengurus layanan akademik jelas dan mudah dipenuhi]  \
0                                                  4                                                                                                   
1                                                  3                                                                                                   
2                                                  4                                                                                                   
3                                                  3                                                                                                   
4                                                  3                                                                                                   

   Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Langkah-langkah untuk mendapatkan layanan akademik jelas dan mudah dilakukan]  \
0                                                  4                                                                                                           
1                                                  3                                                                                                           
2                                                  4                                                                                                           
3                                                  3                                                                                                           
4                                                  3                                                                                                           

   Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Layanan akademik diselesaikan dengan cepat sesuai waktu yang dijanjikan]  \
0                                                  4                                                                                                      
1                                                  3                                                                                                      
2                                                  4                                                                                                      
3                                                  3                                                                                                      
4                                                  3                                                                                                      

   Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Informasi mengenai biaya layanan, jika ada, jelas dan sesuai dengan ketentuan]  \
0                                                  4                                                                                                            
1                                                  3                                                                                                            
2                                                  4                                                                                                            
3                                                  3                                                                                                            
4                                                  3                                                                                                            

   Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Hasil layanan akademik yang diterima sesuai dengan kebutuhan]  \
0                                                  4                                                                                           
1                                                  3                                                                                           
2                                                  4                                                                                           
3                                                  3                                                                                           
4                                                  3                                                                                           

   Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?   [Petugas mampu memberikan informasi dan membantu menyelesaikan kebutuhan akademik]  \
0                                                  4                                                                                                               
1                                                  3                                                                                                               
2                                                  4                                                                                                               
3                                                  3                                                                                                               
4                                                  3                                                                                                               

   ...  \
0  ...   
1  ...   
2  ...   
3  ...   
4  ...   

   Bagaimana penilaian Anda terhadap layanan TIK dan Sistem Informasi kampus?   [Ketika terjadi kendala TIK, bantuan atau penanganannya mudah diperoleh]  \
0                                                  4                                                                                                       
1                                                  3                                                                                                       
2                                                  4                                                                                                       
3                                                  3                                                                                                       
4                                                  3                                                                                                       

   Bagaimana penilaian Anda terhadap fasilitas Toilet kampus?   [Toilet kampus bersih, tidak bau dan nyaman digunakan]  \
0                                                  4                                                                     
1                                                  3                                                                     
2                                                  4                                                                     
3                                                  2                                                                     
4                                                  3                                                                     

   Bagaimana penilaian Anda terhadap fasilitas Toilet kampus?   [Air, sabun, dan fasilitas pendukung toilet tersedia dengan baik]  \
0                                                  4                                                                                
1                                                  3                                                                                
2                                                  4                                                                                
3                                                  2                                                                                
4                                                  3                                                                                

   Bagaimana penilaian Anda terhadap fasilitas Toilet kampus?   [Jumlah dan kondisi toilet memadai untuk kebutuhan mahasiswa]  \
0                                                  4                                                                            
1                                                  3                                                                            
2                                                  4                                                                            
3                                                  2                                                                            
4                                                  2                                                                            

   Bagaimana penilaian Anda terhadap fasilitas Parkir kampus?   [Tempat parkir cukup untuk menampung kendaraan mahasiswa]  \
0                                                  4                                                                        
1                                                  1                                                                        
2                                                  4                                                                        
3                                                  3                                                                        
4                                                  2                                                                        

   Bagaimana penilaian Anda terhadap fasilitas Parkir kampus?   [Area parkir tertata dan mudah digunakan]  \
0                                                  4                                                        
1                                                  2                                                        
2                                                  4                                                        
3                                                  3                                                        
4                                                  2                                                        

   Bagaimana penilaian Anda terhadap fasilitas Parkir kampus?   [Kendaraan cukup aman ketika diparkir di lingkungan kampus]  \
0                                                  4                                                                          
1                                                  3                                                                          
2                                                  4                                                                          
3                                                  3                                                                          
4                                                  3                                                                          

   Bagaimana penilaian Anda terhadap Lingkungan Kampus?   [Lingkungan kampus bersih dan nyaman]  \
0                                                  4                                              
1                                                  4                                              
2                                                  4                                              
3                                                  3                                              
4                                                  3                                              

   Bagaimana penilaian Anda terhadap Lingkungan Kampus?   [Lingkungan kampus aman untuk aktivitas mahasiswa]  \
0                                                  4                                                           
1                                                  4                                                           
2                                                  4                                                           
3                                                  3                                                           
4                                                  3                                                           

   Bagaimana penilaian Anda terhadap Lingkungan Kampus?   [Ruang terbuka, penghijauan, dan fasilitas umum di kampus sudah memadai]  
0                                                  4                                                                                
1                                                  4                                                                                
2                                                  4                                                                                
3                                                  4                                                                                
4                                                  3                                                                                

[5 rows x 62 columns]
```

---

## 10. Pembentukan dan Pembersihan Dataset Likert Layanan Klinik

Mengambil kolom likert klinik, menerapkan pembersihan skor, dan memfilter (menghapus) responden yang tidak mengisi bagian layanan klinik (karena bersifat opsional/kondisional).

```python
if len(kolom_klinik) == 0:
    print("Tidak ada kolom klinik ditemukan, cek KATA_KUNCI_KLINIK di Cell 2")
    df_likert_klinik = pd.DataFrame()
else:
    kolom_dipakai_klinik = ["response_id"] + kolom_klinik
    df_likert_klinik = df[kolom_dipakai_klinik].copy()
    df_likert_klinik[kolom_klinik] = bersihkan_likert(df_likert_klinik, kolom_klinik)

    # Buang baris yang semua kolom kliniknya kosong (memang tidak mengisi)
    df_likert_klinik = df_likert_klinik.dropna(subset=kolom_klinik, how="all")

    print(f"Responden yang mengisi data klinik: {len(df_likert_klinik)} dari total {len(df)} baris")

df_likert_klinik.head()
```

#### Output:

```text
Responden yang mengisi data klinik: 115 dari total 418 baris
```

```text
response_id  \
0     MHS_0001   
1     MHS_0002   
5     MHS_0006   
12    MHS_0013   
13    MHS_0014   

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Persyaratan untuk mendapatkan layanan klinik mudah dipenuhi]  \
0                                                 4.0                                                                                        
1                                                 3.0                                                                                        
5                                                 4.0                                                                                        
12                                                3.0                                                                                        
13                                                4.0                                                                                        

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Proses untuk mendapatkan layanan klinik mudah dilakukan]  \
0                                                 4.0                                                                                    
1                                                 3.0                                                                                    
5                                                 4.0                                                                                    
12                                                3.0                                                                                    
13                                                4.0                                                                                    

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Pelayanan klinik dapat diperoleh dengan cepat saat dibutuhkan]  \
0                                                 4.0                                                                                          
1                                                 2.0                                                                                          
5                                                 4.0                                                                                          
12                                                3.0                                                                                          
13                                                4.0                                                                                          

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Informasi mengenai jadwal, jenis layanan, dan ketentuan pelayanan klinik disampaikan dengan jelas]  \
0                                                 4.0                                                                                                                              
1                                                 2.0                                                                                                                              
5                                                 4.0                                                                                                                              
12                                                3.0                                                                                                                              
13                                                2.0                                                                                                                              

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Layanan klinik yang diberikan sesuai dengan kebutuhan mahasiswa]  \
0                                                 4.0                                                                                            
1                                                 3.0                                                                                            
5                                                 4.0                                                                                            
12                                                3.0                                                                                            
13                                                4.0                                                                                            

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Petugas klinik mampu memberikan pelayanan dan informasi dengan baik]  \
0                                                 4.0                                                                                                
1                                                 3.0                                                                                                
5                                                 4.0                                                                                                
12                                                3.0                                                                                                
13                                                4.0                                                                                                

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Petugas klinik ramah, sopan, dan membantu]  \
0                                                 4.0                                                                      
1                                                 3.0                                                                      
5                                                 4.0                                                                      
12                                                3.0                                                                      
13                                                4.0                                                                      

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Keluhan atau kendala terkait layanan klinik mudah disampaikan dan mendapatkan tindak lanjut]  \
0                                                 4.0                                                                                                                        
1                                                 3.0                                                                                                                        
5                                                 4.0                                                                                                                        
12                                                3.0                                                                                                                        
13                                                4.0                                                                                                                        

    Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?   [Ruang dan fasilitas klinik bersih, nyaman, dan mendukung pelayanan]  
0                                                 4.0                                                                                              
1                                                 3.0                                                                                              
5                                                 4.0                                                                                              
12                                                3.0                                                                                              
13                                                4.0
```

---

## 11. Restrukturisasi dan Pembersihan Data Teks Terbuka

Mengubah data jawaban pertanyaan terbuka menjadi format tabular terstruktur (`response_id`, `jenis_pertanyaan`, `teks_komentar`), serta membuang respon kosong.

```python
df_teks_list = []

for kolom in KOLOM_TEKS:
    temp = df[["response_id", kolom]].copy()
    temp = temp.rename(columns={kolom: "teks_komentar"})
    temp["jenis_pertanyaan"] = kolom
    temp = temp[["response_id", "jenis_pertanyaan", "teks_komentar"]]
    df_teks_list.append(temp)

df_teks = pd.concat(df_teks_list, ignore_index=True)

# Buang baris kosong (tidak diisi responden)
df_teks = df_teks.dropna(subset=["teks_komentar"])
df_teks = df_teks[df_teks["teks_komentar"].str.strip() != ""]

print(f"Total jawaban teks terkumpul: {len(df_teks)} baris")
df_teks.head()
```

#### Output:

```text
Total jawaban teks terkumpul: 314 baris
```

```text
response_id                                   jenis_pertanyaan  \
0    MHS_0001  Menurut Anda, layanan atau fasilitas apa yang ...   
4    MHS_0005  Menurut Anda, layanan atau fasilitas apa yang ...   
5    MHS_0006  Menurut Anda, layanan atau fasilitas apa yang ...   
6    MHS_0007  Menurut Anda, layanan atau fasilitas apa yang ...   
7    MHS_0008  Menurut Anda, layanan atau fasilitas apa yang ...   

                                       teks_komentar  
0                PARKIRANN menurutku terlalu sempit   
4   MOHON PARKIRAN NYA MUNGKIN BISA DIBICARAKAN LAGI  
5  Parkiran, dikarenakan mahasiswa di PENS banyak...  
6  Menurut saya dengan penambahan kuota mahasiswa...  
7  parkiran motor tentunya karena kapasitas kenda...
```

---

## 12. Export Dataset Bersih ke File CSV

Menyimpan ketiga dataset hasil preprocessing ke dalam folder `data/clean/` dalam format `.csv`.

```python
df_likert_utama.to_csv(OUTPUT_DIR / "likert_mahasiswa_utama_clean.csv", index=False)
df_likert_klinik.to_csv(OUTPUT_DIR / "likert_mahasiswa_klinik_clean.csv", index=False)
df_teks.to_csv(OUTPUT_DIR / "teks_mahasiswa_clean.csv", index=False)

print("Selesai. 3 file tersimpan di:", OUTPUT_DIR)
```

#### Output:

```text
Selesai. 3 file tersimpan di: c:\KULIAH\SEM 5\Project Analitika Data\data\clean
```

---