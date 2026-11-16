import { TABS } from '../lib/constants.js';
import { DownloadIcon, LogOutIcon, MenuIcon } from './Icons.jsx';
import Logo from './Logo.jsx';

/**
 * Navbar putih: tombol menu, logo, menu analisis (KPI / Mapping / Text Analytics),
 * dan tombol Report. Di layar < 1024 px menu analisis disembunyikan dan dipindah
 * ke sidebar (Drawer) yang dibuka lewat tombol menu.
 */
export default function Header({ tab, onTabChange, onMenu, onReport, reportBusy, pengguna, onLogout }) {
  const onKeyDown = (event) => {
    const index = TABS.findIndex((t) => t.key === tab);
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    if (next !== null) {
      event.preventDefault();
      onTabChange(TABS[next].key);
      document.getElementById(`tab-${TABS[next].key}`)?.focus();
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 shadow-[0_1px_0_var(--color-line),0_10px_24px_-20px_rgb(11_43_75/0.6)] backdrop-blur-md">
      {/* Garis tiga warna khas templat PENS: biru, kuning, biru muda */}
      <div className="flex h-1" aria-hidden>
        <span className="flex-1 bg-brand" />
        <span className="flex-1 bg-gold" />
        <span className="flex-1 bg-brand-300" />
      </div>
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={onMenu}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-brand transition hover:bg-brand-50 active:bg-brand-100"
          aria-label="Buka menu"
        >
          <MenuIcon size={24} />
        </button>
        <Logo size="md" className="mr-4 shrink-0" />

        <nav aria-label="Jenis analisis" className="hidden lg:block">
          <div role="tablist" aria-label="Jenis analisis" onKeyDown={onKeyDown} className="flex items-center gap-1">
            {TABS.map((t) => {
              const active = t.key === tab;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  id={`tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="panel-utama"
                  tabIndex={active ? 0 : -1}
                  onClick={() => onTabChange(t.key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] whitespace-nowrap transition ${
                    active
                      ? 'bg-brand font-semibold text-white shadow-[0_6px_14px_-6px_rgb(20_72_122/0.7)]'
                      : 'font-medium text-brand-800 hover:bg-brand-50'
                  }`}
                >
                  <Icon size={17} className={active ? 'text-gold' : 'text-brand-400'} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        <button
          type="button"
          onClick={onReport}
          disabled={reportBusy}
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border-[1.5px] border-gold bg-gold-50 px-3 py-2 text-sm font-semibold text-brand-900 transition hover:bg-gold-100 active:bg-gold-200 disabled:cursor-wait disabled:opacity-70 sm:px-4"
          aria-label="Unduh laporan SatisView (PDF)"
        >
          <span className="hidden sm:inline">{reportBusy ? 'Memeriksa…' : 'Report'}</span>
          <DownloadIcon size={18} className={reportBusy ? 'animate-pulse' : ''} />
        </button>
        {pengguna && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-[180px] flex-col text-right leading-tight xl:flex" title={pengguna.username}>
              <span className="truncate text-[13px] font-semibold text-brand-900">{pengguna.nama}</span>
              <span className="text-[11px] text-ink-muted capitalize">{pengguna.peran}</span>
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="grid size-10 place-items-center rounded-full border border-line text-brand transition hover:border-brand-200 hover:bg-brand-50"
              aria-label={`Keluar (${pengguna.nama})`}
              title="Keluar"
            >
              <LogOutIcon size={18} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
