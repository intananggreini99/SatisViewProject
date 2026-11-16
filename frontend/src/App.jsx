import { lazy, Suspense, useEffect } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { GROUPS } from './lib/constants.js';
import { navigate, useRoute } from './lib/router.js';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';

// Dashboard & form dimuat terpisah agar halaman utama ringan (D3 hanya untuk dashboard).
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Kuesioner = lazy(() => import('./pages/Kuesioner.jsx'));

function Memuat() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-sm text-ink-soft">
        <span className="size-10 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand" aria-hidden />
        Memuat SatisView…
      </div>
    </div>
  );
}

function Alihkan({ ke }) {
  useEffect(() => navigate(ke, { replace: true }), [ke]);
  return <Memuat />;
}

/**
 * Peta halaman (hash):
 *   #/                       landing page
 *   #/masuk                  pilih akses: responden -> form, pengelola -> login JWT
 *   #/kuesioner/<kelompok>   form kuisioner (tanpa login)
 *   #/dashboard/<kelompok>/<tab>  dashboard hasil analisis (hanya pengguna terdaftar)
 */
export default function App() {
  const { segments, query, raw } = useRoute();
  const { pengguna } = useAuth();
  const [halaman, kunci] = segments;

  useEffect(() => {
    if (halaman !== 'dashboard') window.scrollTo(0, 0);
  }, [halaman, kunci]);

  let isi;
  if (!halaman) isi = <Landing />;
  else if (halaman === 'masuk') isi = <Login peranAwal={query.get('peran')} lanjut={query.get('lanjut')} />;
  else if (halaman === 'kuesioner') isi = <Kuesioner key={kunci} kelompok={kunci} />;
  else if (halaman === 'dashboard') {
    isi = pengguna ? <Dashboard /> : <Alihkan ke={`/masuk?peran=pengelola&lanjut=${encodeURIComponent(raw)}`} />;
  } else if (GROUPS.some((g) => g.key === halaman)) {
    // tautan lama (#/mahasiswa/kpi) -> dashboard
    isi = <Alihkan ke={`/dashboard/${raw}`} />;
  } else isi = <Alihkan ke="/" />;

  return <Suspense fallback={<Memuat />}>{isi}</Suspense>;
}
