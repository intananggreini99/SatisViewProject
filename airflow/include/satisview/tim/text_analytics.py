"""Text analytics komentar — port ``text-analytics-mahasiswa.ipynb``.

1. preprocessing teks: case folding, cleaning, tokenisasi, normalisasi slang,
   stopword removal (Sastrawi + tambahan), stemming Sastrawi (sel 5-7)
2. kamus kata kunci per aspek, kata kunci di-stem (sel 9-11)
3. deteksi aspek per komentar — satu komentar bisa menyebut beberapa aspek (sel 13)
4. frekuensi & ranking aspek (sel 15), kata paling sering muncul (sel 19)
5. hasil: ``teks_bersih``, ``aspek_komentar``, ``frekuensi_aspek`` (sel 21)
"""

from __future__ import annotations

import logging
import re
from collections import Counter

import pandas as pd

log = logging.getLogger(__name__)

# ============================================================== sel 5 (persis)
stopword_tambahan = ["tolong", "mohon", "kak", "nya", "sih", "deh", "dong", "kok", "ya", "dll", "dsb"]

# kamus normalisasi kata tidak baku
kamus_slang = {
    "gak": "tidak", "ga": "tidak", "nggak": "tidak", "ngga": "tidak", "tdk": "tidak",
    "yg": "yang", "dgn": "dengan", "utk": "untuk", "krn": "karena", "karna": "karena",
    "udh": "sudah", "udah": "sudah", "sdh": "sudah", "blm": "belum", "bgt": "banget",
    "bs": "bisa", "jd": "jadi", "sm": "sama", "dr": "dari", "tp": "tapi", "aja": "saja",
    "mhs": "mahasiswa", "dsn": "dosen", "perpus": "perpustakaan",
}

_stemmer = None
_daftar_stopword: set[str] | None = None
cache_stem: dict[str, str] = {}


def _siapkan_sastrawi() -> None:
    """Stemmer & stopword Sastrawi dibuat sekali (pembuatannya ~1 detik)."""
    global _stemmer, _daftar_stopword
    if _stemmer is None:
        from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
        from Sastrawi.StopWordRemover.StopWordRemoverFactory import StopWordRemoverFactory

        _stemmer = StemmerFactory().create_stemmer()
        _daftar_stopword = set(StopWordRemoverFactory().get_stop_words() + stopword_tambahan)


def daftar_stopword() -> set[str]:
    _siapkan_sastrawi()
    return _daftar_stopword  # type: ignore[return-value]


def stem_kata(kata: str) -> str:
    # cache supaya kata yang sama tidak di-stem berulang (stemming Sastrawi lambat)
    if kata not in cache_stem:
        _siapkan_sastrawi()
        cache_stem[kata] = _stemmer.stem(kata)
    return cache_stem[kata]


def preprocessing_teks(teks) -> list[str]:
    stopword = daftar_stopword()
    # 1. case folding
    teks = str(teks).lower()

    # 2. cleaning
    teks = teks.replace("wi-fi", "wifi").replace("wi fi", "wifi")
    teks = re.sub(r"http\S+", " ", teks)
    teks = re.sub(r"[^a-z\s]", " ", teks)
    teks = re.sub(r"\s+", " ", teks).strip()

    # 3. tokenization
    kata_kata = teks.split()

    # 4. normalisasi
    kata_kata = [kamus_slang.get(k, k) for k in kata_kata]

    # 5. stopword removal
    kata_kata = [k for k in kata_kata if k not in stopword and len(k) > 1]

    # 6. stemming
    kata_kata = [stem_kata(k) for k in kata_kata]

    return kata_kata


# ====================================================================== sel 11
def bangun_aspek_frasa(aspek_kata_kunci: dict[str, list[str]]) -> dict[str, list[list[str]]]:
    # kata kunci di-stem supaya bentuknya sama dengan token komentar
    aspek_frasa = {}
    for aspek, daftar_kata in aspek_kata_kunci.items():
        daftar_frasa = []
        for kata_kunci in daftar_kata:
            token_kunci = [stem_kata(k) for k in kata_kunci.lower().split()]
            daftar_frasa.append(token_kunci)
        aspek_frasa[aspek] = daftar_frasa
    return aspek_frasa


def ada_frasa(token_komentar: list[str], token_frasa: list[str]) -> bool:
    n = len(token_frasa)
    for i in range(len(token_komentar) - n + 1):
        if token_komentar[i : i + n] == token_frasa:
            return True
    return False


def deteksi_aspek(token_komentar: list[str], aspek_frasa: dict[str, list[list[str]]]) -> list[str]:
    hasil = []
    for aspek, daftar_frasa in aspek_frasa.items():
        for frasa in daftar_frasa:
            if ada_frasa(token_komentar, frasa):
                hasil.append(aspek)
                break
    return hasil


# ============================================ [perluasan] kamus untuk aspek baru
_KATA_UMUM = {
    "layanan", "pelayanan", "fasilitas", "kampus", "pens", "proses", "bagian", "unit", "kegiatan", "sistem",
    "administrasi", "kerja", "sama", "secara", "terhadap", "dalam", "untuk", "dengan", "pihak", "bapak", "ibu",
}

# Kata kunci domain yang ditambahkan bila nama aspek cocok dengan pola (huruf kecil).
KAMUS_UMUM: tuple[tuple[str, tuple[str, ...]], ...] = (
    (r"keuangan|pembayaran|bayar", ("keuangan", "bayar", "pembayaran", "tagihan", "termin", "invoice", "pencairan", "dana")),
    (r"pengadaan|kontrak|tender|penyedia", ("pengadaan", "tender", "lelang", "lpse", "kontrak", "spk", "penawaran", "vendor", "penyedia", "katalog")),
    (r"kerja\s*sama|kemitraan|mitra", ("kerja sama", "kerjasama", "mou", "moa", "pks", "perjanjian", "kemitraan", "mitra")),
    (r"komunikasi|koordinasi|informasi", ("komunikasi", "koordinasi", "informasi", "respon", "responsif", "hubung", "kontak")),
    (r"administrasi|dokumen|persyaratan", ("administrasi", "dokumen", "persyaratan", "berkas", "surat", "birokrasi")),
    (r"waktu|jadwal|kecepatan", ("waktu", "jadwal", "cepat", "lambat", "terlambat", "tepat waktu")),
    (r"tik|sistem informasi|teknologi", ("wifi", "internet", "jaringan", "aplikasi", "website", "sistem informasi")),
)


def lengkapi_kata_kunci(
    aspek_kata_kunci: dict[str, list[str]],
    aspek_kamus: list[str],
    df_kamus: pd.DataFrame | None = None,
) -> tuple[dict[str, list[str]], list[str]]:
    """Kamus efektif = kamus tim untuk aspek yang ada di kamus item.

    Notebook tim mengecek kecocokan nama aspek kamus vs dictionary dan meminta
    dictionary dilengkapi manual. Di pipeline, aspek yang belum punya kata
    kunci dibuatkan otomatis dari nama aspek & butir pertanyaannya, dan
    peringatannya dicatat.
    """
    peringatan: list[str] = []
    for aspek in aspek_kata_kunci:
        if aspek not in aspek_kamus:
            peringatan.append(f"Nama aspek tidak cocok dengan kamus: {aspek}")
    efektif: dict[str, list[str]] = {}
    for aspek in aspek_kamus:
        if aspek in aspek_kata_kunci:
            efektif[aspek] = list(aspek_kata_kunci[aspek])
            continue
        peringatan.append(f"Aspek di kamus belum ada di dictionary (kata kunci dibuat otomatis): {aspek}")
        efektif[aspek] = kata_kunci_otomatis(aspek, df_kamus)
    return efektif, peringatan


def kata_kunci_otomatis(aspek: str, df_kamus: pd.DataFrame | None = None) -> list[str]:
    nama = re.sub(r"[^a-z\s]", " ", aspek.lower())
    token = [t for t in nama.split() if len(t) >= 3]
    kata = [" ".join(token)] if token else []
    kata += [t for t in token if t not in _KATA_UMUM and len(t) >= 4]
    for i in range(len(token) - 1):
        kata.append(f"{token[i]} {token[i + 1]}")
    for pola, tambahan in KAMUS_UMUM:
        if re.search(pola, aspek.lower()):
            kata += list(tambahan)
    if df_kamus is not None and len(df_kamus):
        # kata khas butir pertanyaan aspek ini (tidak muncul di butir aspek lain)
        lain = " ".join(df_kamus.loc[df_kamus["aspek"] != aspek, "pertanyaan"].astype(str)).lower()
        milik = " ".join(df_kamus.loc[df_kamus["aspek"] == aspek, "pertanyaan"].astype(str)).lower()
        stop = daftar_stopword() | _KATA_UMUM
        for t in re.sub(r"[^a-z\s]", " ", milik).split():
            if len(t) >= 5 and t not in stop and t not in lain:
                kata.append(t)
    return list(dict.fromkeys(k for k in kata if k.strip()))


# ================================================================ sel 7, 13-21
def proses_komentar(df_teks: pd.DataFrame, aspek_frasa: dict[str, list[list[str]]]) -> pd.DataFrame:
    """Tambahkan kolom ``token``, ``teks_bersih``, ``aspek`` (list) — sel 7 & 13."""
    df = df_teks.dropna(subset=["teks_komentar"]).reset_index(drop=True).copy()
    df["token"] = df["teks_komentar"].apply(preprocessing_teks)
    df["teks_bersih"] = df["token"].apply(lambda t: " ".join(t))
    df["aspek"] = df["token"].apply(lambda t: deteksi_aspek(t, aspek_frasa))
    return df


def hitung_frekuensi(df_teks: pd.DataFrame, daftar_aspek: list[str]) -> pd.DataFrame:
    """Frekuensi & ranking aspek (sel 15). Satu komentar dihitung satu kali per aspek."""
    jumlah_komentar = len(df_teks)
    hitung: Counter = Counter()
    for daftar in df_teks["aspek"]:
        for aspek in daftar:
            hitung[aspek] += 1

    tabel = []
    for aspek in daftar_aspek:
        tabel.append({"aspek": aspek, "frekuensi": hitung[aspek]})

    df_frekuensi = pd.DataFrame(tabel, columns=["aspek", "frekuensi"])
    if jumlah_komentar:
        df_frekuensi["persen_komentar"] = (df_frekuensi["frekuensi"] / jumlah_komentar * 100).round(1)
    else:  # [perluasan] tanpa komentar: hindari pembagian dengan nol
        df_frekuensi["persen_komentar"] = 0.0
    df_frekuensi = df_frekuensi.sort_values("frekuensi", ascending=False).reset_index(drop=True)
    df_frekuensi["ranking"] = df_frekuensi.index + 1
    return df_frekuensi


def kata_teratas(df_teks: pd.DataFrame, n: int = 30) -> pd.DataFrame:
    """Kata yang paling sering muncul (sel 19)."""
    semua_token: list[str] = []
    for token in df_teks["token"]:
        semua_token.extend(token)
    return pd.DataFrame(Counter(semua_token).most_common(n), columns=["kata", "frekuensi"])


def tabel_teks_bersih(df_teks: pd.DataFrame) -> pd.DataFrame:
    """File 1 sel 21: teks bersih + aspek per komentar (aspek digabung '; ')."""
    df_simpan = df_teks[["response_id", "teks_komentar", "teks_bersih"]].copy()
    df_simpan["aspek"] = df_teks["aspek"].apply(lambda a: "; ".join(a))
    return df_simpan


def tabel_aspek_komentar(df_teks: pd.DataFrame) -> pd.DataFrame:
    """File 2 sel 21: format long, satu baris per (komentar, aspek)."""
    baris_long = []
    for _, baris in df_teks.iterrows():
        for aspek in baris["aspek"]:
            baris_long.append({"response_id": baris["response_id"], "aspek": aspek})
    return pd.DataFrame(baris_long, columns=["response_id", "aspek"])
