// Validasi jawaban form web & susun baris respons persis seperti sheet Google Form.
//
// Format `jawaban` dari browser (kunci = id pertanyaan):
//   teks_singkat / paragraf : "teks"
//   pilihan_ganda / dropdown : "opsi"  atau { "lainnya": "teks isian" }
//   kotak_centang            : ["opsi", ..., { "lainnya": "teks isian" }]
//   grid                     : { "<id baris>": "label skala", ... }
import { daftarPertanyaan, urutanKolom } from './kontrak.js';

export const MAKS_TEKS = { teks_singkat: 300, paragraf: 5000, lainnya: 200 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Rapikan teks: NFC, buang karakter kontrol (kecuali baris baru/tab), trim. */
export function bersihkanTeks(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

const isLainnya = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 'lainnya' in v;

/** Bagian yang dilalui responden, mengikuti percabangan `lompat` (mis. Klinik: Tidak -> Saran). */
export function bagianDilalui(kelompok, jawaban) {
  const ids = kelompok.bagian.map((b) => b.id);
  const dilalui = [];
  let i = 0;
  const batas = ids.length + 1;
  while (i < ids.length && dilalui.length < batas) {
    const bagian = kelompok.bagian[i];
    dilalui.push(bagian.id);
    let target = null;
    for (const q of bagian.pertanyaan) {
      const nilai = jawaban?.[q.id];
      if (q.lompat && typeof nilai === 'string' && q.lompat[nilai]) target = q.lompat[nilai];
    }
    const next = target ? ids.indexOf(target) : i + 1;
    i = next > i ? next : i + 1; // lompat hanya ke depan
  }
  return new Set(dilalui);
}

function validasiTeks(q, value, galat) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    galat[q.id] = 'Jawaban harus berupa teks.';
    return '';
  }
  const teks = bersihkanTeks(value);
  const maks = q.validasi?.maks ?? MAKS_TEKS[q.jenis] ?? 300;
  if (!teks) {
    if (q.wajib) galat[q.id] = 'Pertanyaan ini wajib diisi.';
    return '';
  }
  if (teks.length > maks) galat[q.id] = `Maksimal ${maks} karakter.`;
  else if (q.validasi?.min && teks.length < q.validasi.min) galat[q.id] = q.validasi.pesan ?? `Minimal ${q.validasi.min} karakter.`;
  else if (q.validasi?.pola && !new RegExp(q.validasi.pola).test(teks.replace(/[\s-]/g, ''))) {
    galat[q.id] = q.validasi.pesan ?? 'Format jawaban tidak sesuai.';
  }
  if (q.validasi?.pola) return teks.replace(/[\s-]/g, '');
  return teks;
}

function validasiPilihan(q, value, galat) {
  if (value === undefined || value === null || value === '') {
    if (q.wajib) galat[q.id] = 'Pilih salah satu jawaban.';
    return '';
  }
  if (isLainnya(value)) {
    if (!q.lainnya) {
      galat[q.id] = 'Pilihan tidak tersedia.';
      return '';
    }
    const teks = bersihkanTeks(value.lainnya);
    if (!teks) galat[q.id] = 'Isi jawaban "Yang lain".';
    else if (teks.length > MAKS_TEKS.lainnya) galat[q.id] = `Maksimal ${MAKS_TEKS.lainnya} karakter.`;
    return teks;
  }
  if (typeof value !== 'string' || !q.opsi.includes(value)) {
    galat[q.id] = 'Pilihan tidak tersedia.';
    return '';
  }
  return value;
}

function validasiCentang(q, value, galat, pemisah) {
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
    if (q.wajib) galat[q.id] = 'Pilih minimal satu jawaban.';
    return '';
  }
  if (!Array.isArray(value)) {
    galat[q.id] = 'Format jawaban tidak sesuai.';
    return '';
  }
  const dipilih = new Set();
  let lainnya = '';
  for (const item of value) {
    if (isLainnya(item)) {
      if (!q.lainnya) {
        galat[q.id] = 'Pilihan tidak tersedia.';
        return '';
      }
      lainnya = bersihkanTeks(item.lainnya);
      if (!lainnya) {
        galat[q.id] = 'Isi jawaban "Yang lain".';
        return '';
      }
      if (lainnya.length > MAKS_TEKS.lainnya) {
        galat[q.id] = `Maksimal ${MAKS_TEKS.lainnya} karakter.`;
        return '';
      }
    } else if (typeof item === 'string' && q.opsi.includes(item)) {
      dipilih.add(item);
    } else {
      galat[q.id] = 'Pilihan tidak tersedia.';
      return '';
    }
  }
  const jumlah = dipilih.size + (lainnya ? 1 : 0);
  if (q.maks_pilihan && jumlah > q.maks_pilihan) {
    galat[q.id] = `Pilih maksimal ${q.maks_pilihan} jawaban.`;
    return '';
  }
  if (q.wajib && jumlah === 0) {
    galat[q.id] = 'Pilih minimal satu jawaban.';
    return '';
  }
  // Google Sheets menyimpan pilihan sesuai urutan opsi form, lalu isian "Yang lain".
  return [...q.opsi.filter((o) => dipilih.has(o)), ...(lainnya ? [lainnya] : [])].join(pemisah);
}

function validasiGrid(q, value, galat) {
  const hasil = {};
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (value !== undefined && value !== null && obj !== value) galat[q.id] = 'Format jawaban tidak sesuai.';
  let kosong = 0;
  for (const baris of q.baris) {
    const v = obj[baris.id];
    if (v === undefined || v === null || v === '') {
      kosong += 1;
      hasil[baris.kolom] = '';
      continue;
    }
    if (typeof v !== 'string' || !q.skala.includes(v)) {
      galat[`${q.id}.${baris.id}`] = 'Pilihan tidak tersedia.';
      hasil[baris.kolom] = '';
      continue;
    }
    hasil[baris.kolom] = v;
  }
  if (q.wajib && kosong) {
    galat[q.id] = kosong === q.baris.length ? 'Beri penilaian untuk setiap pernyataan.' : `${kosong} pernyataan belum dinilai.`;
  }
  return hasil;
}

/** Format waktu sheet (zona Asia/Jakarta) mis. "2026-11-16 10:20:30". */
export function formatWaktu(date, zona = 'Asia/Jakarta') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Validasi jawaban suatu kelompok. Hasil: { galat, baris } — `baris` = satu baris
 * sheet respons (kunci = judul kolom persis), siap dikirim ke Kafka.
 */
export function validasiJawaban(kontrak, key, jawaban, { waktu = new Date() } = {}) {
  const kelompok = kontrak.kelompok[key];
  if (!kelompok) return { galat: { _kelompok: 'Kelompok responden tidak dikenal.' }, baris: null };
  const galat = {};
  if (!jawaban || typeof jawaban !== 'object' || Array.isArray(jawaban)) {
    return { galat: { _form: 'Format jawaban tidak sesuai.' }, baris: null };
  }
  const pemisah = kontrak.pemisah_pilihan ?? ', ';
  const dilalui = bagianDilalui(kelompok, jawaban);
  const isi = {};
  for (const q of daftarPertanyaan(kelompok)) {
    const aktif = dilalui.has(q.bagian);
    const value = aktif ? jawaban[q.id] : undefined;
    const qq = aktif ? q : { ...q, wajib: false };
    switch (q.jenis) {
      case 'teks_singkat':
      case 'paragraf':
        isi[q.kolom] = validasiTeks(qq, value, galat);
        break;
      case 'pilihan_ganda':
      case 'dropdown':
        isi[q.kolom] = validasiPilihan(qq, value, galat);
        break;
      case 'kotak_centang':
        isi[q.kolom] = validasiCentang(qq, value, galat, pemisah);
        break;
      case 'grid':
        Object.assign(isi, validasiGrid(qq, value, galat));
        break;
      default:
        throw new Error(`Jenis pertanyaan tidak dikenal: ${q.jenis}`);
    }
  }
  const baris = {};
  for (const kolom of urutanKolom(kontrak, kelompok)) {
    baris[kolom] = kolom === kontrak.kolom_waktu ? formatWaktu(waktu, kontrak.zona_waktu) : (isi[kolom] ?? '');
  }
  return { galat, baris };
}

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);
