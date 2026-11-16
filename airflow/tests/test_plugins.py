import pytest

from satisview import plugins
from satisview.respondents import get_group
from satisview.validation import validate_analysis, validate_preprocessed


def test_bawaan_menjalankan_kode_tim():
    assert plugins.get_preprocessor().__module__ == "satisview.preprocessing"
    assert plugins.get_analyzer().__module__ == "satisview.analysis"


def test_adapter_contoh_dapat_menggantikan_modul_bawaan(monkeypatch, sample_frames):
    monkeypatch.setattr("satisview.config.PREPROCESSING_MODULE", "satisview.custom.contoh_adapter")
    monkeypatch.setattr("satisview.config.ANALYSIS_MODULE", "satisview.custom.contoh_adapter")
    preprocess = plugins.get_preprocessor()
    analyze = plugins.get_analyzer()
    assert preprocess.__module__ == analyze.__module__ == "satisview.custom.contoh_adapter"
    group = get_group("mitra_pengadaan")
    tabel, meta = preprocess(sample_frames["mitra_pengadaan"], group)
    assert validate_preprocessed(tabel, meta, group.key).passed
    hasil, info = analyze(tabel, meta, group)
    assert validate_analysis(hasil, meta, group.key, info=info).passed


def test_fungsi_hilang_pesan_jelas(monkeypatch):
    monkeypatch.setattr("satisview.config.ANALYSIS_MODULE", "satisview.naming")
    with pytest.raises(AttributeError, match="run_analysis"):
        plugins.get_analyzer()
