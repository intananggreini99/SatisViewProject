"""Tahap ``analysis`` pipeline — menjalankan kode analisis TIM untuk tiap segmen.

Kontrak fungsi (dipanggil lewat ``satisview.plugins``)::

    run_analysis(tabel_preprocessing, meta, group, options=None) -> (tabel_analisis, info)

``tabel_preprocessing`` adalah 8 CSV hasil preprocessing yang sudah lolos
validasi (dibaca ulang dari file, seperti notebook tim membaca ``data/clean``).
Hasilnya 13 tabel (lihat ``contracts/data_contract.json``):

==========================  ===================================================
tabel                       sumber
==========================  ===================================================
prioritas_aspek_<r>         priority-analysis-mahasiswa.ipynb
frekuensi_aspek_<r>         text-analytics-mahasiswa.ipynb
teks_bersih_<r>             text-analytics-mahasiswa.ipynb
aspek_komentar_<r>          text-analytics-mahasiswa.ipynb
kata_teratas_<r>            text-analytics-mahasiswa.ipynb (sel 19, kini disimpan)
mds_titik_aspek_<r>         mds-mahasiswa.ipynb
mds_responden_<r>           mds-mahasiswa.ipynb
mds_vektor_aspek_<r>        mds-mahasiswa.ipynb
mds_stress_<r>              mds-mahasiswa.ipynb (+ baris 3D)
mds_titik_aspek_3d_<r>      perluasan: MDS aspek 3 dimensi (Visualisasi 3D)
kpi_ringkasan_<r>           KPI dashboard dari ringkasan_item/aspek tim
kpi_aspek_<r>               KPI dashboard dari ringkasan_aspek tim
kpi_item_<r>                KPI dashboard dari ringkasan_item tim
==========================  ===================================================

Baris ``segmen = "Semua"`` = keluaran notebook tim apa adanya (seluruh
responden). Baris segmen lain menjalankan fungsi yang sama untuk responden
satu Program Studi / Departemen / Unit Kerja / jenis mitra (filter dashboard).
Kolom asli notebook selalu di depan; kolom tambahan diletakkan di belakang.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from . import config, contract
from .naming import kelompok_layanan, label_layanan, singkatan_layanan
from .respondents import RespondentGroup
from .tim import mds as tim_mds
from .tim import preprocessing as tim_preprocessing
from .tim import priority_analysis as tim_prioritas
from .tim import text_analytics as tim_teks
from .tim.konfigurasi import konfigurasi

log = logging.getLogger(__name__)

SEMUA = "Semua"
TIDAK_DIISI = "Tidak Diisi"
WIB = timezone(timedelta(hours=7))


# --------------------------------------------------------------- utilitas
def mutu_ikm(indeks: float | None) -> tuple[str | None, str | None]:
    """Kategori mutu pelayanan (PermenPANRB No. 14/2017) untuk indeks 0-100."""
    if indeks is None or pd.isna(indeks):
        return None, None
    if indeks >= 88.31:
        return "A", "Sangat Baik"
    if indeks >= 76.61:
        return "B", "Baik"
    if indeks >= 65.0:
        return "C", "Kurang Baik"
    return "D", "Tidak Baik"


def _indeks(rata_rata, skala_maks: int):
    """Indeks 0-100 dari rata-rata skor tim (rata-rata / skor maksimum x 100)."""
    return (pd.to_numeric(rata_rata, errors="coerce") / skala_maks * 100).round(2)


def _segmen_responden(likert: pd.DataFrame, kolom_segmen: str | None) -> pd.Series:
    """Segmen tiap response_id (kosong -> "Tidak Diisi"; tanpa kolom segmen -> "Semua")."""
    if not kolom_segmen or kolom_segmen not in likert.columns:
        return pd.Series(SEMUA, index=likert["response_id"].values, dtype=object)

    def bersih(v):
        if v is None or (isinstance(v, float) and np.isnan(v)) or str(v).strip() == "":
            return TIDAK_DIISI
        return " ".join(str(v).split())

    return pd.Series([bersih(v) for v in likert[kolom_segmen]], index=likert["response_id"].values, dtype=object)


def _susun(nama: str, df: pd.DataFrame) -> pd.DataFrame:
    """Urutkan kolom sesuai kontrak (kolom yang tidak ada diisi NaN)."""
    kolom = contract.columns("analisis", nama)
    df = df.copy()
    for k in kolom:
        if k not in df.columns:
            df[k] = np.nan
    lain = [k for k in df.columns if k not in kolom]
    return df[kolom + lain].reset_index(drop=True)


def _kosong(nama: str) -> pd.DataFrame:
    return pd.DataFrame(columns=contract.columns("analisis", nama))


# ------------------------------------------------------------------- utama
def run_analysis(
    tabel: dict[str, pd.DataFrame], meta: dict, group: RespondentGroup, options: dict | None = None
) -> tuple[dict[str, pd.DataFrame], dict]:
    cfg = konfigurasi(group.key)
    file = meta["file"]
    skala_min, skala_maks = int(meta["skala"]["min"]), int(meta["skala"]["maks"])
    dimensi = meta.get("dimensi_segmen") or group.segment_label
    min_mds = int((options or {}).get("min_responden_mds", config.MIN_RESPONDEN_MDS))
    sekarang = datetime.now(WIB).isoformat(timespec="seconds")

    likert = tabel[file["likert_utama"]]
    bersyarat = tabel.get(file["likert_bersyarat"]) if "likert_bersyarat" in file else None
    kamus = tabel[file["kamus"]]
    skor = tabel[file["skor_aspek"]]
    teks = tabel[file["teks"]]
    kategori = tabel[file["kategori"]]

    info: dict = {"peringatan": [], "mds_dilewati": []}
    hasil_kosong = {nama: _kosong(nama) for nama in contract.table_names("analisis")}
    if likert.empty or kamus.empty:
        info["peringatan"].append("Belum ada respons; semua tabel analisis kosong.")
        return {contract.file_name("analisis", n, group.key): df for n, df in hasil_kosong.items()}, info

    # --- kamus & segmen
    kamus_utama = kamus[kamus["nama_kolom_asli"].isin(likert.columns)].reset_index(drop=True)
    kamus_bersyarat = (
        kamus[kamus["nama_kolom_asli"].isin(bersyarat.columns)].reset_index(drop=True)
        if bersyarat is not None
        else kamus.iloc[0:0]
    )
    aspek_urut = list(dict.fromkeys(kamus["aspek"].tolist()))
    urutan_aspek = {a: i + 1 for i, a in enumerate(aspek_urut)}
    urutan_item = kamus.groupby("aspek", sort=False).cumcount() + 1
    urutan_item = dict(zip(kamus["item_kode"], urutan_item))

    segmen_resp = _segmen_responden(likert, meta["kolom"]["segmen"])
    daftar_segmen = [SEMUA] + sorted({s for s in segmen_resp if s != SEMUA}, key=lambda s: s.lower())

    def ids_segmen(seg: str) -> pd.Index:
        return segmen_resp.index if seg == SEMUA else segmen_resp.index[segmen_resp.values == seg]

    # --- text analytics (token dihitung sekali untuk semua komentar)
    kamus_efektif, peringatan_kamus = tim_teks.lengkapi_kata_kunci(cfg.aspek_kata_kunci, aspek_urut, kamus)
    info["peringatan"] += peringatan_kamus
    frasa = tim_teks.bangun_aspek_frasa(kamus_efektif)
    komentar = tim_teks.proses_komentar(teks, frasa)
    komentar["id_komentar"] = [f"K{i + 1:05d}" for i in range(len(komentar))]
    komentar["segmen_responden"] = komentar["response_id"].map(segmen_resp).fillna(TIDAK_DIISI)
    info["komentar_tanpa_aspek"] = int((komentar["aspek"].apply(len) == 0).sum()) if len(komentar) else 0
    info["jumlah_komentar"] = int(len(komentar))

    kata_pilihan = tim_prioritas.lengkapi_kata_pilihan(cfg.kata_pilihan, aspek_urut)
    kategori_seg = kategori["response_id"].map(segmen_resp)

    # --- MDS (aturan kolom >50% kosong ditentukan dari seluruh responden)
    matriks_semua, kolom_mds, kolom_dibuang = tim_mds.siapkan_matriks(skor)
    info["mds_aspek_dibuang"] = kolom_dibuang
    acuan: dict[int, np.ndarray] = {}

    per_segmen = [n for n in contract.table_names("analisis") if n not in ("teks_bersih", "aspek_komentar")]
    out: dict[str, list[pd.DataFrame]] = {nama: [] for nama in per_segmen}
    for seg in daftar_segmen:
        ids = ids_segmen(seg)
        lu = likert[likert["response_id"].isin(ids)]
        lb = bersyarat[bersyarat["response_id"].isin(ids)] if bersyarat is not None else None

        # ringkasan per item & aspek (fungsi tim, sel 8 preprocessing)
        ri = tim_preprocessing.ringkasan_item(lu, kamus_utama)
        if lb is not None and len(kamus_bersyarat):
            ri = pd.concat([ri, tim_preprocessing.ringkasan_item(lb, kamus_bersyarat)], ignore_index=True)
        ra = tim_preprocessing.ringkasan_aspek(ri)

        # text analytics per segmen
        kom = komentar if seg == SEMUA else komentar[komentar["segmen_responden"] == seg]
        frek = tim_teks.hitung_frekuensi(kom, list(kamus_efektif))
        out["frekuensi_aspek"].append(frek.assign(segmen=seg))
        out["kata_teratas"].append(tim_teks.kata_teratas(kom).assign(segmen=seg))

        # priority analysis per segmen
        kat = kategori if seg == SEMUA else kategori[kategori_seg.values == seg]
        prior, info_prior = tim_prioritas.jalankan_priority_analysis(ra, kat, frek, kata_pilihan)
        out["prioritas_aspek"].append(prior.assign(segmen=seg))
        if seg == SEMUA and info_prior["pilihan_tidak_terpetakan"]:
            info["peringatan"].append(f"Pilihan prioritas tidak terpetakan: {info_prior['pilihan_tidak_terpetakan']}")

        # KPI dashboard
        kpi_item, kpi_aspek, kpi_ringkasan = _kpi(
            seg, ri, ra, lu, lb, kamus_utama, kamus_bersyarat, urutan_aspek, urutan_item, skala_min, skala_maks,
            dimensi, len(ids), len(kom), int(kat["response_id"].nunique()), sekarang,
        )
        out["kpi_item"].append(kpi_item)
        out["kpi_aspek"].append(kpi_aspek)
        out["kpi_ringkasan"].append(kpi_ringkasan)

        # MDS
        _mds_segmen(seg, ids, skor, kolom_mds, kolom_dibuang, matriks_semua, min_mds, acuan, out, info, segmen_resp)

    # tabel komentar (format notebook + kolom tambahan)
    teks_bersih = tim_teks.tabel_teks_bersih(komentar).assign(
        id_komentar=komentar["id_komentar"].values,
        jenis_pertanyaan=komentar["jenis_pertanyaan"].values,
        segmen_responden=komentar["segmen_responden"].values,
    )
    aspek_komentar = _aspek_komentar(komentar)

    tabel_hasil = {
        "teks_bersih": teks_bersih,
        "aspek_komentar": aspek_komentar,
    }
    for nama, bagian in out.items():
        bagian = [b for b in bagian if b is not None and len(b)]
        tabel_hasil[nama] = pd.concat(bagian, ignore_index=True) if bagian else _kosong(nama)

    hasil = {contract.file_name("analisis", nama, group.key): _susun(nama, df) for nama, df in tabel_hasil.items()}
    info["segmen"] = daftar_segmen
    log.info(
        "[%s] analisis selesai: %s segmen, %s komentar (%s tanpa aspek), MDS dilewati untuk %s segmen",
        group.key, len(daftar_segmen), info["jumlah_komentar"], info["komentar_tanpa_aspek"], len(info["mds_dilewati"]),
    )
    return hasil, info


def _aspek_komentar(komentar: pd.DataFrame) -> pd.DataFrame:
    """Format long sel 21 notebook + id_komentar & segmen agar komentar bisa difilter per topik."""
    baris = []
    for _, k in komentar.iterrows():
        for aspek in k["aspek"]:
            baris.append(
                {
                    "response_id": k["response_id"],
                    "aspek": aspek,
                    "id_komentar": k["id_komentar"],
                    "segmen_responden": k["segmen_responden"],
                }
            )
    return pd.DataFrame(baris, columns=["response_id", "aspek", "id_komentar", "segmen_responden"])


def _kpi(
    seg, ri, ra, lu, lb, kamus_utama, kamus_bersyarat, urutan_aspek, urutan_item, skala_min, skala_maks,
    dimensi, n_responden, n_komentar, n_pengisi_prioritas, sekarang,
):
    # --- per item
    item = ri[ri["n_responden"] > 0].copy()
    item["indeks"] = _indeks(item["rata_rata"], skala_maks)
    item["urutan_aspek"] = item["aspek"].map(urutan_aspek)
    item["urutan_item"] = item["item_kode"].map(urutan_item)
    item["segmen"] = seg

    # --- per aspek
    aspek = ra.dropna(subset=["rata_rata"]).copy()

    def n_aspek(a: str) -> int:
        for df, kamus in ((lu, kamus_utama), (lb, kamus_bersyarat)):
            if df is None:
                continue
            kolom = kamus.loc[kamus["aspek"] == a, "nama_kolom_asli"].tolist()
            kolom = [k for k in kolom if k in df.columns]
            if kolom:
                return int(df[kolom].notna().any(axis=1).sum())
        return 0

    aspek["n_responden"] = aspek["aspek"].map(n_aspek)
    aspek["indeks"] = _indeks(aspek["rata_rata"], skala_maks)
    aspek["mutu"] = aspek["indeks"].map(lambda v: mutu_ikm(v)[0])
    aspek["kinerja"] = aspek["indeks"].map(lambda v: mutu_ikm(v)[1])
    aspek["peringkat"] = aspek["rata_rata"].rank(ascending=False, method="min").astype(int)
    aspek["urutan"] = aspek["aspek"].map(urutan_aspek)
    aspek["label"] = aspek["aspek"].map(label_layanan)
    aspek["singkatan"] = aspek["aspek"].map(singkatan_layanan)
    aspek["kelompok"] = aspek["aspek"].map(kelompok_layanan)
    aspek["segmen"] = seg
    aspek = aspek.sort_values("urutan")

    # --- ringkasan segmen
    if len(aspek):
        rata_total = float(aspek["rata_rata"].mean())
        indeks_total = round(rata_total / skala_maks * 100, 2)
        urut = aspek.sort_values(["rata_rata", "urutan"], ascending=[False, True])
        tertinggi, terendah = urut.iloc[0], aspek.sort_values(["rata_rata", "urutan"]).iloc[0]
    else:
        rata_total = indeks_total = np.nan
        tertinggi = terendah = None
    mutu, kinerja = mutu_ikm(indeks_total)
    ringkasan = pd.DataFrame(
        [
            {
                "segmen": seg,
                "dimensi_segmen": dimensi,
                "n_responden": int(n_responden),
                "jumlah_aspek": int(len(aspek)),
                "rata_rata_total": round(rata_total, 2) if not pd.isna(rata_total) else np.nan,
                "indeks_total": indeks_total,
                "mutu": mutu,
                "kinerja": kinerja,
                "aspek_tertinggi": tertinggi["label"] if tertinggi is not None else None,
                "indeks_tertinggi": tertinggi["indeks"] if tertinggi is not None else np.nan,
                "aspek_terendah": terendah["label"] if terendah is not None else None,
                "indeks_terendah": terendah["indeks"] if terendah is not None else np.nan,
                "skala_min": skala_min,
                "skala_maks": skala_maks,
                "jumlah_komentar": int(n_komentar),
                "jumlah_pengisi_prioritas": int(n_pengisi_prioritas),
                "tanggal_analisis": sekarang,
            }
        ]
    )
    return item, aspek, ringkasan


def _mds_segmen(seg, ids, skor, kolom_mds, kolom_dibuang, matriks_semua, min_mds, acuan, out, info, segmen_resp):
    if seg == SEMUA:
        matriks = matriks_semua
    else:
        matriks, _, _ = tim_mds.siapkan_matriks(skor[skor["response_id"].isin(ids)], kolom_dibuang=kolom_dibuang)
    n = len(matriks)
    if n < min_mds or len(kolom_mds) < 3:
        info["mds_dilewati"].append({"segmen": seg, "n_responden": int(n), "n_aspek": len(kolom_mds)})
        return

    stress = []
    if seg == SEMUA:
        koordinat, vektor, s_resp = tim_mds.mds_responden(matriks, kolom_mds)
        out["mds_responden"].append(
            koordinat.assign(segmen_responden=koordinat["response_id"].map(segmen_resp).values)
        )
        out["mds_vektor_aspek"].append(vektor.assign(segmen=seg))
        stress.append(("mds_responden_2d", s_resp))

    jarak, n_kosong = tim_mds.jarak_antar_aspek(matriks, kolom_mds)
    if n_kosong:
        info["peringatan"].append(
            f"Segmen '{seg}': {n_kosong} korelasi antar aspek tak terdefinisi (nilai seragam), dianggap jarak 1."
        )
    for dim in (2, 3):
        if dim == 3 and len(kolom_mds) < 4:
            continue
        titik, s, koordinat_aspek = tim_mds.mds_aspek(jarak, kolom_mds, dim)
        if seg == SEMUA:
            acuan[dim] = koordinat_aspek
        elif dim in acuan:
            selaras = tim_mds.selaraskan(koordinat_aspek, acuan[dim])
            for d in range(dim):
                titik[f"dim{d + 1}"] = selaras[:, d].round(4)
        nama = "mds_titik_aspek" if dim == 2 else "mds_titik_aspek_3d"
        out[nama].append(titik.assign(segmen=seg))
        stress.append((f"mds_aspek_{dim}d", s))

    out["mds_stress"].append(tim_mds.tabel_stress(stress).assign(segmen=seg, n_responden=n, n_aspek=len(kolom_mds)))
