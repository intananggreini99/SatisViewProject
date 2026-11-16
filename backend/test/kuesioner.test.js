import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { loadKontrak } from '../src/kuesioner/kontrak.js';
import { bagianDilalui, formatWaktu, validasiJawaban } from '../src/kuesioner/validasi.js';
import { idBaru, jawabanLengkap } from './helpers/jawaban.js';
import { startApp } from './helpers/setup.js';

const kontrak = loadKontrak();
// Judul kolom sheet respons ASLI (Google Drive "Data Responden").
const kolomSheet = JSON.parse(fs.readFileSync(new URL('../../airflow/tests/data/kolom_sheet_asli.json', import.meta.url)));
const KELOMPOK = Object.keys(kontrak.kelompok);

let ctx;
const post = (group, body) =>
  fetch(`${ctx.base}/kuesioner/${group}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const skema = async (group) => (await fetch(`${ctx.base}/kuesioner/${group}`)).json();

before(async () => {
  ctx = await startApp();
});
after(() => ctx.close());

describe('skema kuisioner publik', () => {
  it('lima kelompok tersedia', async () => {
    const data = await (await fetch(`${ctx.base}/kuesioner`)).json();
    assert.deepEqual(data.kelompok.map((k) => k.key), KELOMPOK);
    for (const k of data.kelompok) assert.ok(k.jumlah_butir > 5, k.key);
  });

  it('skema tanpa nama kolom sheet & kelompok tak dikenal -> 404', async () => {
    const s = await skema('mahasiswa');
    assert.ok(!JSON.stringify(s).includes('"kolom"'));
    assert.equal(s.judul, 'Survei Kepuasan Mahasiswa terhadap Layanan dan Fasilitas Kampus PENS');
    assert.equal((await fetch(`${ctx.base}/kuesioner/alumni`)).status, 404);
  });
});

describe('pengiriman respons -> Kafka', () => {
  for (const group of KELOMPOK) {
    it(`${group}: jawaban lengkap diterima, baris = kolom sheet asli`, async () => {
      const s = await skema(group);
      const id = idBaru();
      const res = await post(group, { id_pengiriman: id, versi: s.versi, jawaban: jawabanLengkap(s) });
      assert.equal(res.status, 202, JSON.stringify(await res.clone().json()));
      const pesan = ctx.producer.sent.at(-1);
      assert.equal(pesan.key, group);
      assert.equal(pesan.value.id_respons, id);
      assert.equal(pesan.value.kelompok, group);
      assert.deepEqual(Object.keys(pesan.value.baris), kolomSheet[group]);
      assert.match(pesan.value.baris.Timestamp, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  }

  it('nilai sel disusun seperti Google Sheets (centang berurutan opsi, Gopay dirapikan)', async () => {
    const s = await skema('mahasiswa');
    const jawaban = jawabanLengkap(s);
    jawaban.prioritas = ['Parkir', 'Administrasi Akademik', 'Toilet']; // urutan klik berbeda
    const res = await post('mahasiswa', { id_pengiriman: idBaru(), jawaban });
    assert.equal(res.status, 202);
    const baris = ctx.producer.sent.at(-1).value.baris;
    const kolomPrioritas = kolomSheet.mahasiswa.find((k) => k.startsWith('Menurut Anda, layanan atau fasilitas mana'));
    assert.equal(baris[kolomPrioritas], 'Administrasi Akademik, Toilet, Parkir');
    assert.equal(baris['Nomor Gopay'], '081234567890');
    assert.equal(baris['Semester'], '1');
  });

  it('Klinik "Tidak" -> bagian penilaian klinik dilewati & dikosongkan', async () => {
    const s = await skema('mahasiswa');
    const jawaban = jawabanLengkap(s);
    jawaban.pernah_klinik = 'Tidak';
    delete jawaban.penilaian_klinik;
    const res = await post('mahasiswa', { id_pengiriman: idBaru(), jawaban });
    assert.equal(res.status, 202);
    const baris = ctx.producer.sent.at(-1).value.baris;
    const klinik = Object.keys(baris).filter((k) => k.startsWith('Bagaimana penilaian Anda terhadap aspek layanan Klinik'));
    assert.equal(klinik.length, 9);
    assert.ok(klinik.every((k) => baris[k] === ''));
    // "Ya" tanpa penilaian klinik -> ditolak
    jawaban.pernah_klinik = 'Ya';
    const res2 = await post('mahasiswa', { id_pengiriman: idBaru(), jawaban });
    assert.equal(res2.status, 422);
    assert.ok((await res2.json()).galat.penilaian_klinik);
  });

  it('wajib kosong, opsi palsu, lebih dari 3 pilihan -> 422 dengan galat per pertanyaan', async () => {
    const s = await skema('dosen');
    const jawaban = jawabanLengkap(s);
    delete jawaban.departemen;
    jawaban.administrasi_akademik.b1 = 'Lumayan';
    delete jawaban.administrasi_akademik.b2;
    jawaban.prioritas = ['Administrasi Akademik', 'Kemahasiswaan', 'Laboratorium', 'Administrasi Umum'];
    const res = await post('dosen', { id_pengiriman: idBaru(), jawaban });
    assert.equal(res.status, 422);
    const { galat } = await res.json();
    assert.ok(galat.departemen);
    assert.ok(galat['administrasi_akademik.b1']);
    assert.match(galat.administrasi_akademik, /belum dinilai/);
    assert.match(galat.prioritas, /maksimal 3/i);
  });

  it('opsi "Yang lain" hanya pada pertanyaan yang mengizinkannya', async () => {
    const s = await skema('mitra_kerjasama');
    const jawaban = jawabanLengkap(s);
    jawaban.jenis_instansi = { lainnya: 'Lembaga Pendidikan' };
    jawaban.bentuk_kerja_sama = ['Magang', { lainnya: 'Masih awal' }, 'Penelitian'];
    assert.equal((await post('mitra_kerjasama', { id_pengiriman: idBaru(), jawaban })).status, 202);
    const baris = ctx.producer.sent.at(-1).value.baris;
    assert.equal(baris['Jenis Instansi'], 'Lembaga Pendidikan');
    assert.equal(baris['Bentuk kerja sama yang pernah dilakukan'], 'Penelitian, Magang, Masih awal');
    jawaban.lama_kerja_sama = { lainnya: '10 tahun' };
    const res = await post('mitra_kerjasama', { id_pengiriman: idBaru(), jawaban });
    assert.equal(res.status, 422);
    assert.ok((await res.json()).galat.lama_kerja_sama);
  });

  it('pertanyaan opsional boleh kosong (Karyawan: Unit Kerja & saran)', async () => {
    const s = await skema('karyawan');
    const jawaban = jawabanLengkap(s);
    delete jawaban.unit_kerja;
    delete jawaban.saran_perbaikan;
    delete jawaban.pengembangan_karier;
    assert.equal((await post('karyawan', { id_pengiriman: idBaru(), jawaban })).status, 202);
    assert.equal(ctx.producer.sent.at(-1).value.baris['Unit Kerja'], '');
  });

  it('kirim ulang dengan id yang sama tidak menggandakan pesan', async () => {
    const s = await skema('dosen');
    const body = { id_pengiriman: idBaru(), jawaban: jawabanLengkap(s) };
    const n = ctx.producer.sent.length;
    assert.equal((await post('dosen', body)).status, 202);
    const kedua = await post('dosen', body);
    assert.equal(kedua.status, 200);
    assert.equal((await kedua.json()).status, 'sudah_diterima');
    assert.equal(ctx.producer.sent.length, n + 1);
  });

  it('Kafka tidak tersedia -> 503 & boleh dikirim ulang dengan id yang sama', async () => {
    const s = await skema('mitra_pengadaan');
    const body = { id_pengiriman: idBaru(), jawaban: jawabanLengkap(s) };
    ctx.producer.fail = true;
    const res = await post('mitra_pengadaan', body);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /tersimpan di perangkat/);
    ctx.producer.fail = false;
    assert.equal((await post('mitra_pengadaan', body)).status, 202);
  });

  it('id bukan UUID / versi lama / JSON rusak / honeypot', async () => {
    const s = await skema('dosen');
    assert.equal((await post('dosen', { id_pengiriman: '123', jawaban: {} })).status, 400);
    assert.equal((await post('dosen', { id_pengiriman: idBaru(), versi: 999, jawaban: {} })).status, 409);
    const n = ctx.producer.sent.length;
    const bot = await post('dosen', { id_pengiriman: idBaru(), situs_web: 'http://spam', jawaban: jawabanLengkap(s) });
    assert.equal(bot.status, 202);
    assert.equal(ctx.producer.sent.length, n);
    const rusak = await fetch(`${ctx.base}/kuesioner/dosen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"id_pengiriman":',
    });
    assert.equal(rusak.status, 400);
  });

  it('teks dibersihkan dari karakter kontrol & dibatasi panjangnya', () => {
    const s = kontrak;
    const jawaban = jawabanLengkap(JSON.parse(JSON.stringify({ ...s.kelompok.dosen, versi: 1 })));
    jawaban.saran_perbaikan = '  Baik\u0000 sekali\r\n ';
    let hasil = validasiJawaban(s, 'dosen', jawaban);
    assert.deepEqual(hasil.galat, {});
    assert.equal(hasil.baris[s.kelompok.dosen.bagian[3].pertanyaan[0].kolom], 'Baik sekali');
    jawaban.saran_perbaikan = 'x'.repeat(5001);
    hasil = validasiJawaban(s, 'dosen', jawaban);
    assert.match(hasil.galat.saran_perbaikan, /Maksimal 5000/);
  });
});

describe('fungsi validasi', () => {
  it('percabangan hanya ke depan & tidak berulang', () => {
    const k = kontrak.kelompok.mahasiswa;
    assert.ok(!bagianDilalui(k, { pernah_klinik: 'Tidak' }).has('penilaian_klinik'));
    assert.ok(bagianDilalui(k, { pernah_klinik: 'Ya' }).has('penilaian_klinik'));
    assert.equal(bagianDilalui(k, {}).size, k.bagian.length);
  });
  it('format waktu WIB', () => {
    assert.equal(formatWaktu(new Date('2026-11-16T03:04:05Z')), '2026-11-16 10:04:05');
  });
});
