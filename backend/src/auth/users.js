// Penyimpanan akun pengelola dashboard (tabel auth.pengguna).
// Skema dibuat oleh layanan db-migrate (postgres/migrations/); API hanya
// membaca/menulis baris lewat role AUTH_DB_USER.
import pg from 'pg';
import { config } from '../config.js';

export const PERAN = ['admin', 'pimpinan', 'pengelola'];
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

const COLUMNS =
  'id, username, nama, peran, password_hash, aktif, gagal_login, terkunci_sampai, login_terakhir, password_diubah';

function toUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: row.username,
    nama: row.nama,
    peran: row.peran,
    passwordHash: row.password_hash,
    aktif: row.aktif,
    gagalLogin: row.gagal_login,
    terkunciSampai: row.terkunci_sampai ? new Date(row.terkunci_sampai) : null,
    loginTerakhir: row.login_terakhir ? new Date(row.login_terakhir) : null,
    passwordDiubah: new Date(row.password_diubah),
  };
}

export function createPgUserStore(poolConfig = {}) {
  const pool = new pg.Pool({
    host: config.pg.host,
    port: config.pg.port,
    user: config.auth.user,
    password: config.auth.password,
    database: config.auth.db,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'satisview-auth',
    ...poolConfig,
  });
  pool.on('error', (err) => console.error('[auth-db] idle client error', err.message));
  const q = async (text, params) => (await pool.query(text, params)).rows;

  return {
    async findByUsername(username) {
      return toUser((await q(`SELECT ${COLUMNS} FROM auth.pengguna WHERE username = $1`, [username]))[0]);
    },
    async create({ username, nama, peran, passwordHash }) {
      const rows = await q(
        `INSERT INTO auth.pengguna (username, nama, peran, password_hash) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [username, nama, peran, passwordHash],
      );
      return toUser(rows[0]);
    },
    async recordFailure(id, { maxFailed, lockMinutes }) {
      const rows = await q(
        `UPDATE auth.pengguna
            SET gagal_login = CASE WHEN gagal_login + 1 >= $2 THEN 0 ELSE gagal_login + 1 END,
                terkunci_sampai = CASE WHEN gagal_login + 1 >= $2
                                       THEN now() + make_interval(mins => $3) ELSE terkunci_sampai END
          WHERE id = $1
      RETURNING ${COLUMNS}`,
        [id, maxFailed, lockMinutes],
      );
      return toUser(rows[0]);
    },
    async recordSuccess(id) {
      await q(
        'UPDATE auth.pengguna SET gagal_login = 0, terkunci_sampai = NULL, login_terakhir = now() WHERE id = $1',
        [id],
      );
    },
    async setPassword(username, passwordHash) {
      const rows = await q(
        `UPDATE auth.pengguna SET password_hash = $2, password_diubah = now(), gagal_login = 0, terkunci_sampai = NULL
          WHERE username = $1 RETURNING ${COLUMNS}`,
        [username, passwordHash],
      );
      return toUser(rows[0]);
    },
    async setActive(username, aktif) {
      const rows = await q(`UPDATE auth.pengguna SET aktif = $2 WHERE username = $1 RETURNING ${COLUMNS}`, [
        username,
        aktif,
      ]);
      return toUser(rows[0]);
    },
    async list() {
      return (await q(`SELECT ${COLUMNS} FROM auth.pengguna ORDER BY username`)).map(toUser);
    },
    async close() {
      await pool.end();
    },
  };
}

/** Penyimpanan di memori — untuk tes dan pengembangan tanpa PostgreSQL. */
export function createMemoryUserStore() {
  const rows = new Map();
  let seq = 0;
  const clone = (u) => (u ? { ...u } : null);
  return {
    async findByUsername(username) {
      return clone(rows.get(username));
    },
    async create({ username, nama, peran, passwordHash }) {
      if (rows.has(username)) {
        const error = new Error('duplicate key value violates unique constraint');
        error.code = '23505';
        throw error;
      }
      const user = {
        id: ++seq,
        username,
        nama,
        peran,
        passwordHash,
        aktif: true,
        gagalLogin: 0,
        terkunciSampai: null,
        loginTerakhir: null,
        passwordDiubah: new Date(),
      };
      rows.set(username, user);
      return clone(user);
    },
    async recordFailure(id, { maxFailed, lockMinutes }) {
      const user = [...rows.values()].find((u) => u.id === id);
      if (!user) return null;
      user.gagalLogin += 1;
      if (user.gagalLogin >= maxFailed) {
        user.gagalLogin = 0;
        user.terkunciSampai = new Date(Date.now() + lockMinutes * 60_000);
      }
      return clone(user);
    },
    async recordSuccess(id) {
      const user = [...rows.values()].find((u) => u.id === id);
      if (user) Object.assign(user, { gagalLogin: 0, terkunciSampai: null, loginTerakhir: new Date() });
    },
    async setPassword(username, passwordHash) {
      const user = rows.get(username);
      if (!user) return null;
      Object.assign(user, { passwordHash, passwordDiubah: new Date(), gagalLogin: 0, terkunciSampai: null });
      return clone(user);
    },
    async setActive(username, aktif) {
      const user = rows.get(username);
      if (!user) return null;
      user.aktif = aktif;
      return clone(user);
    },
    async list() {
      return [...rows.values()].map(clone);
    },
    async close() {},
  };
}
