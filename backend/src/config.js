// Konfigurasi API SatisView dari environment variable.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value, fallback) =>
  (value ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const here = path.dirname(fileURLToPath(import.meta.url));

function jwtSecret() {
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length >= 32) return { secret, generated: false };
  // Tanpa JWT_SECRET token tetap aman, tetapi semua sesi login hilang saat API dimulai ulang.
  return { secret: crypto.randomBytes(48).toString('base64url'), generated: true };
}

const jwt = jwtSecret();

export const config = {
  port: int(process.env.PORT, 4000),
  // Jumlah reverse proxy tepercaya di depan API (nginx frontend = 1). Dipakai untuk
  // membaca IP asli pengunjung (batas login & batas kirim form per IP).
  trustProxyHops: int(process.env.TRUST_PROXY_HOPS, 1),
  pg: {
    host: process.env.PGHOST ?? 'postgres',
    port: int(process.env.PGPORT, 5432),
    user: process.env.PGUSER ?? 'satisview',
    password: process.env.PGPASSWORD ?? 'satisview',
    maxPerDatabase: int(process.env.PG_POOL_MAX, 4),
  },
  rawDb: process.env.RAW_DB ?? 'raw_data',
  webhdfsUrl: (process.env.WEBHDFS_URL ?? 'http://namenode:9870/webhdfs/v1').replace(/\/$/, ''),
  hdfsUser: process.env.HDFS_USER ?? 'root',
  reportPath: process.env.HDFS_REPORT_PATH ?? '/satisview/report/SatisView_Report.pdf',
  cacheTtlMs: int(process.env.CACHE_TTL_SECONDS, 30) * 1000,
  // Sama dengan SATISVIEW_MIN_RESPONDEN_MDS di pipeline (untuk pesan "MDS dilewati").
  minRespondenMds: int(process.env.SATISVIEW_MIN_RESPONDEN_MDS, 10),

  // ---- Login pengelola (JWT) ------------------------------------------------
  auth: {
    // Akun pengelola disimpan di tabel auth.pengguna (database AUTH_DB) dan
    // diakses dengan role khusus (bukan role baca-saja dashboard).
    db: process.env.AUTH_DB ?? process.env.POSTGRES_DB ?? 'satisview',
    user: process.env.AUTH_DB_USER ?? 'satisview_auth',
    password: process.env.AUTH_DB_PASSWORD ?? 'satisview_auth',
    jwtSecret: jwt.secret,
    jwtSecretGenerated: jwt.generated,
    jwtTtlSeconds: int(process.env.JWT_TTL_MINUTES, 480) * 60,
    issuer: 'satisview-api',
    audience: 'satisview-dashboard',
    // Kunci akun sementara setelah beberapa kali salah password.
    maxFailedLogins: int(process.env.AUTH_MAX_FAILED_LOGINS, 5),
    lockMinutes: int(process.env.AUTH_LOCK_MINUTES, 15),
    // Akun admin awal (dibuat sekali bila username belum ada).
    bootstrap: {
      username: (process.env.SATISVIEW_ADMIN_USERNAME ?? '').trim().toLowerCase(),
      password: process.env.SATISVIEW_ADMIN_PASSWORD ?? '',
      nama: process.env.SATISVIEW_ADMIN_NAMA ?? 'Administrator SatisView',
    },
  },

  // ---- Form kuisioner -> Kafka ---------------------------------------------
  kuesioner: {
    kontrakPath:
      process.env.SATISVIEW_KUESIONER_FILE ?? path.resolve(here, '../../contracts/kuesioner.json'),
    // Batas pengiriman per IP (banyak responden kampus berbagi IP Wi-Fi, jadi longgar).
    rateLimitPerMinute: int(process.env.KUESIONER_RATE_LIMIT_PER_MINUTE, 60),
  },
  kafka: {
    brokers: list(process.env.KAFKA_BROKERS, 'kafka:9092'),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'satisview-api',
    topic: process.env.KAFKA_TOPIC_RESPONS ?? 'satisview.kuesioner.respons',
    connectionTimeoutMs: int(process.env.KAFKA_CONNECTION_TIMEOUT_MS, 5000),
    requestTimeoutMs: int(process.env.KAFKA_REQUEST_TIMEOUT_MS, 15000),
  },
};
