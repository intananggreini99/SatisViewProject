// Uji end-to-end SatisView di browser (Playwright): landing page, halaman akses/login,
// penjaga dashboard, kelima form kuisioner, draf otomatis, dan tampilan ponsel/tablet.
//
// Jalankan terhadap stack yang sedang hidup (docker compose up), lihat README bagian 8:
//   cd e2e && npm install && npx playwright install chromium
//   SATISVIEW_USERNAME=admin SATISVIEW_PASSWORD=... npm test
//
// Bawaan: pengiriman form DICEGAT di browser (tidak ada data yang masuk ke sistem).
// E2E_KIRIM=1 mengirim respons sungguhan lewat API -> Kafka -> HDFS -> dashboard;
// pakai HANYA di stack uji, karena respons uji akan ikut terhitung di dashboard.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.SATISVIEW_URL || 'http://localhost:3000').replace(/\/$/, '');
const USER = process.env.SATISVIEW_USERNAME || '';
const PASS = process.env.SATISVIEW_PASSWORD || '';
const KIRIM = process.env.E2E_KIRIM === '1';
const OUT = path.resolve(process.env.E2E_OUTPUT || 'hasil');
fs.mkdirSync(OUT, { recursive: true });

const hasil = [];
function cek(nama, ok, info = '') {
  hasil.push({ nama, ok, info });
  console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${info ? ` — ${info}` : ''}`);
}
const regexPersis = (teks) => new RegExp(`^${teks.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

// Mengisi semua pertanyaan yang tampil di halaman form saat ini.
async function isiHalaman(page, skema, opsi) {
  const semua = Object.fromEntries(skema.bagian.flatMap((b) => b.pertanyaan).map((q) => [q.id, q]));
  const blok = page.locator('[data-pertanyaan]');
  const n = await blok.count();
  for (let i = 0; i < n; i++) {
    const el = blok.nth(i);
    const q = semua[await el.getAttribute('data-pertanyaan')];
    if (q.jenis === 'grid') {
      for (let r = 0; r < q.baris.length; r++) {
        await el.locator('ol > li').nth(r).locator('label').nth((r + opsi.geser) % q.skala.length).click();
      }
    } else if (q.jenis === 'pilihan_ganda') {
      const pilih = q.lompat ? opsi.klinik : q.opsi[opsi.geser % q.opsi.length];
      await el.locator('label', { hasText: regexPersis(pilih) }).first().click();
    } else if (q.jenis === 'dropdown') {
      await el.locator('select').selectOption(q.opsi[(opsi.geser + 1) % q.opsi.length]);
    } else if (q.jenis === 'kotak_centang') {
      for (const o of q.opsi.slice(0, 2)) await el.locator('label', { hasText: regexPersis(o) }).first().click();
    } else if (q.jenis === 'teks_singkat') {
      await el.locator('input').fill(q.validasi?.pola ? '0812-3456-7890' : 'Instansi Uji Coba');
    } else if (q.jenis === 'paragraf') {
      await el.locator('textarea').fill('Pelayanan sudah baik, komunikasi dan fasilitas perlu ditingkatkan.');
    }
  }
}

// Mengisi form dari halaman yang sedang terbuka sampai halaman terima kasih.
async function isiSampaiSelesai(page, skema, opsi) {
  await page.waitForSelector('#kartu-bagian');
  for (let halaman = 1; halaman <= 40; halaman++) {
    await isiHalaman(page, skema, opsi);
    const kirim = page.getByRole('button', { name: /^Kirim/ });
    if (await kirim.count()) {
      await kirim.click();
      await page.waitForSelector('#judul-selesai', { timeout: 20000 });
      return halaman;
    }
    await page.getByRole('button', { name: /Berikutnya/ }).click();
    await page.waitForTimeout(100);
  }
  throw new Error('form tidak sampai ke tombol Kirim');
}

const browser = await chromium.launch();
const galatJs = [];
const pantau = (p, label) => {
  p.on('pageerror', (e) => galatJs.push(`${label}: ${e.message}`));
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  pantau(page, 'desktop');

  // Pengiriman form: dicegat (bawaan) atau sungguhan (E2E_KIRIM=1).
  const terkirim = [];
  await page.route('**/api/kuesioner/*', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    terkirim.push({ url: req.url(), body: req.postDataJSON() });
    if (KIRIM) return route.continue();
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'diterima', id_respons: 'uji', diterima_pada: new Date().toISOString() }),
    });
  });

  // 1) Landing page
  await page.goto(`${BASE}/`);
  await page.waitForSelector('h1');
  cek('landing: hero tampil', (await page.locator('h1').innerText()).includes('Dari Suara Kampus'));
  await page.screenshot({ path: `${OUT}/landing_desktop.png` });
  await page.getByRole('button', { name: 'Fitur berikutnya' }).first().click();
  await page.waitForTimeout(700);
  const aktif = await page.locator('[aria-roledescription="slide"][aria-hidden="false"]').innerText();
  cek('landing: karusel fitur bergeser', aktif.includes('Prioritas'));
  await page.getByRole('button', { name: 'Tentang' }).click();
  await page.waitForTimeout(800);
  cek('landing: menu navbar menggulir tanpa mengubah rute', !page.url().includes('#/') || page.url().endsWith('#/'), page.url());
  await page.getByRole('button', { name: /Akses SatisView/ }).first().click();
  await page.waitForURL(/#\/masuk/);
  cek('landing: tombol Akses SatisView membuka halaman akses', true);

  // 2) Akses responden -> form sesuai peran
  await page.screenshot({ path: `${OUT}/login_desktop.png` });
  await page.getByRole('button', { name: /Akses sebagai/ }).click();
  await page.getByRole('option', { name: 'Dosen' }).click();
  await page.getByRole('button', { name: 'Mulai Kuesioner' }).click();
  await page.waitForURL(/#\/kuesioner\/dosen$/);
  await page.waitForSelector('#kartu-bagian');
  await page.getByRole('button', { name: /Berikutnya/ }).click();
  await page.waitForTimeout(300);
  cek('form: pertanyaan wajib yang kosong ditolak', (await page.locator('[role=alert]').first().innerText()).includes('perlu dilengkapi'));

  // 3) Dashboard dijaga login
  await page.goto(`${BASE}/#/dashboard/mahasiswa/kpi`);
  await page.waitForURL(/#\/masuk/);
  cek('dashboard tanpa login dialihkan ke halaman login', page.url().includes('peran=pengelola'));
  if (USER && PASS) {
    await page.locator('input[name=username]').fill(USER);
    await page.locator('input[name=password]').fill(`${PASS}-salah`);
    await page.getByRole('button', { name: /Log in/ }).click();
    await page.waitForSelector('[role=alert]');
    cek('login: password salah ditolak', (await page.locator('[role=alert]').innerText()).includes('salah'));
    await page.locator('input[name=password]').fill(PASS);
    await page.getByRole('button', { name: /Log in/ }).click();
    await page.waitForURL(/#\/dashboard\/mahasiswa\/kpi/);
    await page.waitForTimeout(1500);
    cek('login: berhasil masuk ke dashboard', true);
    await page.screenshot({ path: `${OUT}/dashboard_desktop.png` });
    await page.getByRole('button', { name: /Keluar \(/ }).click();
    await page.waitForURL(/#\/masuk/);
    await page.goto(`${BASE}/#/dashboard/dosen/kpi`);
    await page.waitForURL(/#\/masuk/);
    cek('logout: dashboard terkunci lagi', true);
  } else {
    console.log('(lewati uji login: isi SATISVIEW_USERNAME & SATISVIEW_PASSWORD)');
  }

  // 4) Kelima form kuisioner diisi sampai halaman terima kasih
  const rencana = [
    ['mahasiswa', { geser: 2, klinik: 'Ya' }],
    ['dosen', { geser: 3, klinik: '' }],
    ['karyawan', { geser: 2, klinik: '' }],
    ['mitra_kerjasama', { geser: 0, klinik: '' }],
    ['mitra_pengadaan', { geser: 1, klinik: '' }],
  ];
  for (const [kelompok, opsi] of rencana) {
    try {
      const skema = await (await page.request.get(`${BASE}/api/kuesioner/${kelompok}`)).json();
      await page.goto(`${BASE}/#/masuk`);
      await page.goto(`${BASE}/#/kuesioner/${kelompok}`);
      const n = await isiSampaiSelesai(page, skema, opsi);
      cek(`form ${kelompok}: terisi & terkirim`, true, `${n} halaman`);
      if (kelompok === 'mahasiswa') {
        // "Kirim respons lain" + jalur Klinik "Tidak" (bagian penilaian klinik dilewati)
        await page.getByRole('button', { name: /Kirim respons lain/ }).click();
        const n2 = await isiSampaiSelesai(page, skema, { geser: 1, klinik: 'Tidak' });
        cek('form mahasiswa: jalur "belum pernah ke Klinik" melewati penilaian klinik', n2 === n - 1, `${n2} halaman`);
      }
    } catch (e) {
      cek(`form ${kelompok}: terisi & terkirim`, false, e.message.split('\n')[0]);
      await page.screenshot({ path: `${OUT}/gagal_${kelompok}.png`, fullPage: true });
    }
  }
  await page.screenshot({ path: `${OUT}/form_selesai.png` });
  const id = terkirim.map((t) => t.body?.id_pengiriman);
  cek('setiap pengiriman punya id unik & honeypot kosong', new Set(id).size === id.length && terkirim.every((t) => t.body?.situs_web === ''), `${terkirim.length} kiriman`);

  // 5) Draf tersimpan otomatis
  await page.goto(`${BASE}/#/masuk`);
  await page.goto(`${BASE}/#/kuesioner/karyawan`);
  await page.waitForSelector('#kartu-bagian');
  await page.locator('select').selectOption({ index: 3 });
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForSelector('#kartu-bagian');
  cek('draf jawaban pulih setelah halaman dimuat ulang', (await page.locator('select').inputValue()) !== '');
  await page.getByRole('button', { name: /Mulai dari awal/ }).click().catch(() => {});

  // 6) Ponsel & tablet: tidak ada gulir horizontal
  for (const [nama, viewport] of [['ponsel', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }]]) {
    const p = await (await browser.newContext({ viewport, deviceScaleFactor: 2 })).newPage();
    pantau(p, nama);
    for (const [hal, url] of [['landing', '/'], ['login', '/#/masuk?peran=pengelola'], ['form', '/#/kuesioner/mahasiswa']]) {
      await p.goto(`${BASE}${url}`);
      await p.waitForTimeout(800);
      const lebar = await p.evaluate(() => document.documentElement.scrollWidth);
      cek(`${nama}: ${hal} tanpa gulir horizontal`, lebar <= viewport.width, `lebar ${lebar}px`);
      await p.screenshot({ path: `${OUT}/${hal}_${nama}.png` });
    }
  }

  cek('tidak ada error JavaScript di browser', galatJs.length === 0, galatJs.slice(0, 3).join(' | '));
} catch (e) {
  cek('uji berjalan sampai selesai', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
}

const gagal = hasil.filter((h) => !h.ok);
console.log(`\n${hasil.length - gagal.length}/${hasil.length} lolos${KIRIM ? ' (respons dikirim sungguhan)' : ' (pengiriman dicegat)'} · tangkapan layar: ${OUT}`);
process.exit(gagal.length ? 1 : 0);
