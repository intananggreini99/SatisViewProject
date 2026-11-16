import { useEffect, useId, useRef, useState } from 'react';
import { AlertIcon, ArrowLeftIcon, ChevronDown, EyeIcon, EyeOffIcon, InfoIcon, LockIcon } from '../components/Icons.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { navigate } from '../lib/router.js';

// Halaman akses (desain prototipe "satisviewww.html"): responden memilih perannya lalu
// langsung ke form kuisioner; pengelola/stakeholder terdaftar login (JWT) ke dashboard.
const AKSES = [
  { key: 'mahasiswa', label: 'Mahasiswa' },
  { key: 'dosen', label: 'Dosen' },
  { key: 'karyawan', label: 'Karyawan / Tendik' },
  { key: 'mitra_kerjasama', label: 'Mitra Kerja Sama' },
  { key: 'mitra_pengadaan', label: 'Mitra Pengadaan' },
  { key: 'pengelola', label: 'Pengelola / Stakeholder' },
];
const ALIAS = { 'mitra-kerja': 'mitra_kerjasama', 'mitra-pengadaan': 'mitra_pengadaan', tendik: 'karyawan' };

function PilihAkses({ value, onChange }) {
  const [buka, setBuka] = useState(false);
  const [sorot, setSorot] = useState(() => Math.max(0, AKSES.findIndex((a) => a.key === value)));
  const wadah = useRef(null);
  const tombol = useRef(null);
  const id = useId();
  const pilihan = AKSES.find((a) => a.key === value) ?? AKSES[0];

  useEffect(() => {
    if (!buka) return undefined;
    const tutup = (e) => {
      if (!wadah.current?.contains(e.target)) setBuka(false);
    };
    document.addEventListener('pointerdown', tutup);
    return () => document.removeEventListener('pointerdown', tutup);
  }, [buka]);

  const pilih = (i) => {
    onChange(AKSES[i].key);
    setBuka(false);
    tombol.current?.focus();
  };

  const onKeyDown = (e) => {
    if (!buka && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setSorot(Math.max(0, AKSES.findIndex((a) => a.key === value)));
      setBuka(true);
      return;
    }
    if (!buka) return;
    if (e.key === 'ArrowDown') setSorot((s) => Math.min(AKSES.length - 1, s + 1));
    else if (e.key === 'ArrowUp') setSorot((s) => Math.max(0, s - 1));
    else if (e.key === 'Home') setSorot(0);
    else if (e.key === 'End') setSorot(AKSES.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') pilih(sorot);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setBuka(false);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={wadah} className="relative">
      <button
        ref={tombol}
        id={`${id}-tombol`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={buka}
        aria-controls={`${id}-daftar`}
        aria-labelledby={`${id}-label ${id}-tombol`}
        aria-activedescendant={buka ? `${id}-opsi-${sorot}` : undefined}
        onClick={() => setBuka((b) => !b)}
        onKeyDown={onKeyDown}
        className="flex h-[52px] w-full items-center justify-between rounded-[14px] border border-[#d9e4f0] bg-white px-4 text-[14px] font-semibold text-brand-900 shadow-[0_5px_16px_rgb(9_50_99/0.05)] transition hover:border-brand-300"
      >
        {pilihan.label}
        <ChevronDown size={18} className={`text-[#7890aa] transition ${buka ? 'rotate-180' : ''}`} />
      </button>
      <span id={`${id}-label`} className="sr-only">
        Akses sebagai
      </span>
      {buka && (
        <ul
          id={`${id}-daftar`}
          role="listbox"
          aria-label="Akses sebagai"
          tabIndex={-1}
          className="absolute inset-x-0 top-[59px] z-30 animate-fade-in rounded-[18px] border border-[#dce6f1] bg-white p-1.5 shadow-[0_20px_42px_rgb(6_40_83/0.18)]"
        >
          {AKSES.map((a, i) => {
            const aktif = a.key === value;
            return (
              <li
                key={a.key}
                id={`${id}-opsi-${i}`}
                role="option"
                aria-selected={aktif}
                onPointerEnter={() => setSorot(i)}
                onClick={() => pilih(i)}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-[13px] ${aktif ? 'bg-[#edf3fb] font-bold text-brand-800' : 'text-brand-900'} ${
                  i === sorot && !aktif ? 'bg-brand-50' : ''
                } ${a.key === 'pengelola' ? 'mt-1 border-t border-line pt-3' : ''}`}
              >
                {a.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Kolom({ id, label, children }) {
  return (
    <div className="mt-[18px]">
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-brand-900">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function Login({ peranAwal, lanjut }) {
  const { pengguna, masuk, keluar, pesan, hapusPesan } = useAuth();
  const [akses, setAkses] = useState(() => {
    const p = ALIAS[peranAwal] ?? peranAwal;
    return AKSES.some((a) => a.key === p) ? p : 'mahasiswa';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [lihat, setLihat] = useState(false);
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState(null);
  const idUser = useId();
  const idPass = useId();
  const pengelola = akses === 'pengelola';

  useEffect(() => {
    document.title = 'Masuk — SatisView';
  }, []);

  const tujuanDashboard = lanjut && lanjut.startsWith('dashboard') ? `/${lanjut}` : '/dashboard/mahasiswa/kpi';

  const kirim = async (e) => {
    e.preventDefault();
    hapusPesan();
    if (!pengelola) {
      navigate(`/kuesioner/${akses}`);
      return;
    }
    if (pengguna) {
      navigate(tujuanDashboard);
      return;
    }
    if (!username.trim() || !password) {
      setGalat('Isi username dan password.');
      return;
    }
    setProses(true);
    setGalat(null);
    try {
      await masuk(username.trim(), password);
      setPassword('');
      navigate(tujuanDashboard);
    } catch (error) {
      setGalat(error.message);
      setPassword('');
    } finally {
      setProses(false);
    }
  };

  const tombolLabel = !pengelola ? 'Mulai Kuesioner' : pengguna ? 'Buka Dashboard' : proses ? 'Memeriksa…' : 'Log in';

  return (
    <div className="relative isolate grid min-h-dvh place-items-center px-3 py-6 sm:p-[38px]">
      <picture>
        <source srcSet="/kampus-pens-udara.webp" type="image/webp" />
        <img src="/kampus-pens-udara.jpg" alt="" className="fixed inset-0 -z-20 size-full object-cover" />
      </picture>
      <div className="fixed inset-0 -z-10 bg-[rgb(238_246_255/0.74)] backdrop-blur-[2px]" />

      <main className="grid w-full max-w-[1180px] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_70px_rgb(3_36_79/0.2)] sm:rounded-[32px] lg:min-h-[640px] lg:grid-cols-[minmax(0,507fr)_minmax(0,673fr)]">
        <form onSubmit={kirim} className="flex flex-col justify-center px-6 py-10 sm:px-[58px] sm:py-[60px]" noValidate>
          <div className="mx-auto w-full max-w-[370px]">
            <picture>
              <source srcSet="/logo-satisview.webp" type="image/webp" />
              <img src="/logo-satisview.png" alt="SatisView" width="448" height="128" className="mx-auto mb-7 h-[52px] w-auto sm:mb-[34px] sm:h-[60px]" />
            </picture>
            <h1 className="text-center text-[32px] font-bold tracking-[-0.04em] text-brand-900 sm:text-[39px]">Welcome back!</h1>
            <p className="mt-1.5 mb-7 text-center text-[13px] text-[#667b92] sm:mb-[34px]">Please select your access</p>

            {pesan && (
              <p role="status" className="mb-4 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-brand-800">
                <InfoIcon size={17} className="mt-0.5 shrink-0" /> {pesan}
              </p>
            )}

            <p className="mb-2 block text-[12px] font-bold text-brand-900" aria-hidden>
              Akses sebagai
            </p>
            <PilihAkses
              value={akses}
              onChange={(v) => {
                setAkses(v);
                setGalat(null);
              }}
            />

            {pengelola && !pengguna && (
              <div className="animate-fade-in">
                <Kolom id={idUser} label="Username">
                  <input
                    id={idUser}
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={Boolean(galat) || undefined}
                    className="w-full border-0 border-b border-[#8eaad0] bg-transparent px-0.5 py-2.5 text-[15px] text-brand-900 outline-none placeholder:text-ink-muted/60 focus:border-brand focus-visible:outline-none focus:shadow-[0_1px_0_var(--color-brand)]"
                  />
                </Kolom>
                <Kolom id={idPass} label="Password">
                  <div className="relative">
                    <input
                      id={idPass}
                      name="password"
                      type={lihat ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={Boolean(galat) || undefined}
                      className="w-full border-0 border-b border-[#8eaad0] bg-transparent py-2.5 pr-10 pl-0.5 text-[15px] text-brand-900 outline-none focus:border-brand focus-visible:outline-none focus:shadow-[0_1px_0_var(--color-brand)]"
                    />
                    <button
                      type="button"
                      onClick={() => setLihat((v) => !v)}
                      className="absolute top-1/2 right-0 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-[#7890aa] hover:text-brand"
                      aria-label={lihat ? 'Sembunyikan password' : 'Tampilkan password'}
                      aria-pressed={lihat}
                    >
                      {lihat ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                    </button>
                  </div>
                </Kolom>
              </div>
            )}

            {pengelola && pengguna && (
              <div className="mt-[18px] rounded-2xl border border-line bg-canvas px-4 py-3 text-[13px] text-ink-soft">
                Anda masuk sebagai <strong className="text-brand-900">{pengguna.nama}</strong> ({pengguna.peran}).{' '}
                <button type="button" onClick={() => keluar(null)} className="font-semibold text-brand underline-offset-2 hover:underline">
                  Ganti akun
                </button>
              </div>
            )}

            {galat && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2.5 text-[13px] text-bad">
                <AlertIcon size={17} className="mt-0.5 shrink-0" /> {galat}
              </p>
            )}

            <button
              type="submit"
              disabled={proses}
              className="mt-[26px] inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-brand-800 px-5 text-[15px] font-bold text-white shadow-[0_10px_20px_-10px_rgb(15_58_100/0.7)] transition hover:bg-brand-900 active:scale-[0.99] disabled:cursor-wait disabled:opacity-75"
            >
              {pengelola && !pengguna && <LockIcon size={17} />}
              {tombolLabel}
            </button>
            <p className="mt-3 text-center text-[12px] text-ink-muted">
              {pengelola
                ? 'Dashboard hasil analisis khusus pengguna yang terdaftar di SatisView.'
                : 'Tanpa akun — langsung mengisi kuesioner kepuasan sesuai peran Anda.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg px-1.5 text-[12px] text-[#71849b] transition hover:text-brand"
            >
              <ArrowLeftIcon size={14} /> Kembali ke halaman utama
            </button>
          </div>
        </form>

        <aside className="relative hidden overflow-hidden lg:block" aria-hidden>
          <picture>
            <source srcSet="/hero-pens.webp" type="image/webp" />
            <img src="/hero-pens.jpg" alt="" className="absolute inset-0 size-full object-cover object-[55%_35%]" />
          </picture>
          <div className="absolute inset-x-0 top-[55%] bottom-0 bg-[linear-gradient(transparent,rgb(4_28_66/0.78))]" />
          <p className="absolute right-[42px] bottom-[38px] left-[42px] text-[32px] leading-[1.08] font-bold text-white">
            Dari Suara Kampus,
            <br />
            Menjadi Langkah <em className="font-serif font-normal text-gold">Perubahan.</em>
          </p>
        </aside>
      </main>
    </div>
  );
}
