"""Data respons SINTETIS — KHUSUS pengujian otomatis (pytest), tidak dipakai aplikasi.

Aplikasi SatisView hanya membaca data respons asli dari folder Google Drive
"Data Responden". Modul ini ada agar tes bisa berjalan tanpa akses Drive dan
tanpa menyimpan data pribadi responden di repositori.

BUKAN data asli — nilai, komentar, dan nomor dibangkitkan acak. Yang ditiru
hanya STRUKTUR sheet respons Google Form:

* Mahasiswa: 74 kolom persis seperti daftar kolom di dokumentasi
  preprocessing tim (``analisis/preprocessing-mahasiswa.md``), jawaban
  ``"1 - Tidak Baik"`` ... ``"4 - Sangat Baik"``, bagian Klinik bersyarat.
* Dosen & Karyawan: judul kolom persis sheet ``... (Responses)`` di Google
  Drive, jawaban ``"Sangat Tidak Puas"`` ... ``"Sangat Puas"``.
* Mitra Kerja Sama & Mitra Pengadaan: judul kolom, opsi & skala persis sheet
  asli (diambil dari contracts/kuesioner.json), jawaban acak.
"""

from __future__ import annotations

import io
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

SKALA_BAIK = ["1 - Tidak Baik", "2 - Kurang Baik", "3 - Baik", "4 - Sangat Baik"]
SKALA_PUAS = ["Sangat Tidak Puas", "Tidak Puas", "Puas", "Sangat Puas"]

# ------------------------------------------------------------------ Mahasiswa
# (judul grid, aspek, rata-rata sasaran, fasilitas?, butir)
MAHASISWA_GRID = [
    ("Bagaimana penilaian Anda terhadap layanan Administrasi Akademik berikut?", "Administrasi Akademik", 3.12, False, [
        "Persyaratan untuk mengurus layanan akademik jelas dan mudah dipenuhi",
        "Langkah-langkah untuk mendapatkan layanan akademik jelas dan mudah dilakukan",
        "Layanan akademik diselesaikan dengan cepat sesuai waktu yang dijanjikan",
        "Informasi mengenai biaya layanan, jika ada, jelas dan sesuai dengan ketentuan",
        "Hasil layanan akademik yang diterima sesuai dengan kebutuhan",
        "Petugas mampu memberikan informasi dan membantu menyelesaikan kebutuhan akademik",
        "Petugas ramah, sopan, dan membantu saat memberikan layanan",
        "Keluhan atau masalah mudah disampaikan dan mendapatkan tindak lanjut",
        "Fasilitas dan sistem layanan akademik mudah digunakan dan berfungsi dengan baik",
    ]),
    ("Bagaimana penilaian Anda terhadap layanan Kemahasiswaan berikut?", "Kemahasiswaan", 3.14, False, [
        "Persyaratan untuk mendapatkan layanan kemahasiswaan jelas dan mudah dipenuhi",
        "Langkah-langkah untuk mendapatkan layanan kemahasiswaan jelas dan mudah dilakukan",
        "Layanan kemahasiswaan diproses dengan cepat sesuai waktu yang dijanjikan",
        "Informasi mengenai biaya layanan, jika ada, jelas dan sesuai ketentuan",
        "Layanan yang diterima sesuai dengan kebutuhan sebagai mahasiswa",
        "Petugas mampu memberikan informasi dan membantu menyelesaikan kebutuhan mahasiswa",
        "Petugas ramah, sopan, dan membantu saat memberikan layanan",
        "Keluhan atau masalah mudah disampaikan dan mendapatkan tindak lanjut",
        "Fasilitas dan media informasi layanan kemahasiswaan mudah diakses dan digunakan",
        "Informasi dan pengelolaan layanan beasiswa mahasiswa jelas dan mudah diakses",
    ]),
    ("Bagaimana penilaian Anda terhadap layanan Administrasi Keuangan berikut?", "Administrasi Keuangan", 3.24, False, [
        "Persyaratan untuk mengurus administrasi keuangan jelas dan mudah dipenuhi",
        "Proses pembayaran dan pengurusan administrasi keuangan jelas dan mudah dilakukan",
        "Masalah administrasi keuangan ditangani dengan cepat",
        "Informasi mengenai UKT, tagihan, dan biaya lainnya jelas dan mudah dipahami",
        "Informasi dan hasil layanan keuangan yang diterima benar dan sesuai kebutuhan",
        "Petugas mampu menjelaskan dan membantu menyelesaikan masalah administrasi keuangan",
        "Petugas ramah, sopan, dan membantu saat memberikan layanan",
        "Masalah pembayaran atau tagihan mudah disampaikan dan mendapatkan penyelesaian",
        "Sistem dan fasilitas layanan keuangan mudah digunakan dan berfungsi dengan baik",
    ]),
    ("Bagaimana penilaian Anda terhadap layanan Administrasi Umum berikut?", "Administrasi Umum", 3.18, False, [
        "Persyaratan untuk mendapatkan layanan administrasi umum jelas dan mudah dipenuhi",
        "Langkah-langkah mendapatkan layanan jelas dan mudah dilakukan",
        "Layanan diselesaikan dengan cepat sesuai waktu yang dijanjikan",
        "Informasi mengenai biaya layanan, jika ada, jelas dan sesuai ketentuan",
        "Hasil layanan yang diterima sesuai dengan kebutuhan",
        "Petugas mampu memberikan informasi dan membantu kebutuhan mahasiswa",
        "Petugas ramah, sopan, dan membantu saat memberikan layanan",
        "Keluhan atau masalah mudah disampaikan dan mendapatkan tindak lanjut",
        "Tempat dan fasilitas pelayanan nyaman dan mendukung proses pelayanan",
    ]),
    ("Bagaimana penilaian Anda terhadap Ruang Kuliah?", "Ruang Kuliah", 3.20, True, [
        "Ruang kuliah bersih dan nyaman digunakan",
        "Pencahayaan dan suhu/ventilasi ruang kuliah sudah nyaman",
        "Meja, kursi, papan tulis, proyektor/TV, dan fasilitas pembelajaran lainnya tersedia dan berfungsi dengan baik",
    ]),
    ("Bagaimana penilaian Anda terhadap fasilitas Laboratorium?", "Laboratorium", 3.19, True, [
        "Alat dan fasilitas laboratorium tersedia sesuai kebutuhan praktikum",
        "Alat laboratorium dalam kondisi baik dan dapat digunakan",
        "Laboratorium bersih, nyaman, dan aman digunakan untuk praktikum",
    ]),
    ("Bagaimana penilaian Anda terhadap fasilitas dan layanan Perpustakaan?", "Perpustakaan", 3.30, True, [
        "Buku, referensi, dan sumber belajar yang tersedia sesuai dengan kebutuhan",
        "Layanan dan sumber digital perpustakaan mudah diakses",
        "Ruang perpustakaan nyaman digunakan untuk membaca dan belajar",
    ]),
    ("Bagaimana penilaian Anda terhadap layanan TIK dan Sistem Informasi kampus?", "TIK dan Sistem Informasi kampus", 2.72, True, [
        "Internet/Wi-Fi kampus mudah diakses dan memiliki koneksi yang memadai",
        "Sistem informasi/aplikasi kampus mudah digunakan dan dapat diakses saat dibutuhkan",
        "Ketika terjadi kendala TIK, bantuan atau penanganannya mudah diperoleh",
    ]),
    ("Bagaimana penilaian Anda terhadap fasilitas Toilet kampus?", "Toilet kampus", 3.05, True, [
        "Toilet kampus bersih, tidak bau dan nyaman digunakan",
        "Air, sabun, dan fasilitas pendukung toilet tersedia dengan baik",
        "Jumlah dan kondisi toilet memadai untuk kebutuhan mahasiswa",
    ]),
    ("Bagaimana penilaian Anda terhadap fasilitas Parkir kampus?", "Parkir kampus", 2.51, True, [
        "Tempat parkir cukup untuk menampung kendaraan mahasiswa",
        "Area parkir tertata dan mudah digunakan",
        "Kendaraan cukup aman ketika diparkir di lingkungan kampus",
    ]),
    ("Bagaimana penilaian Anda terhadap Lingkungan Kampus?", "Lingkungan Kampus", 3.27, True, [
        "Lingkungan kampus bersih dan nyaman",
        "Lingkungan kampus aman untuk aktivitas mahasiswa",
        "Ruang terbuka, penghijauan, dan fasilitas umum di kampus sudah memadai",
    ]),
]
MAHASISWA_KLINIK = (
    "Bagaimana penilaian Anda terhadap aspek layanan Klinik Kampus berikut?", "Klinik Kampus", 3.35, False, [
        "Persyaratan untuk mendapatkan layanan klinik mudah dipenuhi",
        "Proses untuk mendapatkan layanan klinik mudah dilakukan",
        "Pelayanan klinik dapat diperoleh dengan cepat saat dibutuhkan",
        "Informasi mengenai jadwal, jenis layanan, dan ketentuan pelayanan klinik disampaikan dengan jelas",
        "Layanan klinik yang diberikan sesuai dengan kebutuhan mahasiswa",
        "Petugas klinik mampu memberikan pelayanan dan informasi dengan baik",
        "Petugas klinik ramah, sopan, dan membantu",
        "Keluhan atau kendala terkait layanan klinik mudah disampaikan dan mendapatkan tindak lanjut",
        "Ruang dan fasilitas klinik bersih, nyaman, dan mendukung pelayanan",
    ],
)
MAHASISWA_GATING = "Apakah Anda pernah menggunakan layanan Klinik Kampus PENS?  "
MAHASISWA_PRIORITAS = "Menurut Anda, layanan atau fasilitas mana yang paling perlu ditingkatkan (pilih maksimum 3)?  "
MAHASISWA_TEKS = (
    "Menurut Anda, layanan atau fasilitas apa yang perlu diperbaiki di kampus? "
    "Jelaskan perbaikan yang Anda harapkan. (Opsional)"
)
# (pilihan pada form, bobot peluang dipilih) — urutan opsi form
MAHASISWA_PILIHAN = [
    ("Administrasi Akademik", 0.165), ("Layanan Kemahasiswaan", 0.14), ("Administrasi Keuangan", 0.03),
    ("Administrasi Umum", 0.05), ("Ruang Kuliah", 0.15), ("Laboratorium", 0.215), ("Perpustakaan", 0.06),
    ("Internet/Wi-Fi dan Sistem Informasi", 0.76), ("Toilet", 0.22), ("Parkir", 0.80),
    ("Lingkungan Kampus", 0.10), ("Layanan Klinik", 0.04),
]
PROGRAM_STUDI = [
    "STr./D3 Teknik Informatika", "STr./D3 Teknik Elektronika", "STr./D3 Teknik Telekomunikasi",
    "STr./D3 Teknik Elektro Industri", "STr. Teknik Komputer", "STr. Teknik Mekatronika",
    "STr. Sistem Pembangkit Energi", "STr. Teknologi Game", "STr. Teknologi Rekayasa Multimedia",
    "STr. Teknologi Rekayasa Internet", "STr. Sains Data Terapan", "STr. Bisnis Digital",
    "D3 Teknologi Multimedia Broadcasting", "STr. Teknologi Rekayasa Perancangan Manufaktur",
]
KOMENTAR_MAHASISWA = {
    "Parkir": [
        "Parkiran terlalu sempit, sering nggak kebagian tempat kalau datang siang",
        "PARKIRANN penuh terus, tolong ditambah lahan parkir motor",
        "parkir motor perlu diperluas karena jumlah mahasiswa makin banyak",
        "Area parkir kurang tertata, keluar masuk kendaraan jadi lama",
        "Mohon parkiran ditata ulang dan ada petugas jukir di jam sibuk",
        "tempat parkir kurang, helm juga kadang hilang",
        "Parkir D3 tolong diperluas, kalau hujan juga becek",
    ],
    "Wifi": [
        "Wifi kampus sering lemot dan putus, susah buat kuliah daring",
        "Internet di gedung kuliah lemot banget pas jam ramai",
        "koneksi wi-fi tolong ditingkatkan, sinyal di kelas lantai atas lemah",
        "ETHOL sering error dan susah login waktu ujian",
        "Aplikasi kampus kadang down, mohon server ditingkatkan",
    ],
    "Kemahasiswaan": [
        "Informasi beasiswa telat diumumkan, mohon lebih awal",
        "Pengurusan kegiatan UKM dan organisasi mahasiswa ribet",
        "Dana kegiatan himpunan cairnya lama",
    ],
    "Toilet": [
        "Toilet di beberapa lantai bau dan sabun sering habis",
        "Kamar mandi kurang bersih, keran ada yang rusak",
    ],
    "Lab": [
        "Peralatan lab banyak yang rusak dan belum diganti",
        "Komputer lab lambat, perlu upgrade untuk praktikum",
    ],
    "Kelas": [
        "AC di beberapa kelas mati, ruangan panas",
        "Proyektor kelas sering bermasalah dan colokan kurang",
    ],
    "Akademik": [
        "Pengurusan surat di BAAK lama, petugasnya juga kurang ramah",
        "Jadwal kuliah sering berubah mendadak",
    ],
    "Lingkungan": ["Tempat sampah perlu ditambah dan taman lebih dirawat", "Penerangan lampu di area belakang kurang"],
    "Perpus": ["Buku referensi di perpustakaan kurang lengkap"],
    "Keuangan": ["Informasi tagihan UKT kadang membingungkan"],
    "Klinik": ["Klinik sebaiknya buka lebih lama dan obat lebih lengkap"],
    "Lain": ["fasilitas air minum belum ada", "Perbanyak bangku di lorong untuk duduk", "tidak ada", "-", ".", "Semoga makin baik"],
}
BOBOT_KOMENTAR_MAHASISWA = {
    "Parkir": 0.42, "Wifi": 0.2, "Kemahasiswaan": 0.08, "Toilet": 0.05, "Lab": 0.05, "Kelas": 0.05,
    "Akademik": 0.03, "Lingkungan": 0.03, "Perpus": 0.02, "Keuangan": 0.01, "Klinik": 0.01, "Lain": 0.05,
}

# --------------------------------------------------------------------- Dosen
DOSEN_GRID = [
    ("Administrasi Akademik", 3.25, False, [
        "Seberapa puas Anda dengan kejelasan informasi kalender akademik, jadwal, dan kegiatan perkuliahan?",
        "Bagaimana penilaian anda terhadap pengelolaan dan kemudahan proses administrasi pelaksanaan perkuliahan?",
        "Bagaimana tingkat kepuasan Anda terhadap ketersediaan dan ketepatan data akademik pendukung kerja?",
        "Seberapa puas Anda dengan kecepatan penyelesaian layanan administrasi akademik?",
        "Bagaimana penilaian Anda terhadap kemampuan petugas dalam melayani dan menyelesaikan kebutuhan akademik?",
        "Sejauh mana Anda merasa puas dengan keramahan dan kesigapan petugas akademik?",
        "Bagaimana tingkat kepuasan Anda terhadap sistem informasi layanan akademik?",
    ]),
    ("Kemahasiswaan", 3.3, False, [
        "Seberapa puas Anda dengan kejelasan informasi kegiatan, program, dan layanan kemahasiswaan?",
        "Bagaimana penilaian Anda terhadap dukungan administrasi untuk kegiatan atau organisasi mahasiswa?",
        "Sejauh mana Anda merasa puas dengan koordinasi unit kemahasiswaan dengan dosen atau staf lainnya?",
        "Bagaimana tingkat kepuasan Anda terhadap kecepatan respons petugas terkait kebutuhan kemahasiswaan?",
        "Seberapa puas Anda dengan kemampuan dan sikap petugas kemahasiswaan?",
    ]),
    ("Administrasi Keuangan", 2.95, False, [
        "Bagaimana penilaian Anda terhadap kejelasan informasi dan ketentuan administrasi keuangan?",
        "Sejauh mana Anda merasa puas dengan kemudahan proses pembayaran atau reimbursement?",
        "Bagaimana tingkat kepuasan Anda terhadap layanan administrasi keuangan untuk perjalanan dinas?",
        "Seberapa puas Anda dengan dukungan administrasi keuangan untuk pelaksanaan kegiatan Anda?",
        "Bagaimana penilaian Anda terhadap kecepatan proses administrasi keuangan?",
        "Sejauh mana Anda merasa puas dengan ketepatan informasi administrasi keuangan yang diterima?",
        "Bagaimana tingkat kepuasan Anda terhadap kemampuan petugas dalam membantu menyelesaikan masalah keuangan?",
        "Seberapa puas Anda dengan sistem atau aplikasi layanan administrasi keuangan?",
    ]),
    ("Administrasi Umum", 3.15, False, [
        "Bagaimana penilaian Anda terhadap dukungan administrasi umum untuk rapat atau kebutuhan kedinasan?",
        "Sejauh mana Anda merasa puas dengan kecepatan penyelesaian layanan administrasi umum?",
        "Bagaimana tingkat kepuasan Anda terhadap kemampuan petugas administrasi umum?",
        "Seberapa puas Anda dengan keramahan dan kesigapan petugas administrasi umum?",
    ]),
    ("SDM/Kepegawaian", 3.0, False, [
        "Bagaimana penilaian Anda terhadap kemudahan memperoleh informasi kepegawaian?",
        "Sejauh mana Anda merasa puas dengan layanan dan sistem presensi pegawai?",
        "Bagaimana tingkat kepuasan Anda terhadap proses pengajuan cuti atau izin?",
        "Seberapa puas Anda dengan layanan administrasi terkait kinerja pegawai?",
        "Bagaimana penilaian Anda terhadap layanan informasi terkait karier atau kenaikan pangkat?",
        "Sejauh mana Anda merasa puas dengan fasilitas pelatihan dan pengembangan kompetensi?",
        "Bagaimana tingkat kepuasan Anda terhadap pengurusan dan ketepatan dokumen kepegawaian?",
        "Seberapa puas Anda dengan kemampuan petugas menyelesaikan permasalahan kepegawaian?",
        "Bagaimana penilaian Anda terhadap sistem informasi kepegawaian?",
        "Bagaimana tingkat kepuasan Anda terhadap layanan dan pendampingan dalam proses penilaian kinerja tahunan "
        "(misalnya SKP atau evaluasi kinerja lainnya)?",
    ]),
    ("Penelitian & Pengabdian", 2.85, False, [
        "Sejauh mana Anda merasa puas dengan kejelasan informasi program penelitian dan pengabdian?",
        "Bagaimana tingkat kepuasan Anda terhadap proses pengajuan dan seleksi proposal penelitian/pengabdian?",
        "Seberapa puas Anda dengan dukungan administrasi selama pelaksanaan penelitian/pengabdian?",
        "Bagaimana penilaian Anda terhadap proses pelaporan administrasi penelitian/pengabdian?",
        "Sejauh mana Anda merasa puas dengan layanan publikasi, HKI, atau luaran penelitian/pengabdian?",
        "Seberapa puas Anda dengan kecepatan pelayanan penelitian dan pengabdian?",
        "Bagaimana penilaian Anda terhadap kemampuan petugas dalam memberikan informasi dan pendampingan?",
    ]),
    ("TIK & Sistem Informasi", 2.8, True, [
        "Sejauh mana Anda merasa puas dengan kualitas dan kestabilan internet/Wi-Fi di kampus?",
        "Bagaimana tingkat kepuasan Anda terhadap sistem informasi akademik yang digunakan?",
        "Seberapa puas Anda dengan kemudahan penggunaan sistem atau aplikasi internal kampus?",
        "Bagaimana penilaian Anda terhadap keandalan dan ketersediaan sistem informasi saat dibutuhkan?",
        "Sejauh mana Anda merasa puas dengan kecepatan penanganan saat terjadi masalah TIK (Bantuan/Helpdesk)?",
    ]),
    ("Ruang Kerja", 3.1, True, [
        "Bagaimana tingkat kepuasan Anda terhadap kebersihan dan kenyamanan ruang kerja?",
        "Seberapa puas Anda dengan ketersediaan dan kondisi fasilitas kerja Anda?",
        "Bagaimana penilaian Anda terhadap lingkungan ruang kerja (pencahayaan, suhu, dan ventilasi)?",
    ]),
    ("Laboratorium", 3.05, True, [
        "Sejauh mana Anda merasa puas dengan ketersediaan peralatan laboratorium?",
        "Bagaimana tingkat kepuasan Anda terhadap kondisi dan fungsi peralatan laboratorium?",
        "Seberapa puas Anda dengan kesiapan laboratorium dalam mendukung kegiatan praktikum?",
        "Bagaimana penilaian Anda terhadap kebersihan, keamanan, dan keselamatan di lingkungan laboratorium?",
    ]),
    ("Toilet", 2.75, True, [
        "Bagaimana tingkat kepuasan Anda terhadap kebersihan dan kenyamanan toilet?",
        "Seberapa puas Anda dengan ketersediaan air, sabun, dan fasilitas pendukung toilet?",
    ]),
    ("Parkir", 2.7, True, [
        "Bagaimana tingkat kepuasan Anda terhadap ketersediaan tempat parkir?",
        "Bagaimana tingkat kepuasan Anda terhadap keteraturan dan keamanan area parkir?",
    ]),
    ("Lingkungan Kampus", 3.2, True, [
        "Bagaimana tingkat kepuasan Anda terhadap kebersihan lingkungan kampus?",
        "Bagaimana tingkat kepuasan Anda terhadap kenyamanan lingkungan kampus untuk bekerja dan beraktivitas?",
        "Bagaimana tingkat kepuasan Anda terhadap keamanan lingkungan kampus?",
        "Bagaimana tingkat kepuasan Anda terhadap ruang terbuka, penghijauan, dan fasilitas umum kampus?",
    ]),
]
DOSEN_PRIORITAS = "Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3) "
DOSEN_PILIHAN = [
    ("Administrasi Akademik", 0.15), ("Kemahasiswaan", 0.1), ("Administrasi Keuangan", 0.45),
    ("Administrasi Umum", 0.12), ("SDM/Kepegawaian", 0.3), ("Penelitian & Pengabdian", 0.55),
    ("TIK & Sistem Informasi", 0.5), ("Laboratorium", 0.35),
]
DOSEN_TEKS = [
    "Layanan atau fasilitas apa yang menurut Anda paling perlu diperbaiki? Jelaskan perbaikan yang Anda harapkan.",
    "Apakah proses birokrasi terkait pengajuan dana hibah penelitian atau publikasi jurnal sudah cukup efisien? "
    "Berikan saran perbaikan Anda.  ",
]
DEPARTEMEN = [
    "Departement Teknik Elektro", "Departement Teknik Informatika dan Komputer",
    "Departement Teknik Mekanika dan Energi", "Departement Teknologi Multimedia Kreatif",
]
KOMENTAR_DOSEN = [
    [
        "Proses reimbursement perjalanan dinas perlu dipercepat dan dibuat online",
        "Wifi di ruang dosen sering lambat, mengganggu persiapan kuliah daring",
        "Peralatan laboratorium perlu kalibrasi dan peremajaan rutin",
        "Lahan parkir dosen sering terpakai kendaraan lain",
        "Toilet gedung perlu dibersihkan lebih sering",
        "Sistem informasi kepegawaian sebaiknya terintegrasi dengan presensi",
        "Ruang kerja dosen kurang ventilasi dan pencahayaan",
    ],
    [
        "Belum efisien, pengajuan hibah penelitian masih banyak dokumen fisik",
        "Birokrasi publikasi jurnal masih panjang, perlu SOP yang lebih ringkas",
        "Pelaporan keuangan hibah perlu template yang jelas",
        "Sudah cukup efisien, tinggal pendampingan proposal ditingkatkan",
        "Pencairan dana penelitian sering terlambat",
    ],
]

# ------------------------------------------------------------------ Karyawan
KARYAWAN_GRID = [
    ("Administrasi Kepegawaian", 3.05, False, [
        "Seberapa puas Anda dengan kejelasan informasi peraturan kepegawaian, cuti, hak/kewajiban, dan pengembangan karier?",
        "Bagaimana penilaian Anda terhadap sistem pengelolaan presensi, jadwal kerja, dan fleksibilitas penyesuaian jam kerja?",
        "Sejauh mana Anda merasa puas dengan kemudahan proses administrasi kepegawaian (cuti, klaim, dll.)?",
        "Bagaimana tingkat kepuasan Anda terhadap ketepatan, pembaruan, dan kemudahan akses data pribadi kepegawaian?",
        "Seberapa puas Anda dengan kecepatan dan ketepatan pengurusan dokumen kepegawaian?",
        "Bagaimana penilaian Anda terhadap kemampuan staf HR dalam memberikan solusi dan penjelasan masalah kepegawaian?",
        "Sejauh mana Anda merasa puas dengan keramahan dan kesigapan staf kepegawaian dalam melayani Anda?",
        "Bagaimana tingkat kepuasan Anda terhadap Sistem Informasi Kepegawaian yang digunakan?",
    ]),
    ("Kepegawaian", 3.1, False, [
        "Seberapa puas Anda dengan kejelasan informasi kebijakan, peraturan, kesejahteraan, dan layanan kepegawaian?",
        "Bagaimana penilaian Anda terhadap dukungan administrasi untuk kegiatan pengembangan kapasitas (pelatihan/sertifikasi)?",
        "Sejauh mana Anda merasa puas dengan layanan dan pendampingan proses penilaian kinerja (misal SKP)?",
        "Bagaimana tingkat kepuasan Anda terhadap pengelolaan layanan hak pegawai (cuti, kesehatan, tunjangan)?",
        "Seberapa puas Anda dengan koordinasi bagian kepegawaian dengan unit kerja Anda dalam urusan SDM?",
        "Bagaimana penilaian Anda terhadap kecepatan petugas kepegawaian merespons kebutuhan administratif?",
        "Sejauh mana Anda merasa puas dengan kemampuan dan sikap petugas dalam memberikan layanan kepegawaian?",
    ]),
    ("Administrasi Keuangan", 2.95, False, [
        "Bagaimana tingkat kepuasan Anda terhadap kejelasan informasi dan ketentuan administrasi keuangan pekerjaan Anda?",
        "Seberapa puas Anda dengan kemudahan proses pembayaran atau reimbursement kegiatan Anda?",
        "Bagaimana penilaian Anda terhadap layanan administrasi keuangan untuk perjalanan dinas?",
        "Sejauh mana Anda merasa puas dengan dukungan administrasi keuangan untuk pelaksanaan kegiatan Anda?",
        "Bagaimana tingkat kepuasan Anda terhadap kecepatan proses administrasi keuangan?",
        "Seberapa puas Anda dengan ketepatan hasil dan informasi administrasi keuangan yang diterima?",
        "Bagaimana penilaian Anda terhadap kemampuan petugas dalam membantu menyelesaikan permasalahan keuangan?",
        "Sejauh mana Anda merasa puas dengan sistem atau aplikasi pendukung layanan administrasi keuangan?",
    ]),
    ("Administrasi Umum", 3.2, False, [
        "Bagaimana tingkat kepuasan Anda terhadap layanan surat-menyurat dan dokumen kedinasan?",
        "Seberapa puas Anda dengan kecepatan pengelolaan dan penyampaian dokumen?",
        "Bagaimana penilaian Anda terhadap dukungan administrasi umum untuk rapat atau kegiatan kedinasan?",
        "Sejauh mana Anda merasa puas dengan kecepatan penyelesaian layanan administrasi umum?",
        "Bagaimana tingkat kepuasan Anda terhadap kemampuan petugas dalam membantu kebutuhan administrasi umum?",
        "Seberapa puas Anda dengan keramahan dan kesigapan petugas administrasi umum?",
    ]),
    ("SDM/Kepegawaian", 2.85, False, [
        "Bagaimana penilaian Anda terhadap layanan administrasi yang berkaitan dengan kinerja pegawai?",
        "Sejauh mana Anda merasa puas dengan layanan terkait karier, kenaikan pangkat, atau pengembangan profesi?",
        "Bagaimana tingkat kepuasan Anda terhadap fasilitasi pelatihan dan pengembangan kompetensi pegawai?",
    ]),
    ("TIK & Sistem Informasi", 2.8, True, [
        "Seberapa puas Anda dengan kualitas dan kestabilan internet/Wi-Fi untuk mendukung pekerjaan?",
        "Bagaimana penilaian Anda terhadap sistem informasi akademik yang digunakan?",
        "Sejauh mana Anda merasa puas dengan kemudahan penggunaan sistem atau aplikasi internal kampus?",
        "Bagaimana tingkat kepuasan Anda terhadap keandalan dan ketersediaan sistem informasi saat dibutuhkan?",
        "Seberapa puas Anda dengan kecepatan penanganan masalah TIK (Bantuan/Helpdesk)?",
    ]),
    ("Ruang Kerja", 2.9, True, [
        "Bagaimana penilaian Anda terhadap kebersihan dan kenyamanan ruang kerja?",
        "Sejauh mana Anda merasa puas dengan ketersediaan fasilitas yang mendukung pekerjaan Anda?",
        "Bagaimana tingkat kepuasan Anda terhadap pencahayaan, suhu, ventilasi, dan kondisi ruang kerja?",
    ]),
    ("Toilet", 2.8, True, [
        "Seberapa puas Anda dengan kebersihan dan kenyamanan toilet?",
        "Bagaimana tingkat kepuasan Anda terhadap ketersediaan air, sabun, dan fasilitas pendukung toilet?",
    ]),
    ("Parkir", 2.75, True, [
        "Bagaimana tingkat kepuasan Anda terhadap ketersediaan tempat parkir?",
        "Bagaimana tingkat kepuasan Anda terhadap keteraturan dan keamanan area parkir?",
    ]),
    ("Lingkungan Kampus", 3.2, True, [
        "Bagaimana tingkat kepuasan Anda terhadap kebersihan lingkungan kampus?",
        "Bagaimana tingkat kepuasan Anda terhadap kenyamanan lingkungan kampus untuk bekerja dan beraktivitas?",
        "Bagaimana tingkat kepuasan Anda terhadap keamanan lingkungan kampus?",
        "Bagaimana tingkat kepuasan Anda terhadap ruang terbuka, penghijauan, dan fasilitas umum kampus?",
    ]),
]
KARYAWAN_PRIORITAS = DOSEN_PRIORITAS
KARYAWAN_PILIHAN = [
    ("Administrasi Kepegawaian", 0.3), ("Kepegawaian", 0.2), ("Administrasi Keuangan", 0.4),
    ("Administrasi Umum", 0.15), ("SDM/Kepegawaian", 0.45), ("TIK & Sistem Informasi", 0.5),
]
KARYAWAN_TEKS = [
    "Layanan atau fasilitas apa yang menurut Anda paling perlu diperbaiki? Jelaskan perbaikan yang Anda harapkan.",
    "Jelaskan pengalaman Anda terkait dukungan kampus terhadap pengembangan karir dan kompetensi Anda "
    "(misalnya pelatihan teknis atau workshop). Apa jenis pelatihan yang paling Anda butuhkan saat ini?  ",
]
UNIT_KERJA = [
    "Satuan Pengawas Internal (SPI)", "Pusat Penelitian & Pengabdian kepada Masyarakat (P3M)",
    "Pusat Penjaminan Mutu & Pengembangan Pembelajaran (PPMPP)", "UPA Perpustakaan", "UPA Bahasa",
    "UPA Layanan Uji Kompetensi", "UPA Perawatan & Perbaikan", "UPA Pengembangan Karir & Kewirausahaan",
    "UPA Teknologi Informasi & Komunikasi", "UPA Pengembangan Teknologi & Produk Unggulan",
    "Bagian Akademik & Kemahasiswaan", "Bagian Perencanaan, Keuangan, & Umum", "Kesekretariatan",
    "Pengembangan SDM", "Kantor Urusan Internasional", "Unit Bisnis Masyarakat", "Unit Perencanaan dan Pelaporan",
    "Hubungan Masyarakat", "Tim Kerja Pemrosesan Data Elektronik", "Tim Kerja Teknologi Komunikasi dan Pembelajaran",
    "Tim Kerja Teknologi Informasi",
]
KOMENTAR_KARYAWAN = [
    [
        "Pengurusan cuti dan klaim sebaiknya bisa lewat aplikasi",
        "Jaringan internet di kantor unit sering terputus",
        "Ruang kerja kurang ventilasi dan pencahayaan",
        "Area parkir karyawan perlu penataan ulang",
        "Informasi kenaikan pangkat perlu disosialisasikan lebih jelas",
        "Proses reimbursement kegiatan masih lama",
    ],
    [
        "Pelatihan teknis untuk tendik perlu dijadwalkan rutin setiap semester",
        "Saya butuh workshop pengolahan data dan administrasi digital",
        "Dukungan pengembangan karir sudah ada, tapi pelatihan sertifikasi masih jarang",
        "Perlu diklat pelayanan prima dan kearsipan elektronik",
    ],
]

# ------------------------------------------------------------------- Mitra
# Struktur PERSIS sheet Mitra asli (judul kolom, opsi, skala) diambil dari
# contracts/kuesioner.json — kontrak yang juga dipakai form web SatisView.
KONTRAK = json.loads((Path(__file__).resolve().parents[2] / "contracts" / "kuesioner.json").read_text(encoding="utf-8"))

# rata-rata sasaran per aspek grid (skala 1-4)
MITRA_KS_RATA = {"Komunikasi dan Koordinasi": 3.45, "Pelaksanaan Kerja sama": 3.4, "Manfaat dan Dampak": 3.3,
                 "Keberlanjutan": 3.6, "Relevansi Program": 3.5, "Keseluruhan": 3.55}
MITRA_PB_RATA = {"Proses Kerja Sama": 3.5, "Pelaksanaan": 3.45, "Hasil": 3.4, "Dampak": 3.35, "Relevansi": 3.4,
                 "Keberlanjutan": 3.6, "Keseluruhan": 3.55}
ANOMALI_SHEET_ASLI = {
    "mitra_kerjasama": {
        (0, "Jenis Instansi"): "Lembaga Pendidikan",
        (1, "Bentuk kerja sama yang pernah dilakukan"): "Masih awal",
        (2, "Bentuk kerja sama yang pernah dilakukan"): "Penelitian, Pengabdian masyarakat, Magang, ",
    },
    "mitra_pengadaan": {
        (0, "Jenis Mitra"): "Penyedia Jasa Alih Daya",
        (1, "Hasil [Seberapa sesuai pelaksanaan pekerjaan dengan rencana / kontrak yang disepakati]"): np.nan,
        (2, "Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3 pilihan)"): np.nan,
        (3, "Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3 pilihan)"): "Perencanaan Kebutuhan",
    },
}

KOMENTAR_MITRA_KS = {
    "kelebihan": ["Komunikasi dan respons yang baik serta cepat", "Kooperatif dan memberi banyak ilmu",
                  "Keterbukaan untuk diskusi program", "Dosen pendamping profesional", "-"],
    "kendala": ["Tidak ada kendala berarti", "Koordinasi jadwal kegiatan kadang mendadak",
                "Belum ada kontak person khusus kerja sama", "Proses administrasi MoA cukup lama", "-"],
    "perbaikan": ["Perbanyak kolaborasi penelitian dan magang", "Tindak lanjut hasil kerja sama lebih rutin",
                  "Sinkronisasi kurikulum dengan kebutuhan industri", "Program pengabdian yang berdampak bagi masyarakat",
                  "Tidak ada"],
}
KOMENTAR_MITRA_PB = {
    "paling_memuaskan": ["Pembayaran tepat waktu", "Proses administrasi cepat dan tanggap", "Profesional dan transparan",
                         "Komunikasi mudah", "Prosesnya cepat"],
    "kendala": ["Tidak ada", "Spesifikasi barang kurang jelas", "Pencairan pembayaran kadang lama",
                "Pengurangan anggaran", "Belum ada kendala"],
    "saran_perbaikan": ["Spesifikasi barang yang diminta supaya lebih jelas", "Semoga kerja sama tetap berlangsung",
                        "Mempertahankan kualitas yang sekarang", "Informasi pengadaan lewat website", "-"],
}

# ============================================================ pembangkit acak
def _skor(rng: np.random.Generator, mean: float, umum: float, kelompok: float, fasilitas: bool) -> int:
    nilai = mean + umum + (kelompok if fasilitas else -0.35 * kelompok) + rng.normal(0, 0.45)
    return int(np.clip(np.rint(nilai), 1, 4))


def _pilih_prioritas(rng: np.random.Generator, pilihan: list[tuple[str, float]]) -> str:
    k = int(rng.choice([1, 2, 3], p=[0.15, 0.3, 0.55]))
    nama = [p for p, _ in pilihan]
    bobot = np.array([b for _, b in pilihan], dtype=float)
    terpilih = set(rng.choice(len(nama), size=min(k, len(nama)), replace=False, p=bobot / bobot.sum()))
    return ", ".join(n for i, n in enumerate(nama) if i in terpilih)  # urutan opsi form


def _waktu(rng: np.random.Generator, n: int, mulai: datetime) -> list[datetime]:
    detik = np.sort(rng.integers(0, 60 * 60 * 24 * 21, size=n))
    return [mulai + timedelta(seconds=int(s), milliseconds=int(rng.integers(0, 1000))) for s in detik]


def build_mahasiswa(n: int = 418, seed: int = 11) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    pyr = random.Random(seed)
    waktu = _waktu(rng, n, datetime(2026, 9, 9, 13, 0, 0))
    topik = list(BOBOT_KOMENTAR_MAHASISWA)
    bobot_topik = np.array(list(BOBOT_KOMENTAR_MAHASISWA.values()))
    rows = []
    for i in range(n):
        umum = rng.normal(0, 0.4)
        kelompok = rng.normal(0, 0.3)
        row = {
            "Timestamp": waktu[i],
            "Nomor Gopay": "08000" + str(rng.integers(10**6, 10**7)),  # nomor fiktif
            "Program Studi": pyr.choice(PROGRAM_STUDI),
            "Semester": int(rng.choice([1, 3, 5, 7])),
        }
        for judul, _aspek, mean, fasilitas, butir in MAHASISWA_GRID:
            for b in butir:
                row[f"{judul}   [{b}]"] = SKALA_BAIK[_skor(rng, mean, umum, kelompok, fasilitas) - 1]
        pernah = rng.random() < 0.28
        row[MAHASISWA_GATING] = "Ya" if pernah else "Tidak"
        judul, _aspek, mean, fasilitas, butir = MAHASISWA_KLINIK
        for b in butir:
            row[f"{judul}   [{b}]"] = SKALA_BAIK[_skor(rng, mean, umum, kelompok, fasilitas) - 1] if pernah else np.nan
        row[MAHASISWA_PRIORITAS] = _pilih_prioritas(rng, MAHASISWA_PILIHAN)
        if rng.random() < 0.75:
            t = topik[int(rng.choice(len(topik), p=bobot_topik / bobot_topik.sum()))]
            row[MAHASISWA_TEKS] = pyr.choice(KOMENTAR_MAHASISWA[t])
        else:
            row[MAHASISWA_TEKS] = np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def _build_grid_form(
    grid, segmen_kolom: str, segmen_nilai: list[str], prioritas_kolom: str | None, pilihan, teks_kolom: list[str],
    komentar: list[list[str]], n: int, seed: int, mulai: datetime, ekstra: dict[str, list[str]] | None = None,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    pyr = random.Random(seed)
    waktu = _waktu(rng, n, mulai)
    rows = []
    for i in range(n):
        umum = rng.normal(0, 0.4)
        kelompok = rng.normal(0, 0.3)
        row = {"Timestamp": waktu[i]}
        for kolom, nilai in (ekstra or {}).items():
            row[kolom] = pyr.choice(nilai)
        row[segmen_kolom] = pyr.choice(segmen_nilai)
        for aspek, mean, fasilitas, butir in grid:
            for b in butir:
                row[f"{aspek} [{b}]"] = SKALA_PUAS[_skor(rng, mean, umum, kelompok, fasilitas) - 1]
        if prioritas_kolom:
            row[prioritas_kolom] = _pilih_prioritas(rng, pilihan)
        for kolom, daftar in zip(teks_kolom, komentar):
            row[kolom] = pyr.choice(daftar) if rng.random() < 0.8 else np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def _build_dari_kontrak(key: str, rata: dict[str, float], komentar: dict[str, list[str]], n: int, seed: int,
                        mulai: datetime) -> pd.DataFrame:
    """Respons sintetis berstruktur persis seperti sheet asli (kolom & opsi dari kontrak)."""
    rng = np.random.default_rng(seed)
    pyr = random.Random(seed)
    waktu = _waktu(rng, n, mulai)
    rows = []
    for i in range(n):
        umum = rng.normal(0, 0.35)
        row = {KONTRAK["kolom_waktu"]: waktu[i].strftime("%d/%m/%Y %H:%M:%S")}
        for bagian in KONTRAK["kelompok"][key]["bagian"]:
            for q in bagian["pertanyaan"]:
                jenis = q["jenis"]
                if jenis == "grid":
                    mean = rata[q["judul"]]
                    kelompok = rng.normal(0, 0.15)
                    for b in q["baris"]:
                        row[b["kolom"]] = q["skala"][_skor(rng, mean, umum, kelompok, False) - 1]
                elif jenis == "teks_singkat":
                    row[q["kolom"]] = f"Instansi Contoh {i + 1}"
                elif jenis == "paragraf":
                    row[q["kolom"]] = pyr.choice(komentar[q["id"]])
                elif jenis in ("pilihan_ganda", "dropdown"):
                    row[q["kolom"]] = pyr.choice(q["opsi"])
                elif jenis == "kotak_centang":
                    k = int(rng.integers(1, (q.get("maks_pilihan") or 3) + 1))
                    pilih = set(pyr.sample(q["opsi"], k=min(k, len(q["opsi"]))))
                    row[q["kolom"]] = ", ".join(o for o in q["opsi"] if o in pilih)
        rows.append(row)
    df = pd.DataFrame(rows)
    # Kasus tepi yang memang ada di sheet asli Mitra (isian "Yang lain", koma
    # berlebih pada kotak centang, sel kosong pada grid/prioritas).
    for (i, kolom), nilai in ANOMALI_SHEET_ASLI.get(key, {}).items():
        df.loc[i, kolom] = nilai
    return df


def build_sample_frames(empty: tuple[str, ...] = ()) -> dict[str, pd.DataFrame]:
    frames = {
        "mahasiswa": build_mahasiswa(),
        "dosen": _build_grid_form(
            DOSEN_GRID, "Departemen", DEPARTEMEN, DOSEN_PRIORITAS, DOSEN_PILIHAN, DOSEN_TEKS, KOMENTAR_DOSEN,
            n=64, seed=22, mulai=datetime(2026, 10, 17, 8, 0, 0),
        ),
        "karyawan": _build_grid_form(
            KARYAWAN_GRID, "Unit Kerja", UNIT_KERJA, KARYAWAN_PRIORITAS, KARYAWAN_PILIHAN, KARYAWAN_TEKS,
            KOMENTAR_KARYAWAN, n=72, seed=33, mulai=datetime(2026, 10, 17, 8, 0, 0),
        ),
        "mitra_kerjasama": _build_dari_kontrak(
            "mitra_kerjasama", MITRA_KS_RATA, KOMENTAR_MITRA_KS, n=24, seed=44, mulai=datetime(2026, 9, 11, 9, 0, 0)
        ),
        "mitra_pengadaan": _build_dari_kontrak(
            "mitra_pengadaan", MITRA_PB_RATA, KOMENTAR_MITRA_PB, n=18, seed=55, mulai=datetime(2026, 9, 12, 9, 0, 0)
        ),
    }
    for key in empty:
        frames[key] = frames[key].iloc[0:0]
    return frames


def to_xlsx_bytes(df: pd.DataFrame, sheet_name: str = "Form Responses 1") -> bytes:
    buf = io.BytesIO()
    df.to_excel(buf, index=False, sheet_name=sheet_name)
    return buf.getvalue()
