// Endpoint publik form kuisioner. Responden tidak perlu login; jawaban
// divalidasi di server lalu dikirim ke topik Kafka (bukan langsung ke database).
import express, { Router } from 'express';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { createRateLimiter } from '../rateLimit.js';
import { loadKontrak, ringkasanKelompok, skemaPublik } from './kontrak.js';
import { isUuid, validasiJawaban } from './validasi.js';

const DITERIMA_TTL_MS = 60 * 60_000;
const DITERIMA_MAKS = 10_000;

export function createKuesionerRouter({ producer, kontrak: kontrakOverride } = {}) {
  const router = Router();
  const limiter = createRateLimiter({ limit: config.kuesioner.rateLimitPerMinute, windowMs: 60_000 });
  // id_pengiriman yang baru diterima: kirim ulang (mis. koneksi putus saat menunggu
  // jawaban server) tidak menghasilkan pesan ganda. Deduplikasi akhir di consumer.
  const diterima = new Map();

  const kontrak = () => {
    try {
      return kontrakOverride ?? loadKontrak();
    } catch (error) {
      console.error('[kuesioner] kontrak tidak terbaca:', error.message);
      throw new HttpError(503, 'Form kuisioner sedang tidak tersedia.');
    }
  };

  router.get('/', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ kelompok: ringkasanKelompok(kontrak()) });
  });

  router.get('/:group', (req, res) => {
    const skema = skemaPublik(kontrak(), req.params.group);
    if (!skema) throw new HttpError(404, 'Kuisioner tidak ditemukan.');
    res.set('Cache-Control', 'public, max-age=300');
    res.json(skema);
  });

  router.post('/:group', express.json({ limit: '256kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const k = kontrak();
    const key = req.params.group;
    if (!k.kelompok[key]) throw new HttpError(404, 'Kuisioner tidak ditemukan.');

    const gate = limiter.hit(req.ip);
    if (!gate.allowed) {
      res.set('Retry-After', String(gate.retryAfterSeconds));
      throw new HttpError(429, 'Terlalu banyak pengiriman dari jaringan ini. Coba lagi sebentar lagi.');
    }
    const body = req.body ?? {};
    // Honeypot: kolom tersembunyi yang hanya diisi bot.
    if (typeof body.situs_web === 'string' && body.situs_web.trim()) {
      return res.status(202).json({ status: 'diterima' });
    }
    if (!isUuid(body.id_pengiriman)) throw new HttpError(400, 'id_pengiriman harus UUID.');
    if (body.versi !== undefined && body.versi !== k.versi) {
      throw new HttpError(409, 'Form telah diperbarui. Muat ulang halaman lalu kirim kembali.');
    }

    const id = body.id_pengiriman.toLowerCase();
    const sebelumnya = diterima.get(id);
    if (sebelumnya && Date.now() - sebelumnya.at < DITERIMA_TTL_MS) {
      return res.status(200).json({ status: 'sudah_diterima', id_respons: id, diterima_pada: sebelumnya.iso });
    }

    const waktu = new Date();
    const { galat, baris } = validasiJawaban(k, key, body.jawaban, { waktu });
    if (Object.keys(galat).length) {
      throw new HttpError(422, 'Masih ada jawaban yang belum lengkap atau tidak sesuai.', { galat });
    }
    if (!producer) throw new HttpError(503, 'Layanan penerimaan respons belum dikonfigurasi.');

    const pesan = {
      versi: 1,
      versi_kontrak: k.versi,
      id_respons: id,
      kelompok: key,
      sumber: 'form_web',
      diterima_pada: waktu.toISOString(),
      baris,
    };
    try {
      await producer.send({ key, value: pesan, headers: { kelompok: key } });
    } catch (error) {
      console.error(`[kuesioner] gagal mengirim ke Kafka (${key}):`, error.message);
      throw new HttpError(
        503,
        'Respons belum dapat diterima karena layanan sedang sibuk. Jawaban Anda tetap tersimpan di perangkat ini — coba kirim lagi.',
      );
    }
    diterima.set(id, { at: Date.now(), iso: pesan.diterima_pada });
    if (diterima.size > DITERIMA_MAKS) diterima.delete(diterima.keys().next().value);
    return res.status(202).json({ status: 'diterima', id_respons: id, diterima_pada: pesan.diterima_pada });
  });

  return router;
}
