// Bangun jawaban lengkap & valid dari skema publik kuisioner (untuk pengujian).
import crypto from 'node:crypto';

export function jawabanLengkap(skema, { pilih = 0, lompatKlinik = false } = {}) {
  const jawaban = {};
  for (const bagian of skema.bagian) {
    for (const q of bagian.pertanyaan) {
      switch (q.jenis) {
        case 'teks_singkat':
          jawaban[q.id] = q.validasi?.pola ? '0812 3456 7890' : 'PT Uji Coba Sejahtera';
          break;
        case 'paragraf':
          jawaban[q.id] = 'Pelayanan cukup baik, mohon ditingkatkan lagi.';
          break;
        case 'pilihan_ganda':
        case 'dropdown':
          jawaban[q.id] = q.lompat && lompatKlinik ? Object.keys(q.lompat)[0] : q.opsi[pilih % q.opsi.length];
          break;
        case 'kotak_centang':
          jawaban[q.id] = q.opsi.slice(0, Math.min(2, q.maks_pilihan ?? 2));
          break;
        case 'grid':
          jawaban[q.id] = Object.fromEntries(q.baris.map((b, i) => [b.id, q.skala[(pilih + i) % q.skala.length]]));
          break;
        default:
          throw new Error(q.jenis);
      }
    }
  }
  return jawaban;
}

export const idBaru = () => crypto.randomUUID();
