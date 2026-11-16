"""Priority analysis — port ``priority-analysis-mahasiswa.ipynb``.

Skor prioritas perbaikan tiap aspek menggabungkan tiga sumber data:

* skor kepuasan rata-rata (``ringkasan_aspek``) — makin rendah makin prioritas
* % responden yang memilih aspek pada pertanyaan "paling perlu ditingkatkan"
* frekuensi aspek disebut dalam komentar (hasil text analytics)

Masing-masing dinormalisasi min-max lalu dibobot 1/3, diurutkan menjadi
ranking, dikelompokkan menjadi level Tinggi/Sedang/Rendah, dan dipetakan ke
kuadran (persen dipilih vs skor kepuasan).
"""

from __future__ import annotations

import re

import pandas as pd

TIDAK_TERPETAKAN = "Tidak terpetakan"

# Bobot adalah usulan awal tim (jumlah harus 1) — sel 11
BOBOT_KETIDAKPUASAN = 1 / 3  # skor kepuasan rendah -> prioritas tinggi
BOBOT_PILIHAN = 1 / 3  # sering dipilih responden sebagai prioritas
BOBOT_KOMENTAR = 1 / 3  # sering disebut di komentar

LEVEL = ("Tinggi", "Sedang", "Rendah")
KUADRAN = ("Prioritas Utama", "Pertahankan", "Prioritas Rendah", "Sudah Cukup")


# ======================================================================= sel 5
def cocokkan_pilihan(pilihan, kata_pilihan: dict[str, list[str]], daftar_aspek: list[str] | None = None) -> str:
    teks = str(pilihan).lower()
    # [perluasan] pilihan yang sama persis dengan nama aspek langsung dipetakan
    # (form Dosen/Karyawan memakai nama aspek sebagai pilihan, mis. "SDM/Kepegawaian").
    # Pada form Mahasiswa hasilnya identik dengan pencocokan kata kunci tim.
    for aspek in daftar_aspek or []:
        if teks.strip() == aspek.lower():
            return aspek
    for aspek, daftar_kata in kata_pilihan.items():
        for kata in daftar_kata:
            if re.search(r"\b" + re.escape(kata) + r"\b", teks):
                return aspek
    return TIDAK_TERPETAKAN


def lengkapi_kata_pilihan(kata_pilihan: dict[str, list[str]], daftar_aspek: list[str]) -> dict[str, list[str]]:
    """[perluasan] aspek tanpa kata kunci pilihan memakai nama aspeknya sendiri."""
    hasil = {a: list(v) for a, v in kata_pilihan.items() if a in daftar_aspek}
    for aspek in daftar_aspek:
        hasil.setdefault(aspek, [aspek.lower()])
    return hasil


# ======================================================================= sel 7
def hitung_pilihan(df_kategori: pd.DataFrame, total_responden_kategori: int) -> pd.DataFrame:
    df_pilih = df_kategori[df_kategori["aspek"] != TIDAK_TERPETAKAN]

    # satu responden dihitung sekali per aspek
    df_pilih = df_pilih.drop_duplicates(subset=["response_id", "aspek"])

    hitung_pilih = df_pilih.groupby("aspek")["response_id"].nunique().reset_index()
    hitung_pilih.columns = ["aspek", "jumlah_dipilih"]
    hitung_pilih["persen_dipilih"] = (hitung_pilih["jumlah_dipilih"] / total_responden_kategori * 100).round(1)
    return hitung_pilih


# ====================================================================== sel 11
def minmax(seri: pd.Series) -> pd.Series:
    selisih = seri.max() - seri.min()
    if selisih == 0:
        return seri * 0
    return (seri - seri.min()) / selisih


def tentukan_level(ranking: int, jumlah: int) -> str:
    if ranking <= jumlah / 3:
        return "Tinggi"
    elif ranking <= 2 * jumlah / 3:
        return "Sedang"
    else:
        return "Rendah"


# ====================================================================== sel 15
def tentukan_kuadran(x: float, y: float, rata_x: float, rata_y: float) -> str:
    if x >= rata_x and y < rata_y:
        return "Prioritas Utama"
    elif x >= rata_x and y >= rata_y:
        return "Pertahankan"
    elif x < rata_x and y < rata_y:
        return "Prioritas Rendah"
    else:
        return "Sudah Cukup"


def jalankan_priority_analysis(
    df_aspek: pd.DataFrame,
    df_kategori: pd.DataFrame,
    df_frek: pd.DataFrame,
    kata_pilihan: dict[str, list[str]],
) -> tuple[pd.DataFrame, dict]:
    """Sel 3-15 notebook. ``df_aspek`` = ringkasan_aspek, ``df_frek`` = frekuensi_aspek."""
    daftar_aspek = df_aspek["aspek"].tolist()
    df_kategori = df_kategori.copy()
    total_responden_kategori = int(df_kategori["response_id"].nunique())

    # sel 5: petakan pilihan prioritas ke aspek
    df_kategori["aspek"] = df_kategori["pilihan"].apply(lambda p: cocokkan_pilihan(p, kata_pilihan, daftar_aspek))
    tak_terpetakan = df_kategori.loc[df_kategori["aspek"] == TIDAK_TERPETAKAN, "pilihan"].value_counts()

    # sel 7
    hitung_pilih = hitung_pilihan(df_kategori, total_responden_kategori)

    # sel 9: gabungkan tiga sumber data
    df_prioritas = df_aspek[["aspek", "rata_rata"]].copy()
    df_prioritas = df_prioritas.rename(columns={"rata_rata": "skor_kepuasan"})
    # [perluasan] aspek tanpa jawaban sama sekali (mis. Klinik pada segmen kecil)
    # tidak diikutkan, agar fillna(0) tidak menjadikannya "paling tidak puas".
    tanpa_data = df_prioritas.loc[df_prioritas["skor_kepuasan"].isna(), "aspek"].tolist()
    df_prioritas = df_prioritas.dropna(subset=["skor_kepuasan"])

    df_prioritas = df_prioritas.merge(hitung_pilih, on="aspek", how="left")
    df_prioritas = df_prioritas.merge(df_frek[["aspek", "frekuensi"]], on="aspek", how="left")
    df_prioritas = df_prioritas.rename(columns={"frekuensi": "frekuensi_komentar"})
    df_prioritas = df_prioritas.fillna(0)
    for kolom in ("jumlah_dipilih", "frekuensi_komentar"):  # [perluasan] tetap bilangan bulat setelah fillna
        df_prioritas[kolom] = df_prioritas[kolom].astype(int)

    # sel 11: skor prioritas & ranking
    df_prioritas["norm_ketidakpuasan"] = 1 - minmax(df_prioritas["skor_kepuasan"])
    df_prioritas["norm_pilihan"] = minmax(df_prioritas["persen_dipilih"])
    df_prioritas["norm_komentar"] = minmax(df_prioritas["frekuensi_komentar"])

    df_prioritas["skor_prioritas"] = (
        BOBOT_KETIDAKPUASAN * df_prioritas["norm_ketidakpuasan"]
        + BOBOT_PILIHAN * df_prioritas["norm_pilihan"]
        + BOBOT_KOMENTAR * df_prioritas["norm_komentar"]
    ).round(3)

    df_prioritas = df_prioritas.sort_values("skor_prioritas", ascending=False).reset_index(drop=True)
    df_prioritas["ranking"] = df_prioritas.index + 1

    jumlah_aspek = len(df_prioritas)
    df_prioritas["level_prioritas"] = df_prioritas["ranking"].apply(lambda r: tentukan_level(r, jumlah_aspek))

    # sel 15: kuadran prioritas
    rata_x = df_prioritas["persen_dipilih"].mean()
    rata_y = df_prioritas["skor_kepuasan"].mean()
    if jumlah_aspek:
        df_prioritas["kuadran"] = df_prioritas.apply(
            lambda baris: tentukan_kuadran(baris["persen_dipilih"], baris["skor_kepuasan"], rata_x, rata_y), axis=1
        )
    else:
        df_prioritas["kuadran"] = pd.Series(dtype=object)

    info = {
        "total_responden_kategori": total_responden_kategori,
        "pilihan_tidak_terpetakan": {str(k): int(v) for k, v in tak_terpetakan.items()},
        "aspek_tanpa_data": tanpa_data,
        "rata_persen_dipilih": None if pd.isna(rata_x) else float(rata_x),
        "rata_skor_kepuasan": None if pd.isna(rata_y) else float(rata_y),
    }
    return df_prioritas, info
