"""Konfigurasi kolom & kamus kata per kelompok responden.

Notebook tim (Mahasiswa) menuliskan konstanta ini di sel konfigurasi:

* preprocessing  : ``KOLOM_PII``, ``KOLOM_PROFIL``, ``KATA_KUNCI_KLINIK``,
  ``KOLOM_TEKS``, ``KOLOM_KATEGORI``, ``KOLOM_GATING_KLINIK``, ``SKALA``
* text analytics : ``ASPEK_KATA_KUNCI``
* priority       : ``KATA_PILIHAN``

Nilai Mahasiswa di bawah disalin persis dari notebook. Dosen & Karyawan
memakai judul kolom asli sheet Google Form (``... (Responses)``, sudah
dicocokkan dengan sheet di folder Drive "Data Responden"). Untuk sheet Mitra,
peran kolom dideteksi otomatis (lihat ``preprocessing.tentukan_kolom``):
pertanyaan grid ``Judul [butir]`` maupun pertanyaan tunggal berskala, dan
skala 1-4 / 1-5 dikenali dari isi jawaban.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Skor label Likert tanpa angka di depan (form Dosen/Karyawan: "Sangat Puas").
# Notebook tim memakai MAPPING_LIKERT {"Tidak Baik": 1, ..., "Sangat Baik": 4}
# untuk memeriksa label form Mahasiswa; daftar ini memperluasnya.
MAPPING_LIKERT_UMUM: dict[str, int] = {
    "Tidak Baik": 1,
    "Sangat Tidak Baik": 1,
    "Kurang Baik": 2,
    "Baik": 3,
    "Sangat Baik": 4,
    "Sangat Tidak Puas": 1,
    "Tidak Puas": 2,
    "Kurang Puas": 2,
    "Puas": 3,
    "Sangat Puas": 4,
    "Sangat Tidak Setuju": 1,
    "Tidak Setuju": 2,
    "Setuju": 3,
    "Sangat Setuju": 4,
}

# [perluasan] Skala lima tingkat (ada label tengah "Cukup"/"Netral"), dipakai
# otomatis bila jawaban sheet memuat label tengah tersebut.
MAPPING_LIKERT_5: dict[str, int] = {
    "Sangat Tidak Puas": 1,
    "Tidak Puas": 2,
    "Kurang Puas": 2,
    "Cukup Puas": 3,
    "Cukup": 3,
    "Netral": 3,
    "Biasa Saja": 3,
    "Puas": 4,
    "Sangat Puas": 5,
    "Sangat Tidak Baik": 1,
    "Tidak Baik": 2,
    "Kurang Baik": 2,
    "Cukup Baik": 3,
    "Baik": 4,
    "Sangat Baik": 5,
    "Sangat Tidak Setuju": 1,
    "Tidak Setuju": 2,
    "Ragu-ragu": 3,
    "Kurang Setuju": 2,
    "Setuju": 4,
    "Sangat Setuju": 5,
}


@dataclass(frozen=True)
class BagianBersyarat:
    """Bagian Likert opsional, mis. Klinik Kampus pada form Mahasiswa."""

    kata_kunci: str  # KATA_KUNCI_KLINIK = "klinik"
    nama: str  # dipakai di nama file: likert_<responden>_<nama>_clean.csv
    aspek: str  # df_kamus_klinik["aspek"] = "Klinik Kampus"
    prefix_item: str  # bangun_kamus(kolom_klinik, "KLINIK")
    kolom_gating: str | None = None  # KOLOM_GATING_KLINIK


@dataclass(frozen=True)
class KonfigurasiResponden:
    key: str
    prefix_id: str  # "MHS" -> response_id MHS_0001
    kolom_pii: tuple[str, ...] = ()
    kolom_profil: tuple[str, ...] = ("Timestamp",)
    kolom_segmen: str | None = None  # kolom profil yang dipakai filter dashboard
    pola_segmen: tuple[str, ...] = ()  # regex cadangan bila kolom_segmen tidak ada
    kolom_teks: dict[str, str] = field(default_factory=dict)
    kolom_kategori: dict[str, str] = field(default_factory=dict)
    bagian_bersyarat: BagianBersyarat | None = None
    # None = skala dikenali dari isi jawaban (1-4, 1-5, ...); lihat preprocessing.deteksi_skala
    skala: tuple[int, int] | None = (1, 4)
    mapping_likert: dict[str, int] = field(default_factory=lambda: dict(MAPPING_LIKERT_UMUM))
    aspek_kata_kunci: dict[str, list[str]] = field(default_factory=dict)
    kata_pilihan: dict[str, list[str]] = field(default_factory=dict)
    # [perluasan] pertanyaan tunggal (bukan grid "Judul [butir]") yang jawabannya
    # skala Likert ikut dihitung; aspeknya ditentukan lewat ``aspek_pertanyaan``
    # (aspek -> frasa khas pertanyaan), selain itu dari isi pertanyaan.
    likert_tanpa_grid: bool = False
    aspek_pertanyaan: dict[str, list[str]] = field(default_factory=dict)


# ----------------------------------------------------------------- Mahasiswa
# Disalin dari preprocssing-mahasiswa-finalpakeygini.ipynb (sel 1),
# text-analytics-mahasiswa.ipynb (sel 9) dan priority-analysis-mahasiswa.ipynb (sel 5).
MAHASISWA = KonfigurasiResponden(
    key="mahasiswa",
    prefix_id="MHS",
    kolom_pii=("Nomor Gopay",),
    kolom_profil=("Timestamp", "Program Studi", "Semester"),
    kolom_segmen="Program Studi",
    pola_segmen=(r"program\s*studi", r"\bprodi\b", r"jurusan"),
    kolom_teks={
        "saran_perbaikan": "Menurut Anda, layanan atau fasilitas apa yang perlu diperbaiki di kampus? "
        "Jelaskan perbaikan yang Anda harapkan. (Opsional)"
    },
    kolom_kategori={
        "prioritas": "Menurut Anda, layanan atau fasilitas mana yang paling perlu ditingkatkan (pilih maksimum 3)?"
    },
    bagian_bersyarat=BagianBersyarat(
        kata_kunci="klinik",
        nama="klinik",
        aspek="Klinik Kampus",
        prefix_item="KLINIK",
        kolom_gating="Apakah Anda pernah menggunakan layanan Klinik Kampus PENS?",
    ),
    skala=(1, 4),
    aspek_kata_kunci={
        "Administrasi Akademik": ["akademik", "krs", "khs", "transkrip", "jadwal", "dosen wali", "baak", "absen", "insentif", "magang", "kp"],
        "Kemahasiswaan": ["kemahasiswaan", "beasiswa", "ukm", "organisasi", "himpunan", "bem", "kegiatan mahasiswa", "prestasi"],
        "Administrasi Keuangan": ["keuangan", "ukt", "bayar", "pembayaran", "tagihan", "biaya", "spp"],
        "Administrasi Umum": ["administrasi umum", "surat", "legalisir", "tata usaha", "birokrasi", "loket"],
        "Ruang Kuliah": ["ruang kuliah", "kelas", "ac", "proyektor", "kursi", "meja", "papan tulis", "colokan", "ventilasi", "kipas"],
        "Laboratorium": ["laboratorium", "lab", "praktikum", "komputer", "peralatan"],
        "Perpustakaan": ["perpustakaan", "buku", "referensi", "jurnal", "literatur"],
        "TIK dan Sistem Informasi kampus": ["wifi", "internet", "jaringan", "koneksi", "sinyal", "sistem informasi", "website", "siakad", "aplikasi", "server", "login", "lemot", "ETHOL", "etholl"],
        "Toilet kampus": ["toilet", "wc", "kamar mandi", "sabun", "keran", "kran", "air bersih"],
        "Parkir kampus": ["parkir", "parkiran", "motor", "mobil", "kendaraan", "helm", "parkirann", "jukir", "PARKIRAAAANNNNN", "PARKIRRRR"],
        "Lingkungan Kampus": ["lingkungan", "sampah", "taman", "penghijauan", "pohon", "keamanan", "satpam", "kantin", "musholla", "mushola", "masjid", "banjir", "lampu", "bising"],
        "Klinik Kampus": ["klinik", "dokter", "obat", "kesehatan", "perawat", "medis"],
    },
    kata_pilihan={
        "Administrasi Akademik": ["akademik"],
        "Kemahasiswaan": ["kemahasiswaan", "beasiswa"],
        "Administrasi Keuangan": ["keuangan"],
        "Administrasi Umum": ["administrasi umum"],
        "Ruang Kuliah": ["ruang kuliah", "kelas"],
        "Laboratorium": ["laboratorium", "lab"],
        "Perpustakaan": ["perpustakaan"],
        "TIK dan Sistem Informasi kampus": ["tik", "sistem informasi", "wifi", "wi-fi", "internet"],
        "Toilet kampus": ["toilet"],
        "Parkir kampus": ["parkir"],
        "Lingkungan Kampus": ["lingkungan"],
        "Klinik Kampus": ["klinik"],
    },
)

# --------------------------------------------- kamus bersama Dosen & Karyawan
# Mengikuti gaya ASPEK_KATA_KUNCI tim; nama aspek = judul grid pada form.
_TIK = ["tik", "wifi", "internet", "jaringan", "koneksi", "sinyal", "sistem informasi", "website", "aplikasi",
        "server", "login", "lemot", "helpdesk", "ethol", "siakad", "email"]
_TOILET = ["toilet", "wc", "kamar mandi", "sabun", "keran", "kran", "air bersih"]
_PARKIR = ["parkir", "parkiran", "motor", "mobil", "kendaraan", "helm", "jukir"]
_LINGKUNGAN = ["lingkungan", "sampah", "taman", "penghijauan", "pohon", "keamanan", "satpam", "kantin", "musholla",
               "mushola", "masjid", "banjir", "lampu", "bising"]
_KEUANGAN = ["keuangan", "bayar", "pembayaran", "reimburse", "reimbursement", "honor", "honorarium", "perjalanan dinas",
             "spj", "anggaran", "pencairan", "tagihan", "biaya"]
_RUANG_KERJA = ["ruang kerja", "kantor", "meja", "kursi", "pencahayaan", "suhu", "ac", "ventilasi", "printer", "atk"]

DOSEN = KonfigurasiResponden(
    key="dosen",
    prefix_id="DSN",
    kolom_profil=("Timestamp", "Departemen"),
    kolom_segmen="Departemen",
    pola_segmen=(r"departe?men", r"department", r"jurusan"),
    kolom_teks={
        "saran_perbaikan": "Layanan atau fasilitas apa yang menurut Anda paling perlu diperbaiki? "
        "Jelaskan perbaikan yang Anda harapkan.",
        "saran_birokrasi_hibah": "Apakah proses birokrasi terkait pengajuan dana hibah penelitian atau publikasi jurnal "
        "sudah cukup efisien? Berikan saran perbaikan Anda.",
    },
    kolom_kategori={"prioritas": "Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3)"},
    aspek_kata_kunci={
        "Administrasi Akademik": ["akademik", "kalender akademik", "jadwal", "perkuliahan", "baak", "nilai", "krs", "khs", "transkrip", "dosen wali", "perwalian"],
        "Kemahasiswaan": ["kemahasiswaan", "beasiswa", "ukm", "organisasi", "himpunan", "bem", "kegiatan mahasiswa", "prestasi", "lomba"],
        "Administrasi Keuangan": _KEUANGAN,
        "Administrasi Umum": ["administrasi umum", "surat", "persuratan", "rapat", "kedinasan", "tata usaha", "loket", "legalisir"],
        "SDM/Kepegawaian": ["kepegawaian", "sdm", "pegawai", "cuti", "izin", "presensi", "absensi", "kinerja", "skp", "karier", "karir", "pangkat", "jabatan fungsional", "jafung", "pelatihan", "kompetensi", "serdos", "bkd"],
        "Penelitian & Pengabdian": ["penelitian", "pengabdian", "hibah", "proposal", "publikasi", "jurnal", "hki", "haki", "paten", "p3m", "luaran", "riset", "abdimas"],
        "TIK & Sistem Informasi": _TIK,
        "Ruang Kerja": _RUANG_KERJA + ["ruang dosen"],
        "Laboratorium": ["laboratorium", "lab", "praktikum", "peralatan", "komputer", "kalibrasi"],
        "Toilet": _TOILET,
        "Parkir": _PARKIR,
        "Lingkungan Kampus": _LINGKUNGAN,
    },
)

KARYAWAN = KonfigurasiResponden(
    key="karyawan",
    prefix_id="KRY",
    kolom_profil=("Timestamp", "Unit Kerja"),
    kolom_segmen="Unit Kerja",
    pola_segmen=(r"unit\s*kerja", r"\bbagian\b", r"\bunit\b"),
    kolom_teks={
        "saran_perbaikan": "Layanan atau fasilitas apa yang menurut Anda paling perlu diperbaiki? "
        "Jelaskan perbaikan yang Anda harapkan.",
        "pengembangan_karier": "Jelaskan pengalaman Anda terkait dukungan kampus terhadap pengembangan karir dan kompetensi "
        "Anda (misalnya pelatihan teknis atau workshop). Apa jenis pelatihan yang paling Anda butuhkan saat ini?",
    },
    kolom_kategori={"prioritas": "Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3)"},
    aspek_kata_kunci={
        "Administrasi Kepegawaian": ["administrasi kepegawaian", "presensi", "absensi", "jadwal kerja", "jam kerja", "cuti", "klaim", "data pribadi", "dokumen kepegawaian", "hr", "simpeg"],
        "Kepegawaian": ["kepegawaian", "kebijakan", "peraturan", "kesejahteraan", "tunjangan", "hak pegawai", "kesehatan", "bpjs", "skp", "penilaian kinerja"],
        "Administrasi Keuangan": _KEUANGAN,
        "Administrasi Umum": ["administrasi umum", "surat", "persuratan", "surat menyurat", "dokumen kedinasan", "rapat", "kedinasan", "tata usaha", "birokrasi", "disposisi"],
        "SDM/Kepegawaian": ["sdm", "karier", "karir", "pangkat", "kenaikan pangkat", "pengembangan profesi", "pelatihan", "workshop", "diklat", "kompetensi", "sertifikasi"],
        "TIK & Sistem Informasi": _TIK,
        "Ruang Kerja": _RUANG_KERJA,
        "Toilet": _TOILET,
        "Parkir": _PARKIR,
        "Lingkungan Kampus": _LINGKUNGAN,
    },
)

# ------------------------------------------------------------------ Mitra
# Struktur sheet "Pelayanan Kepuasan - Mitra Kerja sama (Responses)" dan
# "Pelayanan Kepuasan - Mitra pengadaan barang & jasa (Responses)" di folder
# Drive "Data Responden" (sama dengan contracts/kuesioner.json): grid
# "Aspek [pertanyaan]" berskala empat tingkat tanpa angka.

# Form Mitra memakai "Tidak Puas" sebagai tingkat TERENDAH (Tidak < Kurang <
# Puas < Sangat Puas), berbeda dengan form Dosen/Karyawan (Sangat Tidak Puas <
# Tidak Puas < ...). Bila sheet ternyata memuat "Sangat Tidak Puas", deteksi
# skala otomatis kembali memakai MAPPING_LIKERT_UMUM.
MAPPING_LIKERT_MITRA: dict[str, int] = {
    "Tidak Puas": 1,
    "Kurang Puas": 2,
    "Puas": 3,
    "Sangat Puas": 4,
    "Tidak Butuh": 1,
    "Kurang Butuh": 2,
    "Butuh": 3,
    "Sangat Butuh": 4,
    "Tidak Relevan": 1,
    "Kurang Relevan": 2,
    "Relevan": 3,
    "Sangat Relevan": 4,
    "Tidak Baik": 1,
    "Kurang Baik": 2,
    "Baik": 3,
    "Sangat Baik": 4,
}

# [perluasan] Komponen bila form Mitra memakai pertanyaan tunggal (bukan grid);
# diambil dari sheet tim "ItemKuisioner" (tab "Mitra KS").
KOMPONEN_MITRA_KS: dict[str, list[str]] = {
    "Komunikasi dan Koordinasi": ["komunikasi dan kecepatan respons", "kemudahan proses administrasi dan koordinasi"],
    "Pelaksanaan Kerja Sama": ["kesesuaian pelaksanaan kegiatan", "kompetensi dan profesionalisme"],
    "Kualitas Luaran": ["kualitas hasil atau luaran", "kualitas hasil"],
    "Manfaat dan Dampak": ["manfaat kerja sama", "menyelesaikan permasalahan", "kebutuhan nyata mitra"],
    "Relevansi Program": ["program pemerintah", "prioritas pembangunan"],
    "Keberlanjutan Kerja Sama": ["keberlanjutan", "pengembangan hasil kerja sama"],
    "Kepuasan Keseluruhan": ["secara keseluruhan"],
}

MITRA_KERJASAMA = KonfigurasiResponden(
    key="mitra_kerjasama",
    prefix_id="MKS",
    kolom_pii=("Nama Instansi",),
    kolom_profil=(
        "Timestamp",
        "Jenis Instansi",
        "Lama Kerja sama",
        "Bentuk kerja sama yang pernah dilakukan",
        "Apakah kerja sama ini didasarkan pada Memorandum of Understanding (MoU)?",
        "Apakah kerja sama ini memiliki Memorandum of Agreement (MoA) atau Perjanjian Kerja Sama (PKS)?",
    ),
    kolom_segmen="Jenis Instansi",
    pola_segmen=(
        r"jenis\s*(instansi|mitra|lembaga|organisasi|institusi)",
        r"(kategori|tipe|bentuk|sektor)\s*(instansi|mitra|lembaga|organisasi)",
        r"\bsektor\b",
    ),
    kolom_teks={
        "kelebihan": "Apa kelebihan atau yang perlu dipertahankan dari pihak kampus?",
        "kendala": "Apa kendala yang kamu alami saat bekerjasama dengan pihak kampus?",
        "perbaikan": "Apa hal utama yang perlu diperbaiki atau dikembangkan agar kerja sama berikutnya memberikan "
        "manfaat dan dampak yang lebih besar bagi mitra?",
    },
    kolom_kategori={"prioritas": "Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3)"},
    skala=None,  # empat tingkat berlabel; dikenali otomatis (lihat MAPPING_LIKERT_MITRA)
    mapping_likert=dict(MAPPING_LIKERT_MITRA),
    likert_tanpa_grid=True,
    aspek_pertanyaan=KOMPONEN_MITRA_KS,
    aspek_kata_kunci={
        "Komunikasi dan Koordinasi": ["komunikasi", "koordinasi", "respons", "respon", "responsif", "balas", "kontak",
                                      "cp", "informasi", "administrasi", "birokrasi", "surat", "mou", "moa", "pks",
                                      "jadwal", "timeline", "diskusi", "keterbukaan"],
        "Pelaksanaan Kerja sama": ["pelaksanaan", "kegiatan", "rencana", "kesepakatan", "dosen", "mahasiswa", "pengajar",
                                   "tenaga", "profesional", "kompetensi", "pendamping", "magang", "pelatihan",
                                   "seminar", "workshop", "penelitian", "riset", "kooperatif"],
        "Manfaat dan Dampak": ["manfaat", "bermanfaat", "dampak", "berdampak", "hasil", "luaran", "kualitas", "solusi",
                               "masalah", "problem", "kebutuhan", "membantu", "ilmu", "hilirisasi", "hiliriset"],
        "Keberlanjutan": ["lanjut", "lanjutan", "kelanjutan", "keberlanjutan", "berkelanjutan", "ke depan", "kedepan",
                          "jangka panjang", "tindak lanjut", "rutin", "kolaborasi", "diperluas"],
        "Relevansi Program": ["relevan", "relevansi", "program", "pemerintah", "prioritas", "pembangunan", "masyarakat",
                              "kurikulum", "sinkron", "sinkronisasi", "kesesuaian"],
        "Keseluruhan": ["keseluruhan", "secara umum", "puas"],
    },
    kata_pilihan={
        "Komunikasi dan Koordinasi": ["komunikasi", "koordinasi"],
        "Pelaksanaan Kerja sama": ["pelaksanaan"],
        "Manfaat dan Dampak": ["manfaat", "maanfaat", "dampak"],  # opsi form tertulis "Maanfaat dan dampak"
        "Keberlanjutan": ["keberlanjutan"],
        "Relevansi Program": ["relevansi"],
    },
)

MITRA_PENGADAAN = KonfigurasiResponden(
    key="mitra_pengadaan",
    prefix_id="MPB",
    kolom_pii=("Nama Instansi Mitra",),
    kolom_profil=(
        "Timestamp",
        "Jenis Mitra",
        "Metode pengadaan yang diikuti",
        "Sudah berapa lama menjadi mitra PENS?",
    ),
    kolom_segmen="Jenis Mitra",
    pola_segmen=(
        r"jenis\s*(penyedia|mitra|usaha|pengadaan|vendor|perusahaan|layanan)",
        r"(kategori|tipe|bidang)\s*(penyedia|mitra|usaha|vendor|perusahaan)",
        r"bidang\s*usaha",
    ),
    kolom_teks={
        "paling_memuaskan": "Apa hal yang paling memuaskan dari proses pengadaan di PENS?",
        "kendala": "Apa kendala utama yang Anda alami selama menjadi mitra pengadaan?",
        "saran_perbaikan": "Saran perbaikan apa yang ingin Anda sampaikan ke PENS?",
    },
    kolom_kategori={"prioritas": "Menurut Anda, aspek mana yang paling perlu ditingkatkan? (Maksimal 3 pilihan)"},
    skala=None,
    mapping_likert=dict(MAPPING_LIKERT_MITRA),
    likert_tanpa_grid=True,
    aspek_kata_kunci={
        "Proses Kerja Sama": ["persyaratan", "dokumen", "administrasi", "koordinasi", "evaluasi", "pengumuman",
                              "komunikasi", "responsif", "respon", "proses", "prosedur", "birokrasi", "transparan",
                              "berbelit", "tanggap", "cepat"],
        "Pelaksanaan": ["pelaksanaan", "kontrak", "panitia", "profesional", "kompeten", "pembayaran", "bayar",
                        "pencairan", "serah terima", "schedule", "jadwal", "tepat waktu"],
        "Hasil": ["hasil", "kualitas", "spesifikasi", "satuan barang"],
        "Dampak": ["manfaat", "dampak", "operasional", "usaha", "anggaran"],
        "Relevansi": ["kebutuhan", "unit pengguna", "sesuai kebutuhan", "relevan"],
        "Keberlanjutan": ["lanjut", "kembali", "rekanan", "partner", "kerja sama lagi", "kerjasama", "ke depan",
                          "kedepan", "proyek", "berlangsung"],
        "Keseluruhan": ["keseluruhan", "secara umum", "puas", "kredibilitas", "integritas"],
    },
    # Opsi prioritas form Mitra Pengadaan tidak bernama aspek; dipetakan ke aspek
    # grid yang paling dekat maknanya (silakan sesuaikan bila tim menetapkan lain).
    # "Pemanfaatan teknologi informasi" tidak punya padanan aspek (tidak terpetakan).
    kata_pilihan={
        "Proses Kerja Sama": ["kecepatan pelayanan", "komunikasi", "administrasi"],
        "Pelaksanaan": ["profesionalisme"],
        "Hasil": ["kualitas program"],
        "Keberlanjutan": ["tindak lanjut"],
    },
)

KONFIGURASI: dict[str, KonfigurasiResponden] = {
    k.key: k for k in (MAHASISWA, DOSEN, KARYAWAN, MITRA_KERJASAMA, MITRA_PENGADAAN)
}


def konfigurasi(key: str) -> KonfigurasiResponden:
    return KONFIGURASI[key]
