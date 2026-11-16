// Kontrak kuisioner (contracts/kuesioner.json): isi form = isi Google Form tim.
import fs from 'node:fs';
import { config } from '../config.js';

let cached = null;

export function loadKontrak(file = config.kuesioner.kontrakPath) {
  if (cached?.file === file) return cached.kontrak;
  const kontrak = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!kontrak?.kelompok || typeof kontrak.kelompok !== 'object') {
    throw new Error(`Kontrak kuisioner tidak valid: ${file}`);
  }
  cached = { file, kontrak };
  return kontrak;
}

/** Semua pertanyaan suatu kelompok, berurutan, beserta id bagiannya. */
export function daftarPertanyaan(kelompok) {
  return kelompok.bagian.flatMap((bagian) => bagian.pertanyaan.map((q) => ({ ...q, bagian: bagian.id })));
}

/** Urutan kolom sheet respons: kolom waktu lalu kolom tiap pertanyaan/baris grid. */
export function urutanKolom(kontrak, kelompok) {
  const kolom = [kontrak.kolom_waktu];
  for (const q of daftarPertanyaan(kelompok)) {
    if (q.jenis === 'grid') kolom.push(...q.baris.map((b) => b.kolom));
    else kolom.push(q.kolom);
  }
  return kolom;
}

/** Versi untuk browser: tanpa nama kolom sheet (detail internal pipeline). */
export function skemaPublik(kontrak, key) {
  const kelompok = kontrak.kelompok[key];
  if (!kelompok) return null;
  const { form_google: formGoogle, bagian, ...rest } = kelompok;
  return {
    versi: kontrak.versi,
    key,
    ...rest,
    sumber: formGoogle?.judul ?? null,
    bagian: bagian.map((b) => ({
      ...b,
      pertanyaan: b.pertanyaan.map((q) => {
        // eslint-disable-next-line no-unused-vars
        const { kolom, ...publik } = q;
        if (q.jenis === 'grid') {
          return { ...publik, baris: q.baris.map((row) => ({ id: row.id, teks: row.teks })) };
        }
        return publik;
      }),
    })),
  };
}

export function ringkasanKelompok(kontrak) {
  return Object.entries(kontrak.kelompok).map(([key, k]) => {
    const pertanyaan = daftarPertanyaan(k);
    return {
      key,
      label: k.label,
      judul: k.judul,
      jumlah_bagian: k.bagian.length,
      jumlah_butir: pertanyaan.reduce((n, q) => n + (q.jenis === 'grid' ? q.baris.length : 1), 0),
    };
  });
}
