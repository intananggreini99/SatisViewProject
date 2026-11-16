"""Preprocessing data survei kepuasan — port ``preprocssing-mahasiswa-finalpakeygini.ipynb``.

Alur sama persis dengan notebook tim:

1. normalisasi spasi judul kolom (sel 2)
2. ``response_id`` (``MHS_0001``, ...) + buang kolom PII (sel 3)
3. pisahkan kolom Likert utama & bagian bersyarat/klinik (sel 4)
4. konversi jawaban ke skor (``ambil_skor``) + ``cek_konversi`` (sel 5)
5. kamus item -> aspek (sel 6)
6. skor aspek per responden (sel 7)
7. ringkasan per item & per aspek (sel 8)
8. teks terbuka (sel 9) dan pilihan kategori/prioritas (sel 10)
9. 8 file CSV (sel 11)

Hasilnya dict ``{nama_logis: DataFrame}``; nama file CSV mengikuti notebook
(``likert_mahasiswa_utama_clean.csv`` dst., lihat ``NAMA_FILE``).
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from .konfigurasi import MAPPING_LIKERT_5, MAPPING_LIKERT_UMUM, KonfigurasiResponden

log = logging.getLogger(__name__)

TIDAK_TERDETEKSI = "TIDAK TERDETEKSI"

# Nama file hasil preprocessing (sel 11 notebook), {r} = kunci responden.
NAMA_FILE: dict[str, str] = {
    "likert_utama": "likert_{r}_utama_clean",
    "likert_bersyarat": "likert_{r}_{b}_clean",
    "teks": "teks_{r}_clean",
    "kategori": "kategori_{r}_clean",
    "kamus": "kamus_item_aspek_{r}",
    "skor_aspek": "skor_aspek_{r}",
    "ringkasan_item": "ringkasan_item_{r}",
    "ringkasan_aspek": "ringkasan_aspek_{r}",
}


def nama_file(logis: str, cfg: KonfigurasiResponden) -> str:
    bersyarat = cfg.bagian_bersyarat.nama if cfg.bagian_bersyarat else "bersyarat"
    return NAMA_FILE[logis].format(r=cfg.key, b=bersyarat)


# =================================================================== sel 2-3
def normalisasi_judul(teks: Any) -> str:
    """``re.sub(r"\\s+", " ", str(k)).strip()`` — sama dengan sel 2."""
    return re.sub(r"\s+", " ", str(teks)).strip()


# ===================================================================== sel 5
def _normalisasi_label(nilai: Any) -> str | None:
    if nilai is None or (isinstance(nilai, float) and np.isnan(nilai)):
        return None
    return re.sub(r"\s+", " ", str(nilai)).strip().lower()


def ambil_skor(seri: pd.Series, mapping_label: dict[str, int] | None = None) -> pd.Series:
    """Ambil angka di awal jawaban, mis. ``"4 - Sangat Baik"`` -> 4 (kode tim).

    [perluasan] Form Dosen/Karyawan memakai label tanpa angka
    (``"Sangat Puas"``); label itu dipetakan lewat ``mapping_label``.
    Untuk jawaban berangka (form Mahasiswa) hasilnya identik dengan notebook.
    """
    hasil = seri.astype(str).str.extract(r"^\s*(\d+)")[0]
    skor = pd.to_numeric(hasil, errors="coerce")
    if mapping_label and skor.isna().any():
        kamus = {_normalisasi_label(k): v for k, v in mapping_label.items()}
        dari_label = seri.map(lambda v: kamus.get(_normalisasi_label(v)))
        skor = skor.fillna(pd.to_numeric(dari_label, errors="coerce"))
    return skor


def cek_konversi(df_asli: pd.DataFrame, df_bersih: pd.DataFrame, kolom: list[str], skala: tuple[int, int], nama: str) -> dict:
    """Hitungan yang sama dengan ``cek_konversi`` notebook, dikembalikan sebagai dict.

    Notebook mencetak ``PERINGATAN`` bila ada nilai gagal konversi / di luar
    skala; di pipeline angka ini diperiksa oleh task ``validation_preprocessing``.
    """
    if not kolom:
        return {"nama": nama, "terisi_asli": 0, "setelah_konversi": 0, "di_luar_skala": 0, "contoh_gagal": {}}
    sel_asli = int(df_asli[kolom].notna().sum().sum())
    sel_bersih = int(df_bersih[kolom].notna().sum().sum())
    di_luar = int(((df_bersih[kolom] < skala[0]) | (df_bersih[kolom] > skala[1])).sum().sum())
    gagal: dict[str, int] = {}
    if sel_asli != sel_bersih:
        asli = df_asli[kolom]
        bersih = df_bersih[kolom].reindex(df_asli.index)
        nilai = asli.where(asli.notna() & bersih.isna()).stack().astype(str).value_counts().head(10)
        gagal = {str(k): int(v) for k, v in nilai.items()}
    if sel_asli != sel_bersih or di_luar > 0:
        log.warning("%s | terisi asli: %s | setelah konversi: %s | di luar skala: %s", nama, sel_asli, sel_bersih, di_luar)
    return {
        "nama": nama,
        "terisi_asli": sel_asli,
        "setelah_konversi": sel_bersih,
        "di_luar_skala": di_luar,
        "contoh_gagal": gagal,
    }


# ===================================================================== sel 6
_POLA_ASPEK = r"terhadap\s+(?:layanan|fasilitas)?\s*(?:dan\s+layanan\s+)?(.+?)\s*\?"


def ekstrak_aspek(nama_kolom: str) -> str:
    """Nama aspek dari judul grid Likert (kode tim).

    Form Mahasiswa: ``"Bagaimana penilaian Anda terhadap layanan Administrasi
    Akademik berikut? [..]"`` -> ``"Administrasi Akademik"`` (regex tim).

    [perluasan] Regex hanya dicari di judul grid (sebelum ``[``) dan bila
    tidak cocok judul itu sendiri dipakai, sehingga format form Dosen/Karyawan
    ``"Administrasi Akademik [Seberapa puas ...?]"`` -> ``"Administrasi Akademik"``.
    Pada form Mahasiswa kata "terhadap" & "?" pertama selalu ada di judul,
    jadi hasilnya sama dengan notebook.
    """
    judul = nama_kolom.split("[", 1)[0]
    m = re.search(_POLA_ASPEK, judul)
    if m:
        aspek = m.group(1).strip()
    else:
        aspek = judul.strip() or TIDAK_TERDETEKSI
    return aspek.replace(" berikut", "").strip()


def ekstrak_pertanyaan(nama_kolom: str) -> str:
    m = re.search(r"\[(.+?)\]", nama_kolom)
    return m.group(1).strip() if m else nama_kolom


def bangun_kamus(kolom_list: list[str], prefix: str) -> pd.DataFrame:
    kamus = []
    for i, kolom in enumerate(kolom_list, start=1):
        kamus.append(
            {
                "item_kode": f"{prefix}_{str(i).zfill(2)}",
                "pertanyaan": ekstrak_pertanyaan(kolom),
                "aspek": ekstrak_aspek(kolom),
                "nama_kolom_asli": kolom,
            }
        )
    return pd.DataFrame(kamus, columns=["item_kode", "pertanyaan", "aspek", "nama_kolom_asli"])


# ===================================================================== sel 7
def hitung_skor_aspek_per_responden(df_likert: pd.DataFrame, df_kamus_subset: pd.DataFrame) -> pd.DataFrame:
    hasil = pd.DataFrame()
    hasil["response_id"] = df_likert["response_id"]
    for aspek in df_kamus_subset["aspek"].unique():
        kolom_aspek = df_kamus_subset[df_kamus_subset["aspek"] == aspek]["nama_kolom_asli"].tolist()
        kolom_ada = [k for k in kolom_aspek if k in df_likert.columns]
        hasil[aspek] = df_likert[kolom_ada].mean(axis=1).round(2)
    return hasil


# ===================================================================== sel 8
def ringkasan_item(df_likert: pd.DataFrame, df_kamus_subset: pd.DataFrame) -> pd.DataFrame:
    ringkasan = []
    for _, baris in df_kamus_subset.iterrows():
        kolom = baris["nama_kolom_asli"]
        if kolom in df_likert.columns:
            skor = df_likert[kolom]
            ringkasan.append(
                {
                    "item_kode": baris["item_kode"],
                    "pertanyaan": baris["pertanyaan"],
                    "aspek": baris["aspek"],
                    "rata_rata": round(skor.mean(), 2),
                    "n_responden": int(skor.notna().sum()),
                }
            )
    return pd.DataFrame(ringkasan, columns=["item_kode", "pertanyaan", "aspek", "rata_rata", "n_responden"])


def ringkasan_aspek(df_ringkasan_item: pd.DataFrame) -> pd.DataFrame:
    """Bagian kedua sel 8: rata-rata item per aspek, diurutkan naik."""
    return (
        df_ringkasan_item.groupby("aspek")
        .agg(rata_rata=("rata_rata", "mean"), jumlah_item=("item_kode", "count"))
        .round(2)
        .reset_index()
        .sort_values("rata_rata")
    )


# ======================================================= deteksi kolom (baru)
POLA_PII = re.compile(
    r"\b(nama|e-?mail|surel|nim|nrp|nip|nidn|nik|npwp|alamat|telepon|telp|whatsapp|wa|hp|handphone|"
    r"kontak|gopay|ovo|e-?wallet|rekening|tanda\s*tangan)\b",
    re.IGNORECASE,
)
POLA_KATEGORI = re.compile(r"(paling\s+perlu\s+(di)?tingkatkan|prioritas\s+(peningkatan|perbaikan))", re.IGNORECASE)
POLA_TEKS = re.compile(
    r"(saran|komentar|kritik|masukan|jelaskan|harapan|pesan|pendapat|usulan|keluhan|ceritakan|tuliskan|perlu\s+diperbaiki)",
    re.IGNORECASE,
)
POLA_WAKTU = re.compile(r"^(timestamp|stempel waktu|cap waktu|waktu|tanggal|tanggal pengisian)$", re.IGNORECASE)

# [perluasan] Pengenal jawaban skala Likert untuk pertanyaan tunggal (bukan grid).
_KATA_LIKERT = {_k.lower() for _k in MAPPING_LIKERT_5} | {"tidak baik", "sangat tidak baik"}
_POLA_ANGKA_LIKERT = re.compile(r"^\s*(\d{1,2})\s*(?:[-–.):]\s*(.*))?$")
_POLA_LABEL_TENGAH = re.compile(r"^(cukup|netral|biasa|ragu)", re.IGNORECASE)


def _jawaban_likert(nilai: str) -> bool:
    """Angka 0-10 (opsional diikuti label skala, mis. "4 - Sangat Baik") atau label skala."""
    teks = re.sub(r"\s+", " ", str(nilai)).strip()
    m = _POLA_ANGKA_LIKERT.match(teks)
    if m:
        label = (m.group(2) or "").strip().lower()
        return int(m.group(1)) <= 10 and (label == "" or label in _KATA_LIKERT)
    return teks.lower() in _KATA_LIKERT


_POLA_JUDUL_PENILAIAN = re.compile(r"(puas|kepuasan|penilaian|menilai|setuju|kualitas|seberapa baik)", re.IGNORECASE)


def kolom_likert_tunggal(df: pd.DataFrame, kolom: str) -> bool:
    """[perluasan] Pertanyaan tunggal berskala: >= 90% jawaban terisi adalah skala Likert.

    Jawaban angka polos (skala linier Google Form) hanya diterima bila judulnya
    pertanyaan penilaian/kepuasan, agar kolom seperti "jumlah proyek" tidak ikut.
    """
    nilai = df[kolom].dropna().astype(str).str.strip()
    nilai = nilai[nilai != ""]
    if len(nilai) == 0 or nilai.nunique() > 11:
        return False
    if nilai.map(_jawaban_likert).mean() < 0.9:
        return False
    angka_polos = nilai.str.fullmatch(r"\d{1,2}").mean() >= 0.9
    return not angka_polos or bool(_POLA_JUDUL_PENILAIAN.search(kolom))


_LABEL_SANGAT_TIDAK = {"sangat tidak puas", "sangat tidak baik", "sangat tidak setuju"}


def deteksi_skala(df: pd.DataFrame, kolom: list[str], cfg: KonfigurasiResponden) -> tuple[tuple[int, int], dict[str, int]]:
    """[perluasan] Skala & pemetaan label untuk kelompok berskala otomatis (``cfg.skala = None``).

    Jawaban berangka memakai angka terbesar yang muncul (1-4, 1-5, 1-7, 1-10);
    jawaban berlabel dengan label tengah ("Cukup", "Netral") = skala 1-5.
    Kelompok dengan skala tetap (Mahasiswa, Dosen, Karyawan) tidak berubah.
    """
    if cfg.skala is not None:
        return tuple(cfg.skala), cfg.mapping_likert
    nilai = df[kolom].stack().dropna().astype(str).str.strip() if kolom else pd.Series(dtype=str)
    nilai = nilai[nilai != ""]
    angka = pd.to_numeric(nilai.str.extract(r"^\s*(\d+)")[0], errors="coerce").dropna()
    label = nilai[~nilai.str.match(r"^\s*\d")]
    lima_tingkat = any(_POLA_LABEL_TENGAH.match(_normalisasi_label(v) or "") for v in label.unique())
    mapping = dict(MAPPING_LIKERT_5) if lima_tingkat else dict(cfg.mapping_likert)
    if not lima_tingkat and any(_normalisasi_label(v) in _LABEL_SANGAT_TIDAK for v in label.unique()):
        # empat tingkat bergaya "Sangat Tidak ... < Tidak ... < ..." (seperti form Dosen/Karyawan)
        mapping.update(MAPPING_LIKERT_UMUM)
    maks = max(int(angka.max()) if len(angka) else 0, 5 if lima_tingkat else 4)
    maks = next(batas for batas in (4, 5, 7, 10) if maks <= batas) if maks <= 10 else int(maks)
    minimum = 0 if len(angka) and int(angka.min()) == 0 else 1
    return (minimum, maks), mapping


def aspek_pertanyaan_tunggal(judul: str, cfg: KonfigurasiResponden) -> str:
    """[perluasan] Aspek untuk pertanyaan tunggal: kamus ``aspek_pertanyaan`` lalu isi pertanyaan."""
    teks = normalisasi_judul(judul).lower()
    for aspek, frasa in cfg.aspek_pertanyaan.items():
        if any(f.lower() in teks for f in frasa):
            return aspek
    m = re.search(r"terhadap\s+(.+?)\s*\??$", normalisasi_judul(judul), flags=re.IGNORECASE)
    inti = (m.group(1) if m else normalisasi_judul(judul)).rstrip("?").strip()
    return (inti[:1].upper() + inti[1:]) if inti else TIDAK_TERDETEKSI


@dataclass
class KolomTerdeteksi:
    likert_utama: list[str] = field(default_factory=list)
    likert_bersyarat: list[str] = field(default_factory=list)
    profil: list[str] = field(default_factory=list)
    segmen: str | None = None
    pii: list[str] = field(default_factory=list)
    teks: dict[str, str] = field(default_factory=dict)
    kategori: dict[str, str] = field(default_factory=dict)
    gating: str | None = None
    diabaikan: list[str] = field(default_factory=list)
    tidak_ditemukan: list[str] = field(default_factory=list)
    cara_deteksi: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


def _cari(kolom_df: list[str], judul: str) -> str | None:
    target = normalisasi_judul(judul).lower()
    for k in kolom_df:
        if k.lower() == target:
            return k
    return None


def tentukan_kolom(df: pd.DataFrame, cfg: KonfigurasiResponden) -> KolomTerdeteksi:
    """[perluasan] Tentukan peran kolom untuk kelompok mana pun.

    Kolom yang disebut di konfigurasi dicari persis (setelah normalisasi spasi,
    tanpa beda huruf besar/kecil). Yang tidak disebut (sheet Mitra) dideteksi
    dari judul kolom: Likert = mengandung ``[...]`` (aturan tim), kategori =
    "paling perlu ditingkatkan", teks = saran/komentar/jelaskan, PII = nama,
    email, nomor HP/Gopay, dst.
    """
    hasil = KolomTerdeteksi()
    kolom = list(df.columns)

    likert_semua = [k for k in kolom if "[" in k and "]" in k]
    if cfg.bagian_bersyarat:
        kunci = cfg.bagian_bersyarat.kata_kunci.lower()
        hasil.likert_bersyarat = [k for k in likert_semua if kunci in k.lower()]
    hasil.likert_utama = [k for k in likert_semua if k not in hasil.likert_bersyarat]
    sisa = [k for k in kolom if k not in likert_semua]

    def ambil(judul: str, peran: str) -> str | None:
        ketemu = _cari(sisa, judul)
        if ketemu is None:
            hasil.tidak_ditemukan.append(f"{peran}: {normalisasi_judul(judul)}")
        return ketemu

    # Kategori / pilihan prioritas
    for nama, judul in cfg.kolom_kategori.items():
        k = ambil(judul, "kategori")
        if k:
            hasil.kategori[nama] = k
            hasil.cara_deteksi[k] = "konfigurasi"
    if not cfg.kolom_kategori:
        for i, k in enumerate([k for k in sisa if POLA_KATEGORI.search(k)], start=1):
            nama = "prioritas" if i == 1 else f"prioritas_{i}"
            hasil.kategori[nama] = k
            hasil.cara_deteksi[k] = "otomatis"

    # Teks terbuka dari konfigurasi
    for nama, judul in cfg.kolom_teks.items():
        k = ambil(judul, "teks")
        if k:
            hasil.teks[nama] = k
            hasil.cara_deteksi[k] = "konfigurasi"
    terpakai = set(hasil.kategori.values()) | set(hasil.teks.values())

    # PII (dicek sebelum deteksi teks otomatis agar alamat/email tidak dianggap komentar)
    for judul in cfg.kolom_pii:
        k = _cari(sisa, judul)
        if k:
            hasil.pii.append(k)
    for k in sisa:
        if k in terpakai or k in hasil.pii or len(k) > 60:
            continue
        if POLA_PII.search(k) or re.search(r"\bnomor\b|\bno\.?\s*(hp|telp|wa)\b", k, re.IGNORECASE):
            hasil.pii.append(k)
            hasil.cara_deteksi[k] = "PII otomatis"
    terpakai |= set(hasil.pii)

    # Teks terbuka otomatis (kelompok yang strukturnya belum diketahui)
    if not cfg.kolom_teks:
        n = 0
        for k in sisa:
            if k in terpakai or POLA_WAKTU.match(k):
                continue
            nilai = df[k].dropna().astype(str).str.strip()
            nilai = nilai[nilai != ""]
            panjang = nilai.str.len().mean() if len(nilai) else 0
            unik = nilai.nunique() / len(nilai) if len(nilai) else 0
            judul_teks = bool(POLA_TEKS.search(k)) and (len(k) > 25 or panjang >= 15)
            isi_teks = panjang >= 25 and unik >= 0.6
            if judul_teks or isi_teks:
                n += 1
                nama = "saran_perbaikan" if n == 1 and re.search(r"perbaik|saran", k, re.I) else f"teks_{n}"
                hasil.teks[nama] = k
                hasil.cara_deteksi[k] = "otomatis"
        terpakai |= set(hasil.teks.values())

    # [perluasan] Pertanyaan tunggal berskala Likert (form tanpa grid)
    if cfg.likert_tanpa_grid:
        for k in sisa:
            if k in terpakai or POLA_WAKTU.match(k) or k == cfg.kolom_segmen:
                continue
            if kolom_likert_tunggal(df, k):
                hasil.likert_utama.append(k)
                hasil.cara_deteksi[k] = "likert (pertanyaan tunggal)"
        terpakai |= set(hasil.likert_utama)

    # Kolom gating bagian bersyarat (KOLOM_GATING_KLINIK)
    if cfg.bagian_bersyarat and cfg.bagian_bersyarat.kolom_gating:
        hasil.gating = ambil(cfg.bagian_bersyarat.kolom_gating, "gating")
        if hasil.gating:
            terpakai.add(hasil.gating)

    # Profil (KOLOM_PROFIL)
    for judul in cfg.kolom_profil:
        k = _cari(sisa, judul)
        if k and k not in terpakai:
            hasil.profil.append(k)
        elif k is None and cfg.kolom_teks:  # hanya dilaporkan untuk kelompok yang strukturnya diketahui
            hasil.tidak_ditemukan.append(f"profil: {judul}")
    if not cfg.kolom_profil or cfg.kolom_profil == ("Timestamp",):
        for k in sisa:
            if POLA_WAKTU.match(k) and k not in hasil.profil:
                hasil.profil.insert(0, k)

    # Segmen (filter dashboard): kolom konfigurasi -> pola regex -> kolom kategorikal pertama
    kandidat = [k for k in sisa if k not in terpakai and not POLA_WAKTU.match(k)]
    if cfg.kolom_segmen:
        k = _cari(sisa, cfg.kolom_segmen)
        if k:
            hasil.segmen = k
    if hasil.segmen is None:
        for pola in cfg.pola_segmen:
            cocok = [k for k in kandidat if re.search(pola, k, re.IGNORECASE)]
            if cocok:
                hasil.segmen = cocok[0]
                hasil.cara_deteksi[cocok[0]] = "segmen (pola)"
                break
    if hasil.segmen is None and len(df):
        for k in kandidat:
            nilai = df[k].dropna().astype(str).str.strip()
            if len(nilai) and 2 <= nilai.nunique() <= 60 and nilai.str.len().mean() < 60:
                hasil.segmen = k
                hasil.cara_deteksi[k] = "segmen (otomatis)"
                break
    if hasil.segmen and hasil.segmen not in hasil.profil:
        hasil.profil.append(hasil.segmen)

    hasil.diabaikan = [k for k in sisa if k not in terpakai and k not in hasil.profil]
    return hasil


# ============================================================ alur lengkap
def jalankan_preprocessing(df_raw: pd.DataFrame, cfg: KonfigurasiResponden) -> tuple[dict[str, pd.DataFrame], dict]:
    """Jalankan seluruh sel notebook preprocessing untuk satu kelompok responden."""
    # sel 2: normalisasi spasi judul kolom
    df_raw = df_raw.copy()
    df_raw.columns = [normalisasi_judul(k) for k in df_raw.columns]
    kolom = tentukan_kolom(df_raw, cfg)
    # Mahasiswa/Dosen/Karyawan: skala tetap 1-4 (notebook tim); Mitra: dikenali dari jawaban
    skala, mapping_likert = deteksi_skala(df_raw, kolom.likert_utama + kolom.likert_bersyarat, cfg)

    # sel 3: response_id + buang PII
    df = df_raw.copy()
    df.insert(0, "response_id", [f"{cfg.prefix_id}_" + str(i + 1).zfill(4) for i in range(len(df))])
    kolom_pii_ada = [k for k in kolom.pii if k in df.columns]
    df = df.drop(columns=kolom_pii_ada)
    log.info("[%s] Kolom PII dibuang: %s", cfg.key, kolom_pii_ada)

    # sel 4: kolom likert utama & bersyarat
    kolom_likert_utama = kolom.likert_utama
    kolom_bersyarat = kolom.likert_bersyarat
    log.info("[%s] Likert utama: %s item | bersyarat: %s item", cfg.key, len(kolom_likert_utama), len(kolom_bersyarat))

    # sel 5: konversi skor
    df_likert_utama = df[["response_id"] + kolom.profil + kolom_likert_utama].copy()
    for k in kolom_likert_utama:
        df_likert_utama[k] = ambil_skor(df_likert_utama[k], mapping_likert)
    cek = [cek_konversi(df, df_likert_utama, kolom_likert_utama, skala, "Likert Utama")]

    tabel: dict[str, pd.DataFrame] = {"likert_utama": df_likert_utama}
    df_likert_bersyarat = None
    if cfg.bagian_bersyarat:
        df_likert_bersyarat = df[["response_id"] + kolom_bersyarat].copy()
        for k in kolom_bersyarat:
            df_likert_bersyarat[k] = ambil_skor(df_likert_bersyarat[k], mapping_likert)
        if kolom_bersyarat:
            df_likert_bersyarat = df_likert_bersyarat.dropna(subset=kolom_bersyarat, how="all")
        else:
            df_likert_bersyarat = df_likert_bersyarat.iloc[0:0]
        cek.append(cek_konversi(df, df_likert_bersyarat, kolom_bersyarat, skala, f"Likert {cfg.bagian_bersyarat.aspek}"))
        tabel["likert_bersyarat"] = df_likert_bersyarat

    # sel 6: kamus item -> aspek
    df_kamus_utama = bangun_kamus(kolom_likert_utama, "ITEM")
    tunggal = ~df_kamus_utama["nama_kolom_asli"].str.contains(r"\[", regex=True)
    if cfg.likert_tanpa_grid and tunggal.any():  # [perluasan] aspek pertanyaan tunggal
        df_kamus_utama.loc[tunggal, "aspek"] = df_kamus_utama.loc[tunggal, "nama_kolom_asli"].map(
            lambda judul: aspek_pertanyaan_tunggal(judul, cfg)
        )
    df_kamus = df_kamus_utama
    df_kamus_bersyarat = None
    if cfg.bagian_bersyarat:
        df_kamus_bersyarat = bangun_kamus(kolom_bersyarat, cfg.bagian_bersyarat.prefix_item)
        df_kamus_bersyarat["aspek"] = cfg.bagian_bersyarat.aspek  # samakan label, semua item satu aspek
        df_kamus = pd.concat([df_kamus_utama, df_kamus_bersyarat], ignore_index=True)
    tabel["kamus"] = df_kamus

    # sel 7: skor aspek per responden
    df_skor_aspek = hitung_skor_aspek_per_responden(df_likert_utama, df_kamus_utama)
    if df_likert_bersyarat is not None and len(df_kamus_bersyarat):
        df_skor_bersyarat = hitung_skor_aspek_per_responden(df_likert_bersyarat, df_kamus_bersyarat)
        df_skor_aspek = df_skor_aspek.merge(df_skor_bersyarat, on="response_id", how="left")
    tabel["skor_aspek"] = df_skor_aspek

    # sel 8: ringkasan item & aspek
    df_ringkasan_item = ringkasan_item(df_likert_utama, df_kamus_utama)
    if df_likert_bersyarat is not None and len(df_kamus_bersyarat):
        df_ringkasan_item = pd.concat(
            [df_ringkasan_item, ringkasan_item(df_likert_bersyarat, df_kamus_bersyarat)], ignore_index=True
        )
    tabel["ringkasan_item"] = df_ringkasan_item
    tabel["ringkasan_aspek"] = ringkasan_aspek(df_ringkasan_item)

    # sel 9: teks terbuka
    df_teks_list = []
    for nama, k in kolom.teks.items():
        temp = df[["response_id", k]].copy()
        temp.columns = ["response_id", "teks_komentar"]
        temp["jenis_pertanyaan"] = nama
        df_teks_list.append(temp[["response_id", "jenis_pertanyaan", "teks_komentar"]])
    if df_teks_list:
        df_teks = pd.concat(df_teks_list, ignore_index=True)
        df_teks = df_teks.dropna(subset=["teks_komentar"])
        df_teks = df_teks[df_teks["teks_komentar"].astype(str).str.strip() != ""]
    else:
        df_teks = pd.DataFrame(columns=["response_id", "jenis_pertanyaan", "teks_komentar"])
    tabel["teks"] = df_teks

    # sel 10: kategori (pilihan prioritas, dipisah koma)
    df_kategori_list = []
    for nama, k in kolom.kategori.items():
        if k in df.columns:
            temp = df[["response_id", k]].dropna().copy()
            temp["pilihan"] = temp[k].astype(str).str.split(",")
            temp = temp.explode("pilihan")
            temp["pilihan"] = temp["pilihan"].str.strip()
            temp["jenis_pertanyaan"] = nama
            df_kategori_list.append(temp[["response_id", "jenis_pertanyaan", "pilihan"]])
    if df_kategori_list:
        df_kategori = pd.concat(df_kategori_list, ignore_index=True)
    else:
        df_kategori = pd.DataFrame(columns=["response_id", "jenis_pertanyaan", "pilihan"])
    tabel["kategori"] = df_kategori

    aspek_list = list(dict.fromkeys(df_kamus["aspek"].tolist()))
    meta = {
        "versi_meta": 2,
        "responden": cfg.key,
        "prefix_id": cfg.prefix_id,
        "skala": {"min": skala[0], "maks": skala[1]},
        "n_responden": int(len(df)),
        "n_baris_mentah": int(len(df_raw)),
        "kolom": kolom.to_dict(),
        "kolom_pii_dibuang": kolom_pii_ada,
        "bagian_bersyarat": asdict(cfg.bagian_bersyarat) if cfg.bagian_bersyarat else None,
        "aspek": aspek_list,
        "aspek_bersyarat": [cfg.bagian_bersyarat.aspek] if cfg.bagian_bersyarat and kolom_bersyarat else [],
        "cek_konversi": cek,
        "jumlah_teks": int(len(df_teks)),
        "jumlah_pilihan_kategori": int(len(df_kategori)),
        "file": {logis: nama_file(logis, cfg) for logis in tabel},
    }
    log.info(
        "[%s] preprocessing selesai: %s responden, %s aspek, %s teks, %s pilihan kategori",
        cfg.key, len(df), len(aspek_list), len(df_teks), len(df_kategori),
    )
    return tabel, meta
