// Logika form kuisioner di browser: halaman, percabangan, validasi, dan draf.
// Aturannya sama dengan validasi server (backend/src/kuesioner/validasi.js);
// server tetap memeriksa ulang setiap pengiriman.

export const MAKS_TEKS = { teks_singkat: 300, paragraf: 5000, lainnya: 200 };

/** Halaman form seperti Google Forms: halaman 1 = judul & deskripsi form (+ bagian tanpa judul). */
export function susunHalaman(skema) {
  const [pertama, ...lain] = skema.bagian;
  if (pertama && !pertama.judul) {
    return [{ id: pertama.id, pembuka: true, bagian: pertama }, ...lain.map((b) => ({ id: b.id, pembuka: false, bagian: b }))];
  }
  return [{ id: '_pembuka', pembuka: true, bagian: null }, ...skema.bagian.map((b) => ({ id: b.id, pembuka: false, bagian: b }))];
}

/** Indeks halaman berikutnya (mengikuti `lompat`, mis. Klinik: "Tidak" -> Saran dan Perbaikan). */
export function halamanBerikutnya(halaman, i, jawaban) {
  const sekarang = halaman[i];
  let target = null;
  for (const q of sekarang.bagian?.pertanyaan ?? []) {
    const nilai = jawaban[q.id];
    if (q.lompat && typeof nilai === 'string' && q.lompat[nilai]) target = q.lompat[nilai];
  }
  if (target) {
    const j = halaman.findIndex((h) => h.id === target);
    if (j > i) return j;
  }
  return i + 1 < halaman.length ? i + 1 : null;
}

/** Urutan halaman yang benar-benar dilalui dengan jawaban saat ini. */
export function jalurHalaman(halaman, jawaban) {
  const jalur = [];
  let i = 0;
  while (i !== null && i < halaman.length && jalur.length <= halaman.length) {
    jalur.push(i);
    i = halamanBerikutnya(halaman, i, jawaban);
  }
  return jalur;
}

const kosong = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
export const isLainnya = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 'lainnya' in v;

/** Validasi satu pertanyaan. Hasil: { [id | id.baris]: pesan } (kosong = valid). */
export function validasiPertanyaan(q, nilai) {
  const galat = {};
  switch (q.jenis) {
    case 'teks_singkat':
    case 'paragraf': {
      const teks = (nilai ?? '').trim();
      if (!teks) {
        if (q.wajib) galat[q.id] = 'Pertanyaan ini wajib diisi.';
        break;
      }
      const maks = q.validasi?.maks ?? MAKS_TEKS[q.jenis];
      if (teks.length > maks) galat[q.id] = `Maksimal ${maks} karakter.`;
      else if (q.validasi?.min && teks.length < q.validasi.min) galat[q.id] = q.validasi.pesan ?? `Minimal ${q.validasi.min} karakter.`;
      else if (q.validasi?.pola && !new RegExp(q.validasi.pola).test(teks.replace(/[\s-]/g, ''))) {
        galat[q.id] = q.validasi.pesan ?? 'Format jawaban tidak sesuai.';
      }
      break;
    }
    case 'pilihan_ganda':
    case 'dropdown':
      if (kosong(nilai)) {
        if (q.wajib) galat[q.id] = 'Pilih salah satu jawaban.';
      } else if (isLainnya(nilai) && !nilai.lainnya.trim()) galat[q.id] = 'Tuliskan jawaban "Yang lain".';
      break;
    case 'kotak_centang': {
      const daftar = Array.isArray(nilai) ? nilai : [];
      const lain = daftar.find(isLainnya);
      if (!daftar.length) {
        if (q.wajib) galat[q.id] = 'Pilih minimal satu jawaban.';
      } else if (lain && !lain.lainnya.trim()) galat[q.id] = 'Tuliskan jawaban "Yang lain".';
      else if (q.maks_pilihan && daftar.length > q.maks_pilihan) galat[q.id] = `Pilih maksimal ${q.maks_pilihan} jawaban.`;
      break;
    }
    case 'grid': {
      const isi = nilai ?? {};
      const belum = q.baris.filter((b) => !isi[b.id]);
      if (q.wajib && belum.length) {
        galat[q.id] = belum.length === q.baris.length ? 'Beri penilaian untuk setiap pernyataan.' : `${belum.length} pernyataan belum dinilai.`;
        for (const b of belum) galat[`${q.id}.${b.id}`] = 'Belum dinilai.';
      }
      break;
    }
    default:
      break;
  }
  return galat;
}

export function validasiHalaman(h, jawaban) {
  const galat = {};
  for (const q of h.bagian?.pertanyaan ?? []) Object.assign(galat, validasiPertanyaan(q, jawaban[q.id]));
  return galat;
}

/** Jawaban untuk dikirim: hanya bagian yang dilalui (bagian yang dilewati tidak ikut). */
export function jawabanTerkirim(halaman, jawaban) {
  const dilalui = new Set(jalurHalaman(halaman, jawaban).map((i) => halaman[i].id));
  const hasil = {};
  for (const h of halaman) {
    if (!dilalui.has(h.id)) continue;
    for (const q of h.bagian?.pertanyaan ?? []) {
      const v = jawaban[q.id];
      if (!kosong(v)) hasil[q.id] = typeof v === 'string' ? v.trim() : v;
    }
  }
  return hasil;
}

/** Halaman yang memuat pertanyaan (untuk galat dari server). */
export function halamanDariGalat(halaman, galat) {
  const ids = Object.keys(galat).map((k) => k.split('.')[0]);
  return halaman.findIndex((h) => h.bagian?.pertanyaan.some((q) => ids.includes(q.id)));
}

export function buatId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- Draf (disimpan di perangkat responden; hilang setelah terkirim) ----------------
const kunciDraf = (kelompok) => `satisview.draf.${kelompok}`;

export function bacaDraf(kelompok, versi) {
  try {
    const d = JSON.parse(window.localStorage.getItem(kunciDraf(kelompok)) ?? 'null');
    if (d && d.versi === versi && d.id && d.jawaban) return d;
  } catch {
    /* penyimpanan tidak tersedia */
  }
  return null;
}

export function simpanDraf(kelompok, draf) {
  try {
    window.localStorage.setItem(kunciDraf(kelompok), JSON.stringify({ ...draf, disimpan: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function hapusDraf(kelompok) {
  try {
    window.localStorage.removeItem(kunciDraf(kelompok));
  } catch {
    /* abaikan */
  }
}

/** "**teks**" (format tebal Google Form) -> potongan { teks, tebal }. */
export function potongTebal(teks) {
  return String(teks)
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((p) => (p.startsWith('**') && p.endsWith('**') ? { teks: p.slice(2, -2), tebal: true } : { teks: p, tebal: false }));
}
