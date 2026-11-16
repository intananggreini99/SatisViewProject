import pg from 'pg';
import { config } from './config.js';

// BIGINT (int8) dikembalikan sebagai number agar mudah dipakai frontend.
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

const pools = new Map();

export function getPool(database) {
  if (!pools.has(database)) {
    const pool = new pg.Pool({
      host: config.pg.host,
      port: config.pg.port,
      user: config.pg.user,
      password: config.pg.password,
      database,
      max: config.pg.maxPerDatabase,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'satisview-api',
    });
    pool.on('error', (err) => console.error(`[db:${database}] idle client error`, err.message));
    pools.set(database, pool);
  }
  return pools.get(database);
}

export async function query(database, text, params = []) {
  const result = await getPool(database).query(text, params);
  return result.rows;
}

/** Kode error PostgreSQL yang berarti "belum ada data" (database/tabel belum dibuat pipeline). */
const MISSING_CODES = new Set(['3D000', '42P01']);

export function isMissingData(error) {
  return MISSING_CODES.has(error?.code);
}

/** Daftar tabel yang ada di database (kosong bila database belum dibuat). */
export async function listTables(database) {
  try {
    const rows = await query(
      database,
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    return new Set(rows.map((row) => row.tablename));
  } catch (error) {
    if (isMissingData(error)) return new Set();
    throw error;
  }
}

export async function closeAll() {
  await Promise.allSettled([...pools.values()].map((pool) => pool.end()));
  pools.clear();
}
