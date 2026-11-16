// Uji API: `npm test`. Tes yang butuh PostgreSQL berjalan bila TEST_WITH_DB=1
// (mis. PGHOST=localhost PGPORT=5433 PGUSER=satisview PGPASSWORD=... TEST_WITH_DB=1 npm test).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { closeAll } from '../src/db.js';
import { humanize, tableName } from '../src/services/dashboard.js';

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeAll();
});

describe('API dasar', () => {
  it('health/live selalu ok', async () => {
    const res = await fetch(`${base}/health/live`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });

  it('kelompok responden yang tidak dikenal -> 404', async () => {
    const res = await fetch(`${base}/groups/alumni/kpi`);
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /tidak dikenal/);
  });

  it('parameter terlalu panjang ditolak', async () => {
    const res = await fetch(`${base}/groups/mahasiswa/kpi?segmen=${'x'.repeat(300)}`);
    assert.equal(res.status, 400);
  });

  it('endpoint tidak ada -> 404 JSON', async () => {
    const res = await fetch(`${base}/tidak-ada`);
    assert.equal(res.status, 404);
  });
});

describe('fungsi bantu', () => {
  it('nama tabel = nama file CSV hasil analisis', () => {
    assert.equal(tableName({ key: 'mahasiswa' }, 'kpi_ringkasan'), 'kpi_ringkasan_mahasiswa');
  });
  it('jenis pertanyaan teks dibuat terbaca', () => {
    assert.equal(humanize('saran_birokrasi_hibah'), 'Saran birokrasi hibah');
    assert.equal(humanize(null), null);
  });
});

describe('API dengan PostgreSQL', { skip: process.env.TEST_WITH_DB !== '1' }, () => {
  const get = async (path) => {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, path);
    return res.json();
  };

  it('ringkasan kelompok responden', async () => {
    const { groups } = await get('/groups');
    assert.equal(groups.length, 5);
    for (const g of groups) assert.ok(['ready', 'empty', 'no_data'].includes(g.status));
  });

  it('KPI: indeks 0-100, aspek terurut, prioritas tim berurutan', async () => {
    const data = await get('/groups/mahasiswa/kpi');
    if (data.status !== 'ready') return;
    assert.ok(data.summary.index >= 0 && data.summary.index <= 100);
    const orders = data.aspects.map((s) => s.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    for (const a of data.aspects) {
      assert.ok(Math.abs(a.index - (a.mean / data.summary.scaleMax) * 100) < 0.01, a.key);
      assert.ok(data.items[a.key]?.length > 0, `butir ${a.key}`);
    }
    assert.deepEqual(
      data.priority.map((p) => p.rank),
      data.priority.map((_, i) => i + 1),
    );
    const top = data.priority[0];
    const expected = (top.components.dissatisfaction + top.components.choice + top.components.comments) / 3;
    assert.ok(Math.abs(top.score - expected) < 0.001);
  });

  it('segmen yang tidak ada -> not_found', async () => {
    const data = await get('/groups/mahasiswa/kpi?segmen=Prodi%20Fiktif');
    assert.equal(data.status, 'not_found');
  });

  it('Mapping: titik MDS 2D/3D + stress + peta responden', async () => {
    const data = await get('/groups/mahasiswa/mapping');
    if (data.status !== 'ready') return;
    assert.ok(data.points.length >= 3);
    assert.equal(data.points3d.length, data.points.length);
    assert.ok(data.points3d.every((p) => Number.isFinite(p.z)));
    assert.ok(data.stress.aspects2d.value >= 0);
    assert.ok(data.respondentMap.points.length > 0);
    assert.equal(data.respondentMap.vectors.length, data.points.length);
  });

  it('Text: topik dari frekuensi aspek + kata teratas', async () => {
    const data = await get('/groups/mahasiswa/topics');
    if (data.status !== 'ready') return;
    assert.ok(data.total >= data.withoutAspect);
    assert.deepEqual(
      data.topics.map((t) => t.rank),
      data.topics.map((_, i) => i + 1),
    );
    assert.ok(data.words.length > 0);
  });

  it('komentar bisa difilter per aspek, tanpa aspek & dicari', async () => {
    const topics = await get('/groups/mahasiswa/topics');
    if (topics.status !== 'ready') return;
    const first = topics.topics[0];
    const data = await get(`/groups/mahasiswa/comments?topik=${encodeURIComponent(first.key)}&limit=5`);
    assert.equal(data.total, first.count);
    for (const c of data.items) assert.ok(c.aspects.some((a) => a.key === first.key));
    const none = await get('/groups/mahasiswa/comments?topik=__tanpa_aspek__&limit=5');
    assert.equal(none.total, topics.withoutAspect);
    for (const c of none.items) assert.equal(c.aspects.length, 0);
    const search = await get('/groups/mahasiswa/comments?q=parkir&limit=5');
    for (const c of search.items) assert.match(c.text.toLowerCase(), /parkir/);
  });
});
