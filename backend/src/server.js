import { createApp } from './app.js';
import { createAuthService } from './auth/service.js';
import { createPgUserStore } from './auth/users.js';
import { config } from './config.js';
import { closeAll } from './db.js';
import { createKafkaProducer } from './kuesioner/producer.js';

const userStore = createPgUserStore();
const auth = createAuthService({ store: userStore });
const producer = createKafkaProducer();
const app = createApp({ auth, producer });

if (config.auth.jwtSecretGenerated) {
  console.warn('[satisview-api] JWT_SECRET belum diisi (min. 32 karakter): sesi login hilang setiap API dimulai ulang.');
}

// Akun admin awal dari SATISVIEW_ADMIN_USERNAME/PASSWORD. Dicoba ulang karena
// PostgreSQL/migrasi bisa belum siap saat API baru menyala.
async function bootstrapAdmin(attempt = 1) {
  try {
    const hasil = await auth.bootstrapAdmin();
    if (hasil.status === 'dibuat') console.log(`[satisview-api] akun admin '${hasil.username}' dibuat.`);
    if (hasil.status === 'lewati') {
      console.log('[satisview-api] SATISVIEW_ADMIN_USERNAME/PASSWORD kosong: buat akun lewat `npm run pengguna`.');
    }
  } catch (error) {
    if (attempt >= 10) return console.error('[satisview-api] gagal membuat akun admin awal:', error.message);
    setTimeout(() => bootstrapAdmin(attempt + 1), Math.min(30_000, 2_000 * attempt)).unref();
  }
}

const server = app.listen(config.port, () => {
  console.log(`[satisview-api] berjalan di port ${config.port} (PostgreSQL ${config.pg.host}:${config.pg.port})`);
  bootstrapAdmin();
});

const shutdown = async (signal) => {
  console.log(`[satisview-api] ${signal} diterima, menutup koneksi...`);
  server.close(async () => {
    await Promise.allSettled([closeAll(), userStore.close(), producer.close()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
