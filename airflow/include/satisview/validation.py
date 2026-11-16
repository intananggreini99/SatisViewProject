"""Validasi hasil preprocessing & hasil analisis.

Hasil hanya disimpan ke HDFS bila validasi lolos (status ``lolos``,
``lolos_dengan_peringatan`` atau ``kosong``). Status ``gagal`` menghentikan
task Airflow sehingga data lama di HDFS/PostgreSQL tetap dipakai dashboard.

Pemeriksaan = kontrak ``contracts/data_contract.json`` (kolom, tipe, rentang,
kunci unik) + pemeriksaan yang ada di notebook tim (``cek_konversi``,
aspek ``TIDAK TERDETEKSI``, pilihan prioritas ``Tidak terpetakan``,
komentar tanpa aspek, interpretasi stress MDS).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import config, contract

LOLOS = "lolos"
LOLOS_PERINGATAN = "lolos_dengan_peringatan"
KOSONG = "kosong"
GAGAL = "gagal"


class ValidationFailed(RuntimeError):
    def __init__(self, report: "ValidationReport") -> None:
        self.report = report
        lines = "\n - ".join(report.errors)
        super().__init__(f"Validasi '{report.tahap}' untuk '{report.responden}' GAGAL:\n - {lines}")


@dataclass
class ValidationReport:
    tahap: str
    responden: str
    status: str = LOLOS
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    statistik: dict = field(default_factory=dict)
    waktu: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def finish(self, empty: bool = False) -> "ValidationReport":
        if self.errors:
            self.status = GAGAL
        elif empty:
            self.status = KOSONG
        elif self.warnings:
            self.status = LOLOS_PERINGATAN
        else:
            self.status = LOLOS
        return self

    @property
    def passed(self) -> bool:
        return self.status != GAGAL

    def to_dict(self) -> dict:
        return asdict(self)


# ------------------------------------------------------------ pemeriksa umum
def _batas(nilai, skala: tuple[int, int]):
    if nilai == "skala_min":
        return skala[0]
    if nilai == "skala_maks":
        return skala[1]
    return nilai


def _bukan_tipe(series: pd.Series, tipe: str) -> int:
    values = series.dropna()
    if values.empty or tipe == "teks":
        return 0
    numeric = pd.to_numeric(values, errors="coerce")
    salah = int(numeric.isna().sum())
    if tipe == "bilangan_bulat":
        angka = numeric.dropna()
        salah += int((~np.isclose(angka, angka.round())).sum())
    return salah


def periksa_kontrak(rep: ValidationReport, tahap: str, nama: str, df: pd.DataFrame, skala: tuple[int, int], label: str) -> None:
    spec = contract.spec(tahap, nama)
    aturan_kolom = spec["kolom"]
    hilang = [c for c in aturan_kolom if c not in df.columns]
    if hilang:
        rep.error(f"{label}: kolom wajib hilang {hilang}.")
        return
    if df.empty:
        return
    for kolom, aturan in aturan_kolom.items():
        seri = df[kolom]
        if aturan.get("wajib_isi") and seri.isna().any():
            rep.error(f"{label}: kolom '{kolom}' memiliki {int(seri.isna().sum())} nilai kosong.")
        tipe = aturan.get("tipe", "teks")
        salah = _bukan_tipe(seri, tipe)
        if salah:
            rep.error(f"{label}: {salah} nilai kolom '{kolom}' tidak bertipe {tipe}.")
            continue
        if tipe in ("angka", "bilangan_bulat"):
            angka = pd.to_numeric(seri, errors="coerce").dropna()
            if np.isinf(angka).any():
                rep.error(f"{label}: kolom '{kolom}' berisi nilai tak hingga.")
            lo, hi = _batas(aturan.get("min"), skala), _batas(aturan.get("maks"), skala)
            if lo is not None and (angka < lo - 1e-9).any():
                rep.error(f"{label}: kolom '{kolom}' memiliki nilai < {lo}.")
            if hi is not None and (angka > hi + 1e-9).any():
                rep.error(f"{label}: kolom '{kolom}' memiliki nilai > {hi}.")
        if "pilihan" in aturan:
            asing = set(seri.dropna().astype(str)) - set(aturan["pilihan"])
            if asing:
                rep.error(f"{label}: nilai kolom '{kolom}' tidak dikenal {sorted(asing)[:5]}.")
    kunci = spec.get("kunci_unik")
    if kunci and all(k in df.columns for k in kunci):
        ganda = int(df.duplicated(subset=kunci).sum())
        if ganda:
            rep.error(f"{label}: kombinasi {kunci} tidak unik ({ganda} duplikat).")


def _cek_rentang(rep: ValidationReport, label: str, df: pd.DataFrame, kolom: list[str], skala: tuple[int, int]) -> None:
    if not kolom or df.empty:
        return
    blok = df[kolom].apply(pd.to_numeric, errors="coerce")
    bukan_angka = int((blok.isna() & df[kolom].notna()).sum().sum())
    if bukan_angka:
        rep.error(f"{label}: {bukan_angka} nilai skor bukan angka.")
    di_luar = int(((blok < skala[0]) | (blok > skala[1])).sum().sum())
    if di_luar:
        rep.error(f"{label}: {di_luar} nilai skor di luar skala {skala[0]}..{skala[1]}.")


# ------------------------------------------------------- validation_preprocessing
def validate_preprocessed(tabel: dict[str, pd.DataFrame], meta: dict, responden: str) -> ValidationReport:
    """``tabel`` = CSV hasil preprocessing yang dibaca ulang (kunci = nama file tanpa .csv)."""
    rep = ValidationReport(tahap="validation_preprocessing", responden=responden)
    file = meta["file"]
    skala = (int(meta["skala"]["min"]), int(meta["skala"]["maks"]))
    n_responden = int(meta.get("n_responden", 0))

    for nama in contract.table_names("preprocessing"):
        spec = contract.spec("preprocessing", nama)
        stem = file.get(nama)
        if stem is None:
            if not spec.get("opsional"):
                rep.error(f"File '{nama}' tidak dihasilkan preprocessing.")
            continue
        if stem not in tabel:
            rep.error(f"File {stem}.csv tidak ditemukan.")
            continue
        periksa_kontrak(rep, "preprocessing", nama, tabel[stem], skala, f"{stem}.csv")

    kamus = tabel.get(file.get("kamus", ""), pd.DataFrame())
    likert = tabel.get(file.get("likert_utama", ""), pd.DataFrame())
    bersyarat = tabel.get(file.get("likert_bersyarat", ""), None) if "likert_bersyarat" in file else None
    skor = tabel.get(file.get("skor_aspek", ""), pd.DataFrame())
    ringkasan = tabel.get(file.get("ringkasan_aspek", ""), pd.DataFrame())

    if kamus.empty or "aspek" not in kamus.columns:
        rep.error("Tidak ada butir Likert (kolom berformat 'Judul [Pertanyaan]') yang terdeteksi.")
        return rep.finish()

    # Aspek gagal terdeteksi (notebook: "PERINGATAN - item gagal terdeteksi aspeknya")
    gagal_aspek = kamus.loc[kamus["aspek"] == "TIDAK TERDETEKSI", "item_kode"].tolist()
    if gagal_aspek:
        rep.error(f"{len(gagal_aspek)} butir gagal terdeteksi aspeknya, mis. {gagal_aspek[:3]}.")

    # Skor butir: angka dalam skala; semua butir kamus ada di file likert
    kolom_kamus = set(kamus["nama_kolom_asli"])
    kolom_utama = [c for c in likert.columns if c in kolom_kamus]
    _cek_rentang(rep, f"{file['likert_utama']}.csv", likert, kolom_utama, skala)
    kolom_ada = set(kolom_utama)
    if bersyarat is not None:
        kolom_bersyarat = [c for c in bersyarat.columns if c in kolom_kamus]
        _cek_rentang(rep, f"{file['likert_bersyarat']}.csv", bersyarat, kolom_bersyarat, skala)
        kolom_ada |= set(kolom_bersyarat)
    hilang = kolom_kamus - kolom_ada
    if hilang:
        rep.error(f"{len(hilang)} butir di kamus tidak ada di file likert.")

    # Skor aspek & ringkasan konsisten dengan kamus
    aspek_kamus = list(dict.fromkeys(kamus["aspek"]))
    kolom_skor = [c for c in skor.columns if c != "response_id"]
    if set(kolom_skor) != set(aspek_kamus):
        rep.error(f"Kolom skor_aspek {kolom_skor} tidak sama dengan aspek kamus {aspek_kamus}.")
    _cek_rentang(rep, f"{file['skor_aspek']}.csv", skor, [c for c in kolom_skor if c in skor.columns], skala)
    if "aspek" in ringkasan.columns and set(ringkasan["aspek"]) != set(aspek_kamus):
        rep.error("Aspek di ringkasan_aspek tidak sama dengan aspek kamus.")

    # response_id unik & lengkap
    if "response_id" in likert.columns:
        if likert["response_id"].duplicated().any():
            rep.error("response_id ganda pada file likert utama.")
        if len(likert) != n_responden:
            rep.error(f"Jumlah baris likert utama ({len(likert)}) berbeda dengan jumlah responden ({n_responden}).")

    # PII tidak boleh ikut ke file hasil
    pii = set(meta.get("kolom_pii_dibuang", []))
    for stem, df in tabel.items():
        bocor = pii & set(df.columns)
        if bocor:
            rep.error(f"{stem}.csv masih memuat kolom data pribadi {sorted(bocor)}.")

    # cek_konversi tim: jawaban yang gagal dikonversi / di luar skala
    for cek in meta.get("cek_konversi", []):
        gagal = int(cek["terisi_asli"]) - int(cek["setelah_konversi"])
        if cek["di_luar_skala"]:
            rep.error(f"{cek['nama']}: {cek['di_luar_skala']} skor di luar skala {skala[0]}..{skala[1]}.")
        if gagal > 0:
            rasio = gagal / max(int(cek["terisi_asli"]), 1)
            contoh = list(cek.get("contoh_gagal", {}))[:3]
            pesan = f"{cek['nama']}: {gagal} jawaban gagal dikonversi ke skor ({rasio:.1%}), mis. {contoh}."
            if rasio > config.MAX_GAGAL_KONVERSI:
                rep.error(pesan + " Periksa label jawaban form / MAPPING_LIKERT di konfigurasi.")
            else:
                rep.warn(pesan)

    kolom = meta.get("kolom", {})
    for item in kolom.get("tidak_ditemukan", []):
        rep.warn(f"Kolom yang diharapkan tidak ditemukan di sheet — {item}")
    if not kolom.get("segmen"):
        rep.warn("Kolom segmen (mis. Program Studi/Unit Kerja) tidak ditemukan; filter segmen hanya 'Semua'.")
    if kolom.get("diabaikan"):
        rep.warn(f"{len(kolom['diabaikan'])} kolom tidak dipakai preprocessing: {kolom['diabaikan'][:3]}")

    rep.statistik = {
        "n_responden": n_responden,
        "n_butir": int(len(kamus)),
        "n_aspek": len(aspek_kamus),
        "n_teks": int(meta.get("jumlah_teks", 0)),
        "n_pilihan_kategori": int(meta.get("jumlah_pilihan_kategori", 0)),
        "cek_konversi": meta.get("cek_konversi", []),
    }
    if n_responden == 0:
        rep.warn("Belum ada respons pada kuisioner ini; dashboard akan menampilkan status kosong.")
        return rep.finish(empty=not rep.errors)
    return rep.finish()


# ----------------------------------------------------------- validation_analysis
def validate_analysis(
    tabel: dict[str, pd.DataFrame],
    meta: dict,
    responden: str,
    info: dict | None = None,
    ringkasan_aspek: pd.DataFrame | None = None,
) -> ValidationReport:
    rep = ValidationReport(tahap="validation_analysis", responden=responden)
    info = info or {}
    skala = (int(meta["skala"]["min"]), int(meta["skala"]["maks"]))
    n_responden = int(meta.get("n_responden", 0))

    def ambil(nama: str) -> pd.DataFrame | None:
        return tabel.get(contract.file_name("analisis", nama, responden))

    baris = {}
    for nama in contract.table_names("analisis"):
        stem = contract.file_name("analisis", nama, responden)
        if stem not in tabel:
            rep.error(f"Tabel '{stem}' tidak dihasilkan analisis.")
            continue
        baris[stem] = int(len(tabel[stem]))
        periksa_kontrak(rep, "analisis", nama, tabel[stem], skala, f"{stem}.csv")

    if n_responden > 0 and not rep.errors:
        kpi = ambil("kpi_ringkasan")
        semua = kpi[kpi["segmen"] == "Semua"]
        if semua.empty:
            rep.error("Baris segmen 'Semua' tidak ada di kpi_ringkasan.")
        elif int(semua["n_responden"].iloc[0]) != n_responden:
            rep.error(
                f"n_responden 'Semua' ({int(semua['n_responden'].iloc[0])}) berbeda dengan hasil preprocessing ({n_responden})."
            )

        # Hasil 'Semua' harus sama dengan ringkasan_aspek tim (lintas tahap)
        if ringkasan_aspek is not None and not ringkasan_aspek.empty:
            kpi_aspek = ambil("kpi_aspek")
            a = kpi_aspek[kpi_aspek["segmen"] == "Semua"].set_index("aspek")["rata_rata"]
            b = ringkasan_aspek.dropna(subset=["rata_rata"]).set_index("aspek")["rata_rata"]
            if set(a.index) != set(b.index) or not np.allclose(a.reindex(b.index).values, b.values):
                rep.error("kpi_aspek (Semua) tidak sama dengan ringkasan_aspek hasil preprocessing.")

        # Ranking prioritas & frekuensi: 1..n per segmen
        for nama, kolom in (("prioritas_aspek", "ranking"), ("frekuensi_aspek", "ranking")):
            df = ambil(nama)
            for seg, grup in df.groupby("segmen"):
                if sorted(grup[kolom].astype(int)) != list(range(1, len(grup) + 1)):
                    rep.error(f"{nama}: ranking segmen '{seg}' tidak berurutan 1..{len(grup)}.")
                    break

        # Peringatan dari notebook tim
        for pesan in info.get("peringatan", []):
            rep.warn(pesan)
        tanpa = int(info.get("komentar_tanpa_aspek", 0))
        total = int(info.get("jumlah_komentar", 0))
        if total and tanpa:
            rep.warn(f"{tanpa} dari {total} komentar tanpa aspek terdeteksi (lengkapi ASPEK_KATA_KUNCI bila perlu).")
        dilewati = info.get("mds_dilewati", [])
        if any(d["segmen"] == "Semua" for d in dilewati):
            rep.warn(f"MDS tidak dihitung: responden lengkap < {config.MIN_RESPONDEN_MDS} atau aspek < 3.")
        elif dilewati:
            rep.warn(f"MDS dilewati untuk {len(dilewati)} segmen dengan responden < {config.MIN_RESPONDEN_MDS}.")
        stress = ambil("mds_stress")
        kurang = stress[(stress["segmen"] == "Semua") & (stress["interpretasi"] == "kurang baik")]
        for _, s in kurang.iterrows():
            rep.warn(f"Stress-1 {s['analisis']} = {s['stress1']} (kurang baik) — tafsirkan peta dengan hati-hati.")

    rep.statistik = {"baris_per_tabel": baris, "n_responden": n_responden}
    return rep.finish(empty=n_responden == 0 and not rep.errors)
