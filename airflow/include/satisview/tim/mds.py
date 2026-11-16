"""Multidimensional Scaling (MDS) — port ``mds-mahasiswa.ipynb``.

* matriks responden x aspek dari ``skor_aspek`` (aspek yang >50% kosong,
  mis. Klinik, tidak dipakai; responden yang masih punya nilai kosong dibuang)
* MDS 2 dimensi responden (jarak Euclidean) + Kruskal stress-1
* vektor aspek: korelasi skor aspek dengan dimensi 1 & 2 (overlay post-hoc)
* MDS aspek: jarak = 1 - korelasi antar aspek -> peta kedekatan aspek

[perluasan] MDS aspek juga dihitung 3 dimensi (tampilan "Visualisasi 3D"),
dengan parameter yang sama (``n_init=10``, ``random_state=42``).
"""

from __future__ import annotations

import inspect
import warnings

import numpy as np
import pandas as pd
from sklearn.manifold import MDS
from sklearn.metrics.pairwise import euclidean_distances


# ======================================================================= sel 7
def hitung_stress1(jarak_asli: np.ndarray, koordinat: np.ndarray) -> float:
    # Kruskal stress-1: makin kecil makin bagus
    jarak_hasil = euclidean_distances(koordinat)
    atas = np.sum((jarak_asli - jarak_hasil) ** 2)
    bawah = np.sum(jarak_asli**2)
    return float(np.sqrt(atas / bawah)) if bawah > 0 else 0.0


def interpretasi_stress(nilai: float) -> str:
    # pedoman kasar
    if nilai < 0.05:
        return "sangat baik"
    elif nilai < 0.10:
        return "baik"
    elif nilai < 0.20:
        return "cukup"
    else:
        return "kurang baik"


def fit_mds(jarak: np.ndarray, n_components: int, n_init: int) -> np.ndarray:
    """``MDS(n_components=k, dissimilarity="precomputed", n_init=n, random_state=42)`` seperti notebook.

    Notebook menonaktifkan FutureWarning; scikit-learn 1.8+ memang
    memperingatkan parameter ``dissimilarity`` & default ``init``. Bila kelak
    ``dissimilarity`` dihapus, dipakai padanannya (``metric="precomputed"``,
    ``init="random"``) agar algoritmanya tetap sama.
    """
    parameter = inspect.signature(MDS).parameters
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=FutureWarning)
        if "dissimilarity" in parameter:
            model = MDS(n_components=n_components, dissimilarity="precomputed", n_init=n_init, random_state=42)
        else:  # pragma: no cover - scikit-learn >= 1.10
            model = MDS(n_components=n_components, metric="precomputed", init="random", n_init=n_init, random_state=42)
        return model.fit_transform(jarak)


# ======================================================================= sel 5
def siapkan_matriks(
    df_skor: pd.DataFrame, kolom_dibuang: list[str] | None = None
) -> tuple[pd.DataFrame, list[str], list[str]]:
    kolom_aspek = [k for k in df_skor.columns if k != "response_id"]

    # kolom yang kosong lebih dari 50% (misal Klinik) tidak dipakai di MDS
    if kolom_dibuang is None:
        kolom_dibuang = []
        for kolom in kolom_aspek:
            if df_skor[kolom].isnull().mean() > 0.5:
                kolom_dibuang.append(kolom)

    kolom_aspek = [k for k in kolom_aspek if k not in kolom_dibuang]

    # buang responden yang masih punya nilai kosong
    df_matriks = df_skor[["response_id"] + kolom_aspek].dropna().reset_index(drop=True)
    return df_matriks, kolom_aspek, kolom_dibuang


# ================================================================== sel 11, 15
def mds_responden(df_matriks: pd.DataFrame, kolom_aspek: list[str]) -> tuple[pd.DataFrame, pd.DataFrame, float]:
    X = df_matriks[kolom_aspek].values
    # semua aspek sudah di skala 1-4, jadi tidak perlu standardisasi
    jarak_asli = euclidean_distances(X)

    koordinat = fit_mds(jarak_asli, n_components=2, n_init=4)
    stress_responden = hitung_stress1(jarak_asli, koordinat)

    df_koordinat = pd.DataFrame(
        {
            "response_id": df_matriks["response_id"],
            "dim1": koordinat[:, 0].round(4),
            "dim2": koordinat[:, 1].round(4),
        }
    )

    # korelasi skor tiap aspek dengan dimensi 1 dan dimensi 2
    daftar_vektor = []
    with np.errstate(invalid="ignore", divide="ignore"):
        for kolom in kolom_aspek:
            r1 = np.corrcoef(df_matriks[kolom], koordinat[:, 0])[0, 1]
            r2 = np.corrcoef(df_matriks[kolom], koordinat[:, 1])[0, 1]
            daftar_vektor.append({"aspek": kolom, "korelasi_dim1": round(r1, 3), "korelasi_dim2": round(r2, 3)})
    df_vektor = pd.DataFrame(daftar_vektor, columns=["aspek", "korelasi_dim1", "korelasi_dim2"])
    return df_koordinat, df_vektor, stress_responden


# ====================================================================== sel 17
def jarak_antar_aspek(df_matriks: pd.DataFrame, kolom_aspek: list[str]) -> tuple[np.ndarray, int]:
    """Jarak antar aspek = 1 - korelasi antar aspek (sel 17).

    [perluasan] Korelasi tak terdefinisi (aspek bernilai sama untuk semua
    responden pada segmen kecil) dianggap tidak berkorelasi (jarak 1).
    Mengembalikan juga jumlah pasangan yang diisi.
    """
    with np.errstate(invalid="ignore", divide="ignore"):
        korelasi = np.corrcoef(df_matriks[kolom_aspek].values.T)
    jarak_aspek = 1 - korelasi
    n_kosong = int(np.isnan(jarak_aspek).sum())
    if n_kosong:
        jarak_aspek = np.where(np.isnan(jarak_aspek), 1.0, jarak_aspek)
    jarak_aspek = (jarak_aspek + jarak_aspek.T) / 2
    jarak_aspek = np.clip(jarak_aspek, 0, None)
    np.fill_diagonal(jarak_aspek, 0)
    return jarak_aspek, n_kosong


def mds_aspek(jarak_aspek: np.ndarray, kolom_aspek: list[str], n_components: int = 2) -> tuple[pd.DataFrame, float, np.ndarray]:
    koordinat_aspek = fit_mds(jarak_aspek, n_components=n_components, n_init=10)
    stress_aspek = hitung_stress1(jarak_aspek, koordinat_aspek)
    data = {"aspek": kolom_aspek}
    for d in range(n_components):
        data[f"dim{d + 1}"] = koordinat_aspek[:, d].round(4)
    return pd.DataFrame(data), stress_aspek, koordinat_aspek


# ====================================================================== sel 19
def tabel_stress(baris: list[tuple[str, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "analisis": [nama for nama, _ in baris],
            "stress1": [round(nilai, 4) for _, nilai in baris],
            "interpretasi": [interpretasi_stress(nilai) for _, nilai in baris],
        }
    )


# ============================================ [perluasan] penyelarasan segmen
def selaraskan(koordinat: np.ndarray, acuan: np.ndarray) -> np.ndarray:
    """Rotasi/refleksi ortogonal (Procrustes) agar peta segmen searah peta "Semua".

    Hasil MDS bebas diputar/dicerminkan; tanpa penyelarasan titik "melompat"
    saat filter segmen diganti. Jarak antar titik (isi analisis) tidak berubah.
    """
    a = koordinat - koordinat.mean(axis=0)
    b = acuan - acuan.mean(axis=0)
    u, _, vt = np.linalg.svd(a.T @ b)
    return a @ (u @ vt)
