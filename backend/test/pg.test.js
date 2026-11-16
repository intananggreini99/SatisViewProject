// Tes dengan PostgreSQL sungguhan: migrasi skema auth + login memakai tabel auth.pengguna.
// Jalankan: TEST_WITH_DB=1 PGHOST=... PGPORT=... POSTGRES_USER=... POSTGRES_PASSWORD=... npm test
// Tes ini MENGHAPUS isi auth.pengguna, jadi selalu memakai database uji tersendiri
// (SATISVIEW_TEST_DB, default "satisview_uji"; namanya wajib mengandung "uji"/"test").
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/auth/service.js';
import { createPgUserStore } from '../src/auth/users.js';
import { migrasi } from '../src/cli/migrasi.js';
import { fakeProducer } from './helpers/setup.js';

const aktif = process.env.TEST_WITH_DB === '1';
const s = {
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'satisview',
  password: process.env.POSTGRES_PASSWORD ?? 'satisview',
  database: process.env.SATISVIEW_TEST_DB ?? 'satisview_uji',
  authUser: 'satisview_auth_uji',
  authPassword: 'Auth-Uji-123',
};

describe('akun pengelola di PostgreSQL', { skip: !aktif }, () => {
  let store;
  let server;
  let base;

  before(async () => {
    if (!/(uji|test)/i.test(s.database)) {
      throw new Error(`SATISVIEW_TEST_DB="${s.database}" bukan database uji; akun asli bisa terhapus.`);
    }
    const admin = new pg.Client({ ...s, database: 'postgres' });
    await admin.connect();
    const ada = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [s.database]);
    if (!ada.rowCount) await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(s.database)}`);
    await admin.end();
    await migrasi(s, () => {});
    await migrasi(s, () => {}); // idempoten
    const bersih = new pg.Client(s);
    await bersih.connect();
    await bersih.query('DELETE FROM auth.pengguna');
    await bersih.end();
    store = createPgUserStore({ host: s.host, port: s.port, user: s.authUser, password: s.authPassword, database: s.database });
    const auth = createAuthService({ store });
    await auth.createUser({ username: 'kepala.ppm', nama: 'Kepala PPMPP', peran: 'pimpinan', password: 'Pimpinan2026' });
    server = createApp({ auth, producer: fakeProducer() }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    await store.close();
  });

  const login = (username, password) =>
    fetch(`${base}/auth/masuk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

  it('login berhasil mencatat waktu login & token berlaku', async () => {
    const res = await login('kepala.ppm', 'Pimpinan2026');
    assert.equal(res.status, 200);
    const { token } = await res.json();
    const me = await fetch(`${base}/auth/saya`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await me.json()).pengguna.peran, 'pimpinan');
    const u = await store.findByUsername('kepala.ppm');
    assert.ok(u.loginTerakhir instanceof Date);
    assert.match(u.passwordHash, /^scrypt\$/);
  });

  it('akun terkunci setelah 5 kali salah (tersimpan di database)', async () => {
    const status = [];
    for (let i = 0; i < 5; i += 1) status.push((await login('kepala.ppm', 'SalahLagi99')).status);
    assert.deepEqual(status, [401, 401, 401, 401, 429]);
    const u = await store.findByUsername('kepala.ppm');
    assert.ok(u.terkunciSampai > new Date());
  });

  it('role auth hanya bisa mengakses tabel auth.pengguna', async () => {
    const c = new pg.Client({ host: s.host, port: s.port, user: s.authUser, password: s.authPassword, database: s.database });
    await c.connect();
    await assert.rejects(c.query('CREATE TABLE auth.coba (x int)'), /permission denied/);
    await assert.rejects(c.query('DELETE FROM auth.pengguna'), /permission denied/);
    await c.end();
  });
});
