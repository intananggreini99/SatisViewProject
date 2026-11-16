import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../src/auth/password.js';
import { config } from '../src/config.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { ADMIN, startApp } from './helpers/setup.js';

describe('password', () => {
  it('hash scrypt bisa diverifikasi & salt acak', async () => {
    const a = await hashPassword('Rahasia123');
    const b = await hashPassword('Rahasia123');
    assert.notEqual(a, b);
    assert.ok(await verifyPassword('Rahasia123', a));
    assert.ok(!(await verifyPassword('rahasia123', a)));
    assert.ok(!(await verifyPassword('Rahasia123', 'bukan-format')));
  });
  it('kebijakan password', () => {
    assert.match(checkPasswordPolicy('pendek1'), /minimal 8/);
    assert.match(checkPasswordPolicy('tanpaangkasama'), /huruf dan angka/);
    assert.equal(checkPasswordPolicy('CukupKuat8'), null);
  });
});

describe('rate limiter', () => {
  it('menolak setelah batas lalu terbuka kembali', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    assert.ok(rl.hit('a').allowed);
    assert.ok(rl.hit('a').allowed);
    const blocked = rl.hit('a');
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 1);
    assert.ok(rl.hit('b').allowed);
    t = 1500;
    assert.ok(rl.hit('a').allowed);
  });
});

describe('login & proteksi dashboard', () => {
  let ctx;
  before(async () => {
    ctx = await startApp({ settings: { maxFailedLogins: 3, lockMinutes: 15 } });
  });
  after(() => ctx.close());

  it('dashboard tanpa token -> 401', async () => {
    for (const path of ['/groups', '/groups/mahasiswa/kpi', '/report', '/report/status']) {
      const res = await fetch(`${ctx.base}${path}`);
      assert.equal(res.status, 401, path);
      assert.match(res.headers.get('www-authenticate'), /Bearer/);
    }
  });

  it('health & form kuisioner tetap publik', async () => {
    assert.equal((await fetch(`${ctx.base}/health/live`)).status, 200);
    assert.equal((await fetch(`${ctx.base}/kuesioner`)).status, 200);
  });

  it('login benar -> token JWT HS256 berisi peran, bisa dipakai', async () => {
    const { res, body } = await ctx.login(' Admin.Uji ', ADMIN.password);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(body.pengguna, { username: 'admin.uji', nama: 'Admin Uji', peran: 'admin' });
    const decoded = jwt.decode(body.token, { complete: true });
    assert.equal(decoded.header.alg, 'HS256');
    assert.equal(decoded.payload.sub, 'admin.uji');
    assert.ok(!('password' in decoded.payload) && !('passwordHash' in decoded.payload));
    const me = await fetch(`${ctx.base}/auth/saya`, { headers: { Authorization: `Bearer ${body.token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).pengguna.username, 'admin.uji');
  });

  it('password salah & username tak dikenal -> pesan sama (tanpa membocorkan akun)', async () => {
    const a = await ctx.login('admin.uji', 'SalahSekali1');
    const b = await ctx.login('tidak.ada', 'SalahSekali1');
    assert.equal(a.res.status, 401);
    assert.equal(b.res.status, 401);
    assert.equal(a.body.error, b.body.error);
  });

  it('token dipalsukan / kedaluwarsa / tanpa Bearer ditolak', async () => {
    const forged = jwt.sign({ pv: 0, peran: 'admin' }, 'kunci-lain-yang-salah', { subject: 'admin.uji' });
    const valid = jwt.decode(ctx.auth.signToken({ username: 'admin.uji', nama: 'x', peran: 'admin', passwordDiubah: new Date() }).token);
    const expiredToken = jwt.sign({ ...valid, exp: Math.floor(Date.now() / 1000) - 10 }, config.auth.jwtSecret);
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(valid)).toString('base64url')}.`;
    const expiredRes = await fetch(`${ctx.base}/groups`, { headers: { Authorization: `Bearer ${expiredToken}` } });
    assert.equal(expiredRes.status, 401);
    assert.match((await expiredRes.json()).error, /berakhir/);
    for (const header of [`Bearer ${forged}`, `Bearer ${noneAlg}`, 'Basic YWRtaW46YWRtaW4=', 'Bearer ']) {
      const res = await fetch(`${ctx.base}/groups`, { headers: { Authorization: header } });
      assert.equal(res.status, 401, header.slice(0, 20));
    }
  });

  it('ganti password / nonaktif -> token lama tidak berlaku', async () => {
    await ctx.auth.createUser({ username: 'pimpinan', nama: 'Pimpinan Uji', peran: 'pimpinan', password: 'Pimpinan123' });
    const { body } = await ctx.login('pimpinan', 'Pimpinan123');
    const headers = { Authorization: `Bearer ${body.token}` };
    assert.equal((await fetch(`${ctx.base}/auth/saya`, { headers })).status, 200);
    await new Promise((r) => setTimeout(r, 1100)); // pv dalam detik
    await ctx.auth.resetPassword('pimpinan', 'PasswordBaru123');
    assert.equal((await fetch(`${ctx.base}/auth/saya`, { headers })).status, 401);
    const baru = await ctx.login('pimpinan', 'PasswordBaru123');
    assert.equal(baru.res.status, 200);
    await ctx.auth.setActive('pimpinan', false);
    const h2 = { Authorization: `Bearer ${baru.body.token}` };
    assert.equal((await fetch(`${ctx.base}/auth/saya`, { headers: h2 })).status, 401);
    assert.equal((await ctx.login('pimpinan', 'PasswordBaru123')).res.status, 401);
  });

  it('akun dikunci sementara setelah beberapa kali salah password', async () => {
    await ctx.auth.createUser({ username: 'operator', nama: 'Operator', peran: 'pengelola', password: 'Operator123' });
    const hasil = [];
    for (let i = 0; i < 3; i += 1) hasil.push((await ctx.login('operator', 'Salah12345')).res.status);
    assert.deepEqual(hasil, [401, 401, 429]);
    // password benar pun ditolak selama terkunci
    assert.equal((await ctx.login('operator', 'Operator123')).res.status, 429);
  });

  it('body JSON rusak -> 400, bukan 500', async () => {
    const res = await fetch(`${ctx.base}/auth/masuk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"username": ',
    });
    assert.equal(res.status, 400);
  });

  it('bootstrap admin tidak menimpa akun yang ada', async () => {
    const a = await ctx.auth.bootstrapAdmin({ username: 'admin.uji', password: 'LainLagi999', nama: 'X' });
    assert.equal(a.status, 'sudah_ada');
    assert.equal((await ctx.login('admin.uji', ADMIN.password)).res.status, 200);
    const b = await ctx.auth.bootstrapAdmin({ username: 'superadmin', password: 'Superadmin1', nama: 'Super' });
    assert.equal(b.status, 'dibuat');
    const c = await ctx.auth.bootstrapAdmin({ username: '', password: '' });
    assert.equal(c.status, 'lewati');
  });
});
