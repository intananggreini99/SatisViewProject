import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon } from '../components/Icons.jsx';
import { MiniIndeks, MiniKomentar, MiniPeta, MiniPrioritas } from '../components/landing/MiniApps.jsx';
import { navigate } from '../lib/router.js';

// Landing page SatisView — dipindahkan dari prototipe "satisviewww.html" ke React.
// Navigasi antarbagian memakai scroll (bukan anchor #id) karena hash URL dipakai router.

const keMasuk = () => navigate('/masuk');
const gulirKe = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function Logo({ putih = false, className = '' }) {
  const nama = putih ? 'logo-satisview-putih' : 'logo-satisview';
  return (
    <picture>
      <source srcSet={`/${nama}.webp`} type="image/webp" />
      <img src={`/${nama}.png`} alt="SatisView" width="448" height="128" className={`w-auto ${className}`} />
    </picture>
  );
}

const Kicker = ({ children, terang = false }) => (
  <p className={`text-[11px] font-extrabold tracking-[.15em] uppercase ${terang ? 'text-gold' : 'text-brand-700'}`}>{children}</p>
);

const Serif = ({ children, className = '' }) => (
  <em className={`font-serif font-normal tracking-[-0.02em] ${className}`}>{children}</em>
);

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) {
      el.classList.add('is-visible');
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('is-visible')),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Navbar() {
  const tautan = [
    ['tentang', 'Tentang'],
    ['fitur', 'Fitur'],
    ['alur', 'Alur'],
    ['pengguna', 'Pengguna'],
  ];
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed top-3 left-1/2 z-50 flex h-[60px] w-[calc(100%-22px)] max-w-[1280px] -translate-x-1/2 items-center justify-between rounded-[20px] bg-white/95 pr-2 pl-4 shadow-[0_14px_38px_rgb(5_35_73/0.13)] backdrop-blur-md sm:top-[18px] sm:h-[68px] sm:w-[calc(100%-32px)] sm:rounded-[22px] sm:pr-4 sm:pl-6"
    >
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="SatisView, kembali ke atas">
        <Logo className="h-8 sm:h-[39px]" />
      </button>
      <div className="flex items-center gap-7">
        <ul className="hidden items-center gap-7 md:flex">
          {tautan.map(([id, label]) => (
            <li key={id}>
              <button type="button" onClick={() => gulirKe(id)} className="text-[13px] font-semibold text-brand-900 transition hover:text-brand-500">
                {label}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={keMasuk}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-800 px-4 py-2.5 text-[12px] font-bold text-white shadow-[0_7px_16px_rgb(15_58_100/0.22)] transition hover:-translate-y-px hover:bg-brand-900 sm:px-5 sm:py-3 sm:text-[13px]"
        >
          Akses SatisView <ArrowRightIcon size={15} strokeWidth={2.4} />
        </button>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="on-dark relative isolate flex min-h-[760px] items-end overflow-hidden bg-brand-100 px-5 pt-[105px] pb-10 sm:min-h-[850px] sm:px-[5vw] sm:pt-[135px] sm:pb-[66px]">
      <picture>
        <source srcSet="/hero-pens.webp" type="image/webp" />
        <img src="/hero-pens.jpg" alt="" className="absolute inset-0 -z-20 size-full object-cover object-[60%_30%]" fetchPriority="high" />
      </picture>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(4_20_48/0.05)_15%,rgb(4_25_58/0.22)_48%,rgb(4_25_58/0.93)_100%)]" />
      <div className="mx-auto w-full max-w-[1260px] text-white">
        <p className="flex items-center gap-3 text-[11px] font-extrabold tracking-[.14em] text-gold uppercase">
          <span className="h-[2px] w-9 rounded bg-gold" aria-hidden />
          Campus Satisfaction Analytics
        </p>
        <h1 className="mt-[18px] mb-6 max-w-[1040px] text-[clamp(44px,6.7vw,96px)] leading-[0.96] font-bold tracking-[-0.055em]">
          Dari Suara Kampus,
          <br />
          Menjadi Langkah <Serif className="text-gold">Perubahan.</Serif>
        </h1>
        <p className="mb-7 max-w-[760px] text-[15px] leading-[1.8] text-white/90 sm:text-base">
          SatisView menyatukan hasil survei, indeks kepuasan, prioritas perbaikan, peta persepsi, dan analisis komentar untuk
          mendukung evaluasi layanan PENS berbasis data.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={keMasuk}
            className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-3.5 text-[15px] font-bold text-brand-950 shadow-[0_7px_16px_rgb(7_58_134/0.18)] transition hover:-translate-y-px hover:brightness-105"
          >
            Akses SatisView <ArrowRightIcon size={17} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => gulirKe('fitur')}
            className="rounded-full border border-white/35 bg-white/10 px-5 py-3.5 text-[15px] font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            Jelajahi Fitur
          </button>
        </div>
        <p className="mt-8 hidden items-center justify-end gap-3 text-[11px] text-white/75 sm:flex" aria-hidden>
          <span className="h-9 w-px bg-white/45" />
          Scroll untuk menjelajahi
        </p>
      </div>
    </header>
  );
}

const FITUR = [
  { judul: 'Indeks Kepuasan', teks: 'Melihat indeks total, mutu layanan, dan performa setiap aspek hingga butir pertanyaan.', Visual: MiniIndeks },
  { judul: 'Prioritas Perbaikan', teks: 'Menentukan fokus peningkatan berdasarkan skor kepuasan, pilihan responden, dan isu komentar.', Visual: MiniPrioritas },
  { judul: 'Peta Persepsi', teks: 'Memahami kedekatan pola penilaian antaraspek melalui Multidimensional Scaling (MDS).', Visual: MiniPeta },
  { judul: 'Analisis Komentar', teks: 'Menelusuri topik dominan dan komentar responden berdasarkan aspek yang dibahas.', Visual: MiniKomentar },
];

function langkahGeser() {
  if (window.matchMedia('(max-width: 720px)').matches) return 89;
  if (window.matchMedia('(max-width: 1000px)').matches) return 48;
  return 25.5;
}

function KarouselFitur() {
  const [aktif, setAktif] = useState(0);
  const [geser, setGeser] = useState(0);
  const jedaRef = useRef(false);

  const ke = useCallback((n) => {
    const i = (n + FITUR.length) % FITUR.length;
    setAktif(i);
    setGeser(Math.max(0, i - 1) * langkahGeser());
  }, []);

  useEffect(() => {
    const onResize = () => setGeser((g) => (g === 0 ? 0 : Math.max(0, aktif - 1) * langkahGeser()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [aktif]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = window.setInterval(() => {
      if (!jedaRef.current && document.visibilityState === 'visible') ke(aktif + 1);
    }, 5000);
    return () => window.clearInterval(id);
  }, [aktif, ke]);

  const tombol =
    'grid size-11 shrink-0 place-items-center rounded-full border border-[#d9e3ee] bg-white text-brand-800 shadow-[0_8px_18px_rgb(7_45_94/0.07)] transition hover:bg-brand-50 sm:size-12';

  return (
    <div
      className="mt-10"
      onMouseEnter={() => {
        jedaRef.current = true;
      }}
      onMouseLeave={() => {
        jedaRef.current = false;
      }}
      onFocus={() => {
        jedaRef.current = true;
      }}
      onBlur={() => {
        jedaRef.current = false;
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-3 sm:grid-cols-[52px_minmax(0,1fr)_52px]" role="region" aria-roledescription="carousel" aria-label="Fitur utama SatisView">
        <button type="button" onClick={() => ke(aktif - 1)} className={`${tombol} hidden sm:grid`} aria-label="Fitur sebelumnya">
          <ArrowLeftIcon size={20} />
        </button>
        <div className="overflow-hidden px-1 pt-2.5 pb-[18px]">
          <div className="flex items-stretch gap-4 transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)]" style={{ transform: `translateX(-${geser}%)` }}>
            {FITUR.map(({ judul, teks, Visual }, i) => {
              const on = i === aktif;
              return (
                <article
                  key={judul}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} dari ${FITUR.length}: ${judul}`}
                  aria-hidden={!on}
                  onClick={() => ke(i)}
                  className={`min-w-0 shrink-0 cursor-pointer overflow-hidden rounded-3xl border border-[#e0e8f1] bg-white shadow-[0_14px_30px_rgb(8_43_89/0.07)] transition-[opacity,transform,flex-basis] duration-300 ${
                    on ? 'basis-[86%] scale-100 opacity-100 md:basis-[46%] lg:basis-[38%]' : 'basis-[86%] scale-[.92] opacity-60 md:basis-[46%] lg:basis-[30%]'
                  }`}
                >
                  <div className="h-[285px] bg-[linear-gradient(#eaf1f8,#f7f9fc)] p-3">
                    <Visual />
                  </div>
                  <div className="px-5 pt-[18px] pb-6">
                    <span className="text-[11px] font-extrabold text-[#8b9db0]">0{i + 1}</span>
                    <h3 className="mt-1 mb-1.5 text-xl font-bold text-brand-900">{judul}</h3>
                    <p className="text-[13px] leading-relaxed text-[#5f7690]">{teks}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <button type="button" onClick={() => ke(aktif + 1)} className={`${tombol} hidden sm:grid`} aria-label="Fitur berikutnya">
          <ArrowRightIcon size={20} />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <button type="button" onClick={() => ke(aktif - 1)} className={`${tombol} mr-2 size-10 sm:hidden`} aria-label="Fitur sebelumnya">
          <ArrowLeftIcon size={18} />
        </button>
        {FITUR.map((f, i) => (
          <button
            key={f.judul}
            type="button"
            onClick={() => ke(i)}
            aria-label={`Tampilkan fitur ${i + 1}: ${f.judul}`}
            aria-current={i === aktif ? 'true' : undefined}
            className={`h-2 rounded-full transition-all ${i === aktif ? 'w-[26px] bg-brand-800' : 'w-2 bg-[#cad5e1] hover:bg-brand-300'}`}
          />
        ))}
        <button type="button" onClick={() => ke(aktif + 1)} className={`${tombol} ml-2 size-10 sm:hidden`} aria-label="Fitur berikutnya">
          <ArrowRightIcon size={18} />
        </button>
      </div>
    </div>
  );
}

function KepalaBagian({ kicker, judul, children, satuKolom = false }) {
  return (
    <div className={`flex flex-col gap-5 ${satuKolom ? '' : 'lg:flex-row lg:items-end lg:justify-between lg:gap-10'}`}>
      <div className="max-w-[740px]">
        <Kicker>{kicker}</Kicker>
        <h2 className="mt-2 text-[clamp(36px,4.6vw,64px)] leading-[1.03] font-bold tracking-[-0.045em] text-brand-900">{judul}</h2>
      </div>
      {children && <p className="max-w-[480px] text-[14px] leading-[1.8] text-[#5b6f86]">{children}</p>}
    </div>
  );
}

function Fitur() {
  return (
    <section id="fitur" className="scroll-mt-24 bg-canvas px-5 py-[72px] sm:px-[5vw] sm:py-[105px]">
      <div className="mx-auto max-w-[1260px]">
        <KepalaBagian
          kicker="Explore Analytics"
          judul={
            <>
              Temukan fitur utama <Serif>SatisView.</Serif>
            </>
          }
        >
          Satu fitur jadi fokus utama, sementara fitur lain tetap terlihat dan bisa digeser—lebih terasa seperti menjelajahi
          produk, bukan membaca katalog.
        </KepalaBagian>
        <KarouselFitur />
      </div>
    </section>
  );
}

function Tentang() {
  const kiri = useReveal();
  const kanan = useReveal();
  return (
    <section id="tentang" className="scroll-mt-24 bg-white px-5 py-[72px] sm:px-[5vw] sm:py-[105px]">
      <div className="mx-auto grid max-w-[1260px] items-center gap-12 lg:grid-cols-[.82fr_1.18fr] lg:gap-[65px]">
        <div ref={kiri} className="sv-reveal">
          <Kicker>Why SatisView</Kicker>
          <h2 className="mt-2 text-[clamp(34px,4vw,56px)] leading-[1.05] font-bold tracking-[-0.045em] text-brand-900">
            Bukan sekadar dashboard.
            <br />
            <Serif>Satu ruang untuk memahami kualitas layanan.</Serif>
          </h2>
          <p className="mt-5 max-w-[560px] text-[14px] leading-[1.9] text-[#5b6f86]">
            SatisView menyatukan hasil survei lintas responden menjadi ringkasan kepuasan, prioritas perbaikan, peta persepsi,
            dan isu komentar yang siap digunakan stakeholder dalam evaluasi layanan kampus.
          </p>
          <button type="button" onClick={keMasuk} className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-extrabold text-brand-800 hover:text-brand-500">
            Mulai dari kuesioner <ArrowRightIcon size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div ref={kanan} className="sv-reveal grid gap-3 sm:grid-cols-[1.5fr_1fr]">
          <figure className="relative min-h-[320px] overflow-hidden rounded-[30px] bg-[#e8eef5] sm:min-h-[510px]">
            <picture>
              <source srcSet="/kampus-pens-udara.webp" type="image/webp" />
              <img src="/kampus-pens-udara.jpg" alt="Kampus PENS Surabaya dari udara" loading="lazy" className="absolute inset-0 size-full object-cover" />
            </picture>
            <figcaption className="absolute bottom-4 left-4 rounded-full bg-brand-950/80 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur">
              PENS · Surabaya
            </figcaption>
          </figure>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
            {[
              ['5', 'kelompok responden', 'bg-[#eef3f9] text-brand-900'],
              ['4', 'analitik utama', 'bg-brand-800 text-white'],
              ['1', 'dashboard evaluasi terintegrasi', 'border border-line bg-white text-brand-900'],
            ].map(([angka, label, cls]) => (
              <div key={label} className={`flex flex-col justify-end rounded-3xl p-4 sm:p-[23px] ${cls}`}>
                <strong className="text-[32px] leading-none font-bold tracking-[-0.055em] sm:text-[42px]">{angka}</strong>
                <span className="mt-2 text-[12px] leading-snug opacity-80">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const ALUR = [
  ['Kuesioner', 'Masukan dikumpulkan langsung melalui SatisView.'],
  ['Validasi', 'Data diperiksa agar lengkap, konsisten, dan siap dianalisis.'],
  ['Analisis', 'Indeks, prioritas, MDS, dan komentar diproses.'],
  ['Visualisasi', 'Insight disajikan dalam dashboard stakeholder.'],
  ['Tindak Lanjut', 'Pengelola menentukan fokus perbaikan layanan.'],
];
const TEKNOLOGI = ['Google Forms / Sheets', 'Form Web SatisView', 'Apache Kafka', 'Hadoop HDFS', 'Apache Airflow', 'PostgreSQL', 'React', 'JWT'];

function Alur() {
  return (
    <section id="alur" className="scroll-mt-24 bg-[#f7f9fc] px-5 py-[72px] sm:px-[5vw] sm:py-[105px]">
      <div className="mx-auto max-w-[1260px]">
        <KepalaBagian
          satuKolom
          kicker="From Response to Insight"
          judul={
            <>
              Dari respons menjadi insight yang <Serif>dapat ditindaklanjuti.</Serif>
            </>
          }
        />
        <ol className="relative mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-5 lg:gap-[22px]">
          <span
            className="absolute top-[15px] right-[5%] left-[5%] hidden h-[2px] bg-[linear-gradient(90deg,var(--color-gold),#cfd8e4,var(--color-gold))] lg:block"
            aria-hidden
          />
          {ALUR.map(([judul, teks], i) => (
            <li key={judul} className="relative flex gap-4 lg:block">
              <i className="relative grid size-[30px] shrink-0 place-items-center rounded-full bg-brand-800 text-[10px] font-extrabold text-white not-italic shadow-[0_0_0_8px_#eaf0f7]">
                0{i + 1}
              </i>
              <div>
                <h3 className="text-[15px] font-bold text-brand-900 lg:mt-5">{judul}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#5f7690]">{teks}</p>
              </div>
            </li>
          ))}
        </ol>
        <ul className="mt-10 flex flex-wrap gap-2" aria-label="Teknologi yang digunakan">
          {TEKNOLOGI.map((t) => (
            <li key={t} className="rounded-full border border-[#dbe4ee] bg-white px-3 py-1.5 text-[12px] text-[#4f6680]">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const PENGGUNA = [
  ['Tim Zona Integritas', 'Memantau evaluasi layanan dan mendukung dokumentasi peningkatan kualitas pelayanan.'],
  ['Pimpinan Kampus', 'Melihat kondisi layanan dan menentukan fokus kebijakan berdasarkan data.'],
  ['Unit Layanan', 'Menelusuri performa unit dan menyusun tindak lanjut perbaikan.'],
  ['Stakeholder Internal', 'Mengakses ringkasan evaluasi sesuai hak akses.'],
];

function Pengguna() {
  return (
    <section id="pengguna" className="scroll-mt-24 bg-white px-5 py-[72px] sm:px-[5vw] sm:py-[105px]">
      <div className="mx-auto max-w-[1260px]">
        <KepalaBagian
          kicker="Designed for Decisions"
          judul={
            <>
              Insight yang sama,
              <br />
              <Serif>kebutuhan yang berbeda.</Serif>
            </>
          }
        >
          SatisView menyajikan hasil evaluasi sesuai kebutuhan pengguna internal—tanpa membuka identitas pribadi responden.
        </KepalaBagian>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          {PENGGUNA.map(([judul, teks], i) => {
            const utama = i === 0;
            return (
              <article
                key={judul}
                className={`flex min-h-[200px] flex-col rounded-[22px] p-[23px] transition hover:-translate-y-0.5 lg:min-h-[220px] ${
                  utama ? 'bg-brand-800 text-white' : 'bg-[#eef3f9] text-brand-900'
                }`}
              >
                <span className={`font-serif text-[44px] leading-none ${utama ? 'text-gold' : 'text-gold-600'}`}>0{i + 1}</span>
                <h3 className="mt-auto pt-10 text-[17px] font-bold">{judul}</h3>
                <p className={`mt-1.5 text-[13px] leading-relaxed ${utama ? 'text-brand-100' : 'text-[#5f7690]'}`}>{teks}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Penutup() {
  return (
    <section className="on-dark relative isolate grid min-h-[460px] place-items-center px-5 py-20 text-center text-white sm:min-h-[510px]">
      <picture>
        <source srcSet="/kampus-pens-udara.webp" type="image/webp" />
        <img src="/kampus-pens-udara.jpg" alt="" loading="lazy" className="absolute inset-0 -z-20 size-full object-cover" />
      </picture>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(5_29_63/0.93),rgb(5_29_63/0.62))]" />
      <div className="max-w-[760px]">
        <Kicker terang>Ready to explore</Kicker>
        <h2 className="mx-auto mt-2.5 mb-4 max-w-[700px] text-[clamp(38px,5.3vw,76px)] leading-none font-bold tracking-[-0.045em]">
          Temukan insight di balik setiap respons.
        </h2>
        <p className="mb-7 text-[15px] text-white/85">
          Masuk ke SatisView untuk mengisi kuesioner atau mengakses dashboard analitik sesuai peran Anda.
        </p>
        <button
          type="button"
          onClick={keMasuk}
          className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3.5 text-[15px] font-bold text-brand-950 transition hover:-translate-y-px hover:brightness-105"
        >
          Akses SatisView <ArrowRightIcon size={17} strokeWidth={2.4} />
        </button>
      </div>
    </section>
  );
}

export default function Landing() {
  useEffect(() => {
    document.title = 'SatisView — Analitik Kepuasan Layanan Kampus PENS';
  }, []);
  return (
    <div className="bg-white text-brand-900">
      <Navbar />
      <main>
        <Hero />
        <Fitur />
        <Tentang />
        <Alur />
        <Pengguna />
        <Penutup />
      </main>
      <footer className="bg-brand-950 px-5 py-7 text-[12px] text-brand-200 sm:px-[5vw]">
        <div className="mx-auto flex max-w-[1260px] flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <Logo putih className="h-8" />
          <p>© SatisView Team · Politeknik Elektronika Negeri Surabaya</p>
        </div>
      </footer>
    </div>
  );
}
