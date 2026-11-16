import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fetchJson, postJson } from '../api/client.js';
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ClipboardIcon,
  ClockIcon,
  RefreshIcon,
  SendIcon,
  ShieldIcon,
} from '../components/Icons.jsx';
import Pertanyaan, { TeksKaya } from '../components/kuesioner/Pertanyaan.jsx';
import { Card, RetryButton, Skeleton, StateMessage } from '../components/ui.jsx';
import { useToast } from '../hooks/useToast.js';
import {
  bacaDraf,
  buatId,
  halamanBerikutnya,
  halamanDariGalat,
  hapusDraf,
  jalurHalaman,
  jawabanTerkirim,
  simpanDraf,
  susunHalaman,
  validasiHalaman,
} from '../lib/kuesioner.js';
import { navigate } from '../lib/router.js';

function Paragraf({ teks, className = '' }) {
  if (!teks) return null;
  return (
    <div className={`space-y-3 ${className}`}>
      {teks.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

function Logo() {
  return (
    <picture>
      <source srcSet="/logo-satisview.webp" type="image/webp" />
      <img src="/logo-satisview.png" alt="SatisView" width="448" height="128" className="h-9 w-auto sm:h-10" />
    </picture>
  );
}

function Bingkai({ children, label }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-40 bg-white/95 shadow-[0_1px_0_var(--color-line),0_10px_24px_-20px_rgb(11_43_75/0.6)] backdrop-blur-md">
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-brand" />
          <span className="flex-1 bg-gold" />
          <span className="flex-1 bg-brand-300" />
        </div>
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-3 sm:px-6 lg:px-10">
          <button type="button" onClick={() => navigate('/')} aria-label="SatisView, halaman utama">
            <Logo />
          </button>
          {label && (
            <span className="hidden border-l border-line pl-3 text-[13px] text-ink-soft md:inline">
              Kuesioner Kepuasan · <strong className="font-semibold text-brand-900">{label}</strong>
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate('/masuk')}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] font-semibold text-brand transition hover:border-brand-200 hover:bg-brand-50"
          >
            <ArrowLeftIcon size={15} /> Keluar Kuesioner
          </button>
        </div>
      </header>
      {children}
      <footer className="mt-auto border-t border-line bg-white">
        <p className="mx-auto max-w-[1240px] px-4 py-5 text-xs text-ink-muted sm:px-6 lg:px-10">
          © SatisView Team · Politeknik Elektronika Negeri Surabaya. Jawaban dikirim aman ke sistem SatisView dan hanya dipakai
          untuk evaluasi layanan.
        </p>
      </footer>
    </div>
  );
}

function Banner({ skema, jumlahHalaman, butir }) {
  const menit = Math.max(3, Math.round(butir * 0.12));
  return (
    <section className="mx-auto w-full max-w-[1240px] px-3 pt-4 sm:px-6 sm:pt-6 lg:px-10">
      <div className="on-dark relative isolate overflow-hidden rounded-[24px] shadow-banner sm:rounded-[28px]">
        <picture>
          <source srcSet="/hero-pens.webp" type="image/webp" />
          <img src="/hero-pens.jpg" alt="" className="absolute inset-0 -z-20 size-full object-cover object-[60%_35%]" />
        </picture>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgb(7_28_51/0.96)_0%,rgb(11_43_75/0.9)_45%,rgb(20_72_122/0.6)_80%,rgb(20_72_122/0.35)_100%)]" />
        <div className="px-5 py-6 sm:px-9 sm:py-8">
          <p className="text-xs font-semibold tracking-[0.14em] text-gold uppercase">Kuesioner Kepuasan</p>
          <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-tight text-white sm:text-[34px]">{skema.label}</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-100 sm:text-[15px]">{skema.judul}</p>
          <ul className="mt-4 flex flex-wrap gap-2 text-[12px] text-white">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 ring-1 ring-white/20">
              <ClipboardIcon size={14} className="text-gold" /> {jumlahHalaman} halaman · {butir} butir
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 ring-1 ring-white/20">
              <ClockIcon size={14} className="text-gold" /> ± {menit} menit
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 ring-1 ring-white/20">
              <ShieldIcon size={14} className="text-gold" /> Tanpa login, jawaban dijaga kerahasiaannya
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Kemajuan({ halaman, jalur, posisi, tersimpan }) {
  const persen = Math.round(((jalur.indexOf(posisi) + 1) / jalur.length) * 100);
  const nomorDiJalur = jalur.indexOf(posisi) + 1;
  return (
    <Card className="p-4 sm:p-5 lg:sticky lg:top-24">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold text-brand-900">Progres pengisian</span>
        <span className="text-ink-soft tabular" aria-live="polite">
          {nomorDiJalur} / {jalur.length}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-brand-50"
        role="progressbar"
        aria-label="Kemajuan pengisian"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={persen}
      >
        <span className="block h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${persen}%` }} />
      </div>
      <ol className="mt-4 hidden space-y-1 lg:block">
        {halaman.map((h, i) => {
          const dilalui = jalur.includes(i);
          const aktif = i === posisi;
          const selesai = dilalui && jalur.indexOf(i) < jalur.indexOf(posisi);
          return (
            <li
              key={h.id}
              aria-current={aktif ? 'step' : undefined}
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] ${aktif ? 'bg-brand-50 font-semibold text-brand-900' : dilalui ? 'text-ink-soft' : 'text-ink-muted/60 line-through decoration-ink-muted/40'}`}
            >
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  selesai ? 'bg-good text-white' : aktif ? 'bg-brand text-white' : 'bg-white text-ink-muted ring-1 ring-line'
                }`}
                aria-hidden
              >
                {selesai ? <CheckIcon size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 truncate">{h.pembuka ? 'Pembuka' : h.bagian.judul}</span>
              {!dilalui && <span className="sr-only">(dilewati)</span>}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 hidden text-[12px] leading-relaxed text-ink-muted lg:block">
        {tersimpan ? 'Jawaban tersimpan otomatis di perangkat ini sampai dikirim.' : 'Penyimpanan otomatis tidak tersedia di browser ini.'}
      </p>
    </Card>
  );
}

function Selesai({ skema, onLagi }) {
  return (
    <section className="mx-auto w-full max-w-[760px] px-3 py-8 sm:px-6 sm:py-12">
      <Card className="animate-fade-in px-6 py-10 text-center sm:px-12 sm:py-14">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-good-soft text-good">
          <CheckIcon size={32} strokeWidth={2.6} />
        </span>
        <h1 className="mt-5 text-[26px] font-bold tracking-tight text-brand-900 sm:text-[30px]" tabIndex={-1} id="judul-selesai">
          Terima kasih atas partisipasi Anda.
        </h1>
        <p className="mt-1 text-sm font-semibold text-good">Respons Anda telah tercatat.</p>
        {skema.pesan_selesai && <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-relaxed text-ink-soft">{skema.pesan_selesai}</p>}
        <div className="mt-8 flex flex-col justify-center gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            Kembali ke beranda
          </button>
          <button
            type="button"
            onClick={onLagi}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-brand transition hover:bg-brand-50"
          >
            Kirim respons lain
          </button>
        </div>
      </Card>
    </section>
  );
}

export default function Kuesioner({ kelompok }) {
  const { notify } = useToast();
  const [muat, setMuat] = useState({ skema: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const [isian, setIsian] = useState(null); // { id, jawaban, posisi, riwayat }
  const [galat, setGalat] = useState({});
  const [status, setStatus] = useState('isi'); // isi | kirim | selesai
  const [galatKirim, setGalatKirim] = useState(null);
  const [dipulihkan, setDipulihkan] = useState(false);
  const [bisaSimpan, setBisaSimpan] = useState(true);
  const judulRef = useRef(null);
  const honeypot = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setMuat((m) => ({ ...m, loading: true, error: null }));
    fetchJson(api.kuesioner(kelompok), { signal: controller.signal, withAuth: false })
      .then((skema) => {
        setMuat({ skema, error: null, loading: false });
        const draf = bacaDraf(kelompok, skema.versi);
        const jumlah = susunHalaman(skema).length;
        if (draf && draf.posisi < jumlah) {
          setIsian({ id: draf.id, jawaban: draf.jawaban, posisi: draf.posisi, riwayat: draf.riwayat ?? [] });
          setDipulihkan(Object.keys(draf.jawaban).length > 0);
        } else setIsian({ id: buatId(), jawaban: {}, posisi: 0, riwayat: [] });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMuat({ skema: null, error, loading: false });
      });
    return () => controller.abort();
  }, [kelompok, nonce]);

  const skema = muat.skema;
  const halaman = useMemo(() => (skema ? susunHalaman(skema) : []), [skema]);
  const butir = useMemo(
    () => (skema ? skema.bagian.flatMap((b) => b.pertanyaan).reduce((n, q) => n + (q.jenis === 'grid' ? q.baris.length : 1), 0) : 0),
    [skema],
  );

  useEffect(() => {
    document.title = skema ? `Kuesioner ${skema.label} — SatisView` : 'Kuesioner — SatisView';
  }, [skema]);

  // Simpan draf otomatis (setiap perubahan, ditunda sebentar).
  useEffect(() => {
    if (!skema || !isian || status === 'selesai') return undefined;
    const id = window.setTimeout(() => setBisaSimpan(simpanDraf(kelompok, { versi: skema.versi, ...isian })), 400);
    return () => window.clearTimeout(id);
  }, [isian, skema, kelompok, status]);

  const fokusJudul = () =>
    window.requestAnimationFrame(() => {
      judulRef.current?.focus({ preventScroll: true });
      document.getElementById('kartu-bagian')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

  const fokusGalat = () =>
    window.requestAnimationFrame(() => {
      const el = document.querySelector('[data-galat]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    });

  const ubahJawaban = useCallback((id, nilai) => {
    setIsian((s) => ({ ...s, jawaban: { ...s.jawaban, [id]: nilai } }));
    setGalat((g) => {
      if (!Object.keys(g).some((k) => k === id || k.startsWith(`${id}.`))) return g;
      const sisa = { ...g };
      for (const k of Object.keys(sisa)) if (k === id || k.startsWith(`${id}.`)) delete sisa[k];
      return sisa;
    });
  }, []);

  if (muat.loading || (skema && !isian)) {
    return (
      <Bingkai>
        <div className="mx-auto w-full max-w-[1240px] space-y-4 px-3 pt-6 sm:px-6 lg:px-10" role="status" aria-label="Memuat kuesioner">
          <Skeleton className="h-[170px]" />
          <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
            <Skeleton className="h-[260px]" />
            <Skeleton className="h-[520px]" />
          </div>
        </div>
      </Bingkai>
    );
  }

  if (muat.error) {
    const tidakAda = muat.error.status === 404;
    return (
      <Bingkai>
        <div className="mx-auto w-full max-w-[760px] px-3 py-10 sm:px-6">
          <Card>
            <StateMessage
              tone="error"
              title={tidakAda ? 'Kuesioner tidak ditemukan' : 'Kuesioner belum dapat dimuat'}
              action={
                tidakAda ? (
                  <button
                    type="button"
                    onClick={() => navigate('/masuk')}
                    className="mt-1 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
                  >
                    Pilih kuesioner
                  </button>
                ) : (
                  <RetryButton onClick={() => setNonce((n) => n + 1)} />
                )
              }
            >
              {tidakAda ? 'Pilih peran Anda di halaman akses untuk membuka kuesioner yang sesuai.' : muat.error.message}
            </StateMessage>
          </Card>
        </div>
      </Bingkai>
    );
  }

  if (status === 'selesai') {
    return (
      <Bingkai label={skema.label}>
        <Selesai
          skema={skema}
          onLagi={() => {
            setIsian({ id: buatId(), jawaban: {}, posisi: 0, riwayat: [] });
            setGalat({});
            setStatus('isi');
          }}
        />
      </Bingkai>
    );
  }

  const { jawaban, posisi, riwayat } = isian;
  const h = halaman[posisi];
  const jalurDasar = jalurHalaman(halaman, jawaban);
  const jalur = jalurDasar.includes(posisi) ? jalurDasar : [...riwayat, posisi];
  const berikut = halamanBerikutnya(halaman, posisi, jawaban);
  const terakhir = berikut === null;
  const nomorAwal = halaman
    .slice(0, posisi)
    .reduce((n, x) => n + (x.bagian?.pertanyaan.length ?? 0), 0);

  const lanjut = () => {
    const g = validasiHalaman(h, jawaban);
    setGalat(g);
    if (Object.keys(g).length) {
      fokusGalat();
      return;
    }
    setIsian((s) => ({ ...s, posisi: berikut, riwayat: [...s.riwayat, posisi] }));
    setDipulihkan(false);
    fokusJudul();
  };

  const kembali = () => {
    if (!riwayat.length) return;
    setGalat({});
    setDipulihkan(false);
    setIsian((s) => ({ ...s, posisi: s.riwayat[s.riwayat.length - 1], riwayat: s.riwayat.slice(0, -1) }));
    fokusJudul();
  };

  const kirim = async () => {
    const g = validasiHalaman(h, jawaban);
    setGalat(g);
    if (Object.keys(g).length) {
      fokusGalat();
      return;
    }
    setStatus('kirim');
    setGalatKirim(null);
    try {
      await postJson(
        api.kuesioner(kelompok),
        {
          id_pengiriman: isian.id,
          versi: skema.versi,
          jawaban: jawabanTerkirim(halaman, jawaban),
          situs_web: honeypot.current?.value ?? '',
        },
        { withAuth: false, timeoutMs: 30_000 },
      );
      hapusDraf(kelompok);
      setStatus('selesai');
      window.scrollTo({ top: 0 });
      window.requestAnimationFrame(() => document.getElementById('judul-selesai')?.focus());
    } catch (error) {
      setStatus('isi');
      if (error.status === 422 && error.body?.galat) {
        const j = halamanDariGalat(halaman, error.body.galat);
        setGalat(error.body.galat);
        if (j >= 0 && j !== posisi) setIsian((s) => ({ ...s, posisi: j, riwayat: [...s.riwayat, posisi] }));
        notify({ type: 'error', title: 'Periksa kembali jawaban', message: error.message });
        fokusGalat();
      } else if (error.status === 409) {
        notify({ type: 'error', title: 'Kuesioner diperbarui', message: 'Memuat versi terbaru. Jawaban yang masih sesuai tetap tersimpan.' });
        setNonce((n) => n + 1);
      } else {
        setGalatKirim(error.message);
      }
    }
  };

  const jumlahGalat = Object.keys(galat).filter((k) => !k.includes('.')).length;

  return (
    <Bingkai label={skema.label}>
      <Banner skema={skema} jumlahHalaman={jalur.length} butir={butir} />
      <div className="mx-auto grid w-full max-w-[1240px] items-start gap-5 px-3 pt-5 pb-14 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6 lg:px-10">
        <Kemajuan halaman={halaman} jalur={jalur} posisi={posisi} tersimpan={bisaSimpan} />

        <section id="kartu-bagian" className="min-w-0 scroll-mt-24 rounded-[22px] border border-line bg-white shadow-card">
          <div className="border-b border-line px-5 pt-6 pb-5 sm:px-8">
            <p className="text-[12px] font-semibold tracking-[0.12em] text-brand-500 uppercase">
              Bagian {jalur.indexOf(posisi) + 1} dari {jalur.length}
            </p>
            <h2 ref={judulRef} tabIndex={-1} className="mt-1 text-[22px] leading-snug font-bold tracking-tight text-brand-900 outline-none sm:text-[26px]">
              {h.pembuka ? skema.judul : h.bagian.judul}
            </h2>
            {h.pembuka && <Paragraf teks={skema.deskripsi} className="mt-3 text-[14px] leading-relaxed text-ink-soft sm:text-[15px]" />}
            {!h.pembuka && h.bagian.deskripsi && <Paragraf teks={h.bagian.deskripsi} className="mt-2 text-[14px] leading-relaxed text-ink-soft" />}
            <p className="mt-3 text-[12px] text-bad">* Menunjukkan pertanyaan yang wajib diisi</p>
          </div>

          <div className="space-y-4 px-3 py-5 sm:px-8 sm:py-7">
            {dipulihkan && (
              <div className="flex flex-col gap-2 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3 text-[13px] text-brand-900 sm:flex-row sm:items-center sm:justify-between" role="status">
                <span>Melanjutkan isian yang tersimpan di perangkat ini.</span>
                <button
                  type="button"
                  onClick={() => {
                    hapusDraf(kelompok);
                    setIsian({ id: buatId(), jawaban: {}, posisi: 0, riwayat: [] });
                    setDipulihkan(false);
                    setGalat({});
                  }}
                  className="inline-flex items-center gap-1.5 self-start font-semibold text-brand hover:underline"
                >
                  <RefreshIcon size={14} /> Mulai dari awal
                </button>
              </div>
            )}

            {jumlahGalat > 0 && (
              <div className="flex items-start gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-[13px] font-medium text-bad" role="alert">
                <AlertIcon size={17} className="mt-px shrink-0" />
                {jumlahGalat === 1 ? 'Ada 1 pertanyaan yang perlu dilengkapi.' : `Ada ${jumlahGalat} pertanyaan yang perlu dilengkapi.`}
              </div>
            )}

            {h.bagian?.pertanyaan.map((q, i) => (
              <Pertanyaan
                key={q.id}
                q={q}
                nomor={nomorAwal + i + 1}
                nilai={jawaban[q.id]}
                ubah={(v) => ubahJawaban(q.id, v)}
                galat={galat}
              />
            ))}

            {h.pembuka && !h.bagian && (
              <p className="rounded-2xl bg-brand-50 px-4 py-3 text-[13px] text-brand-800">
                Tekan <strong>Berikutnya</strong> untuk mulai mengisi.
              </p>
            )}

            {terakhir && h.bagian?.info_penutup && (
              <p className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-4 text-[14px] leading-relaxed text-brand-900">
                <TeksKaya teks={h.bagian.info_penutup} />
              </p>
            )}

            {/* Kolom jebakan bot: tidak terlihat & tidak bisa difokus pengguna */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Situs web
                <input ref={honeypot} type="text" tabIndex={-1} autoComplete="off" name="situs_web" defaultValue="" />
              </label>
            </div>

            {galatKirim && (
              <div className="flex flex-col gap-2 rounded-2xl border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad sm:flex-row sm:items-center sm:justify-between" role="alert">
                <span className="flex items-start gap-2">
                  <AlertIcon size={17} className="mt-px shrink-0" />
                  <span>
                    <strong className="block">Respons belum terkirim.</strong>
                    {galatKirim}
                  </span>
                </span>
                <button type="button" onClick={kirim} className="shrink-0 self-start rounded-full bg-bad px-4 py-2 whitespace-nowrap text-[13px] font-semibold text-white hover:brightness-110">
                  Kirim ulang
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-b-[22px] border-t border-line bg-canvas/60 px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={kembali}
              disabled={!riwayat.length || status === 'kirim'}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2.5 text-[14px] font-semibold text-brand transition hover:bg-brand-50 disabled:invisible"
            >
              <ArrowLeftIcon size={16} /> Kembali
            </button>
            {terakhir ? (
              <button
                type="button"
                onClick={kirim}
                disabled={status === 'kirim'}
                className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-[14px] font-bold text-brand-950 shadow-[0_8px_18px_-10px_rgb(201_133_0/0.9)] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-75"
              >
                {status === 'kirim' ? 'Mengirim…' : 'Kirim'} <SendIcon size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={lanjut}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-[14px] font-semibold text-white shadow-[0_8px_18px_-10px_rgb(20_72_122/0.9)] transition hover:bg-brand-800"
              >
                Berikutnya <ArrowRightIcon size={16} />
              </button>
            )}
          </div>
        </section>
      </div>
    </Bingkai>
  );
}
