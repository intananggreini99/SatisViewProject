# Notebook Preprocessing & Analisis tim

Isi folder ini adalah file asli dari **`Preprocessing&Analysis.zip`** (tidak diubah):

| File | Keterangan |
|---|---|
| `preprocssing-mahasiswa-finalpakeygini.ipynb` | preprocessing final (dipakai pipeline) |
| `text-analytics-mahasiswa.ipynb` | text analytics komentar (Sastrawi + kamus kata kunci) |
| `priority-analysis-mahasiswa.ipynb` | skor & kuadran prioritas perbaikan |
| `mds-mahasiswa.ipynb` | Multidimensional Scaling (peta responden & aspek) |
| `Preprocessing-Mahasiswa.ipynb` | versi awal preprocessing (arsip) |
| `preprocessing-mahasiswa.md` | dokumentasi preprocessing |

Pipeline Airflow **tidak** menjalankan notebook ini langsung; isinya di-*port* ke
`airflow/include/satisview/tim/` (lihat README utama, bagian 4). Kesamaan hasilnya
diuji oleh `airflow/tests/test_notebook_tim.py`, yang menjalankan keempat notebook di
atas pada data contoh lalu membandingkan semua file CSV keluarannya dengan pipeline.

Bila notebook diperbarui, terapkan perubahan yang sama di modul `tim/` yang sesuai lalu
jalankan `pytest airflow/tests -q`.
