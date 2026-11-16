#!/usr/bin/env node
// Migrasi database aplikasi SatisView (idempoten) — dijalankan service `db-migrate`
// setiap `docker compose up`, sebelum API menyala. Aman diulang kapan saja.
//
// Membuat role AUTH_DB_USER, skema `auth`, dan tabel `auth.pengguna` (akun
// pengelola dashboard) di database POSTGRES_DB. Butuh kredensial pemilik
// database (POSTGRES_USER/POSTGRES_PASSWORD) — hanya dipakai di sini, tidak oleh API.
import pg from 'pg';

const env = (name, fallback) => process.env[name] ?? fallback;

const settings = {
  host: env('PGHOST', 'postgres'),
  port: Number(env('PGPORT', '5432')),
  user: env('POSTGRES_USER', 'satisview'),
  password: env('POSTGRES_PASSWORD', 'satisview'),
  database: env('POSTGRES_DB', 'satisview'),
  authUser: env('AUTH_DB_USER', 'satisview_auth'),
  authPassword: env('AUTH_DB_PASSWORD', 'satisview_auth'),
};

const TABEL = `
CREATE SCHEMA IF NOT EXISTS auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
CREATE TABLE IF NOT EXISTS auth.pengguna (
  id               BIGSERIAL PRIMARY KEY,
  username         TEXT        NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
  nama             TEXT        NOT NULL CHECK (char_length(nama) BETWEEN 2 AND 100),
  peran            TEXT        NOT NULL DEFAULT 'pengelola' CHECK (peran IN ('admin', 'pimpinan', 'pengelola')),
  password_hash    TEXT        NOT NULL,
  aktif            BOOLEAN     NOT NULL DEFAULT TRUE,
  gagal_login      INTEGER     NOT NULL DEFAULT 0,
  terkunci_sampai  TIMESTAMPTZ,
  login_terakhir   TIMESTAMPTZ,
  password_diubah  TIMESTAMPTZ NOT NULL DEFAULT now(),
  dibuat           TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE auth.pengguna IS 'Akun pengelola/stakeholder yang boleh membuka dashboard SatisView (login JWT).';
`;

async function migrasi(s = settings, log = console.log) {
  const client = new pg.Client({ host: s.host, port: s.port, user: s.user, password: s.password, database: s.database });
  await client.connect();
  try {
    const role = client.escapeIdentifier(s.authUser);
    const pass = client.escapeLiteral(s.authPassword);
    const ada = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [s.authUser]);
    await client.query(ada.rowCount ? `ALTER ROLE ${role} LOGIN PASSWORD ${pass}` : `CREATE ROLE ${role} LOGIN PASSWORD ${pass}`);
    await client.query('BEGIN');
    await client.query(TABEL);
    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(s.database)} TO ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA auth TO ${role}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE ON auth.pengguna TO ${role}`);
    await client.query(`GRANT USAGE, SELECT ON SEQUENCE auth.pengguna_id_seq TO ${role}`);
    await client.query('COMMIT');
    const { rows } = await client.query('SELECT count(*)::int AS n FROM auth.pengguna');
    log(`[migrasi] skema auth siap (role ${s.authUser}, ${rows[0].n} akun).`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

export { migrasi };

if (import.meta.url === `file://${process.argv[1]}`) {
  const coba = async (n = 1) => {
    try {
      await migrasi();
    } catch (error) {
      if (n >= 10) {
        console.error(`[migrasi] gagal: ${error.message}`);
        process.exit(1);
      }
      console.warn(`[migrasi] percobaan ${n} gagal (${error.message}); mengulang...`);
      await new Promise((r) => setTimeout(r, 3000));
      await coba(n + 1);
    }
  };
  coba();
}
