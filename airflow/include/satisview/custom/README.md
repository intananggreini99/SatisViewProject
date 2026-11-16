# Modul preprocessing & analisis alternatif

Pipeline **sudah menjalankan kode tim dari `Preprocessing&Analysis.zip`**
(port notebook ada di `../tim/`, notebook aslinya di folder `analisis/` di
root repo). Folder ini hanya dipakai bila Anda ingin menambah atau mengganti
langkah tanpa mengubah kode tim.

Pipeline memanggil dua fungsi:

```python
def run_preprocessing(raw_df, group, options=None) -> tuple[dict[str, pd.DataFrame], dict]
def run_analysis(tabel_preprocessing, meta, group, options=None) -> tuple[dict[str, pd.DataFrame], dict]
```

* `raw_df` — isi sheet respons Google Form (XLSX dari HDFS), dibaca dengan
  `pd.read_excel` seperti di notebook.
* `group` — `RespondentGroup` (`group.key` = `mahasiswa`/`dosen`/`karyawan`/
  `mitra_kerjasama`/`mitra_pengadaan`).
* Kunci dict = nama file tanpa `.csv` (mis. `likert_mahasiswa_utama_clean`).
  Hasil preprocessing disimpan ke HDFS `/satisview/preprocessed/<responden>/`;
  hasil analisis ke `/satisview/analysis/<responden>/` lalu satu file = satu
  tabel di database `analysis_<responden>`.
* File & kolom wajib ada di `contracts/data_contract.json`. File tambahan boleh.

## Cara memasang

1. Tulis modul di folder ini (contoh: `contoh_adapter.py`).
2. Di `.env`:
   ```
   SATISVIEW_PREPROCESSING_MODULE=satisview.custom.contoh_adapter
   SATISVIEW_ANALYSIS_MODULE=satisview.custom.contoh_adapter
   ```
3. Library baru → `airflow/requirements.txt`, lalu
   `docker compose up -d --build airflow-scheduler airflow-webserver`.
4. Uji tanpa Docker: `pytest airflow/tests -q`.

Bila validasi gagal, laporan detailnya tersimpan di HDFS
`/satisview/validation/<responden>/` dan di log task Airflow.
