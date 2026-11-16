"""Kode preprocessing & analisis TIM SatisView (dari "Preprocessing&Analysis.zip").

Setiap modul adalah port langsung dari notebook tim di folder ``analisis/``:

========================  ==============================================
Modul                     Notebook asal
========================  ==============================================
``preprocessing.py``      ``preprocssing-mahasiswa-finalpakeygini.ipynb``
``text_analytics.py``     ``text-analytics-mahasiswa.ipynb``
``priority_analysis.py``  ``priority-analysis-mahasiswa.ipynb``
``mds.py``                ``mds-mahasiswa.ipynb``
``konfigurasi.py``        sel konfigurasi tiap notebook (KOLOM_PII, KOLOM_TEKS,
                          ASPEK_KATA_KUNCI, KATA_PILIHAN, ...) untuk 5 kelompok
========================  ==============================================

Nama fungsi, rumus, parameter (bobot 1/3, ``random_state=42``, ``n_init``,
pembulatan) dan nama file CSV dipertahankan. Yang diubah hanya:

* path ``data/raw``, ``data/clean``, ``data/analytics`` diganti argumen fungsi
  (file dibaca/ditulis oleh task Airflow lewat docker volume & HDFS);
* konstanta khusus Mahasiswa dipindah ke ``konfigurasi.py`` agar kode yang
  sama berjalan untuk Dosen, Karyawan, dan Mitra;
* grafik matplotlib tidak dibuat (visualisasi ada di dashboard D3).

Perluasan kecil yang tidak mengubah hasil Mahasiswa ditandai komentar
``# [perluasan]`` di dalam kode.
"""
