import { useEffect, useRef } from 'react';
import { TABS } from '../lib/constants.js';
import { GRADES, fmtDateTime, fmtIndex, fmtInt } from '../lib/format.js';
import { BookIcon, CloseIcon, DocIcon, DownloadIcon, LogOutIcon, UserIcon, UsersIcon } from './Icons.jsx';
import Logo from './Logo.jsx';

const STATUS_TEXT = {
  ready: { label: 'Siap', cls: 'bg-good-soft text-good' },
  empty: { label: 'Belum ada respons', cls: 'bg-brand-50 text-brand-700' },
  no_data: { label: 'Belum diproses', cls: 'bg-brand-50 text-brand-700' },
};

function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
      {Icon && <Icon size={17} className="text-brand-400" />}
      {children}
    </h2>
  );
}

/**
 * Sidebar (tombol menu): menu analisis — tampil di sini saat layar < 1024 px —,
 * status data tiap kelompok, unduh laporan, dan cara membaca indeks.
 */
export default function Drawer({ open, onClose, groups, currentGroup, onGroupChange, tab, onTabChange, onReport, pengguna, onLogout }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panelRef.current) {
        const focusables = [...panelRef.current.querySelectorAll('button, a[href]')].filter((el) => el.offsetParent !== null);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open} inert={!open}>
      <div
        className={`absolute inset-0 bg-brand-950/45 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu SatisView"
        className={`absolute inset-y-0 left-0 flex w-[min(360px,88vw)] flex-col bg-white shadow-pop transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-1 shrink-0" aria-hidden>
          <span className="flex-1 bg-brand" />
          <span className="flex-1 bg-gold" />
          <span className="flex-1 bg-brand-300" />
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <Logo size="sm" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-xl text-brand transition hover:bg-brand-50"
            aria-label="Tutup menu"
          >
            <CloseIcon size={22} />
          </button>
        </div>

        <div className="sv-scroll flex-1 space-y-7 px-5 py-5">
          {/* Navbar menu analisis berpindah ke sini di tablet & ponsel */}
          <section className="lg:hidden" aria-label="Menu analisis">
            <SectionTitle>Menu analisis</SectionTitle>
            <ul className="mt-3 space-y-1">
              {TABS.map((t) => {
                const active = t.key === tab;
                const Icon = t.icon;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => {
                        onTabChange(t.key);
                        onClose();
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] transition ${
                        active ? 'bg-brand font-semibold text-white' : 'font-medium text-brand-900 hover:bg-brand-50'
                      }`}
                    >
                      <Icon size={20} className={active ? 'text-gold' : 'text-brand-400'} />
                      {t.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <SectionTitle icon={UsersIcon}>Kelompok responden</SectionTitle>
            <ul className="mt-3 space-y-2">
              {groups.map((g) => {
                const status = STATUS_TEXT[g.status] ?? STATUS_TEXT.no_data;
                const active = g.key === currentGroup;
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => {
                        onGroupChange(g.key);
                        onClose();
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        active ? 'border-gold bg-gold-50 shadow-[inset_4px_0_0_var(--color-gold)]' : 'border-line hover:border-brand-200 hover:bg-brand-50'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-brand-900">{g.label}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.cls}`}>{status.label}</span>
                      </span>
                      <span className="mt-1 block text-xs text-ink-soft">
                        {g.status === 'ready'
                          ? `${fmtInt(g.respondents)} responden, indeks ${fmtIndex(g.index)}`
                          : g.rawResponses
                            ? `${fmtInt(g.rawResponses)} respons mentah menunggu analisis`
                            : 'Menunggu respons kuisioner'}
                      </span>
                      {g.updatedAt && <span className="block text-[11px] text-ink-muted">Diperbarui {fmtDateTime(g.updatedAt)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <SectionTitle icon={DocIcon}>Dokumen</SectionTitle>
            <button
              type="button"
              onClick={() => {
                onClose();
                onReport();
              }}
              className="mt-3 flex w-full items-center justify-between rounded-2xl bg-gold px-4 py-3 font-semibold text-brand-950 transition hover:brightness-95 active:brightness-90"
            >
              Unduh SatisView_Report.pdf <DownloadIcon size={20} />
            </button>
          </section>

          <section>
            <SectionTitle icon={BookIcon}>Cara membaca indeks</SectionTitle>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Indeks = rata-rata skor jawaban ÷ skor maksimum skala (4, atau 5 untuk kuisioner berskala 1–5) × 100.
              Skor diambil dari jawaban kuisioner oleh kode preprocessing tim (mis. “4 - Sangat Baik” → 4). Indeks aspek = rerata skor butirnya; Indeks Total = rerata
              indeks aspek. Kategori mutu mengikuti IKM PermenPANRB No. 14/2017.
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              <table className="sv-table w-full">
                <thead>
                  <tr>
                    <th>Mutu</th>
                    <th>Rentang</th>
                    <th>Kinerja</th>
                  </tr>
                </thead>
                <tbody>
                  {GRADES.map((g) => (
                    <tr key={g.grade}>
                      <td className="font-bold">{g.grade}</td>
                      <td className="tabular">{g.range}</td>
                      <td>{g.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionTitle>Metode analisis tim</SectionTitle>
            <dl className="mt-2 space-y-2.5 text-sm leading-relaxed text-ink-soft">
              <div>
                <dt className="font-semibold text-ink">Prioritas perbaikan</dt>
                <dd>
                  Skor = ⅓ ketidakpuasan + ⅓ % responden memilih aspek + ⅓ frekuensi aspek di komentar (masing-masing
                  dinormalisasi min-max), lalu diurutkan dan dibagi tiga level: Tinggi, Sedang, Rendah.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Mapping Analytics</dt>
                <dd>
                  Multidimensional Scaling: jarak antar aspek = 1 − korelasi skor antar responden. Kecocokan peta diukur
                  dengan Kruskal Stress-1.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Text Analytics</dt>
                <dd>
                  Komentar dinormalisasi (kata tidak baku, stopword, stemming Sastrawi) lalu dicocokkan dengan kamus kata
                  kunci tiap aspek; satu komentar bisa menyebut beberapa aspek.
                </dd>
              </div>
            </dl>
          </section>
        </div>
        {pengguna && (
          <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
              <UserIcon size={19} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-brand-900">{pengguna.nama}</span>
              <span className="text-xs text-ink-muted capitalize">{pengguna.peran}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand-50"
            >
              <LogOutIcon size={15} /> Keluar
            </button>
          </div>
        )}
        <p className="shrink-0 border-t border-line px-5 py-4 text-xs text-ink-muted">
          © SatisView Team · Politeknik Elektronika Negeri Surabaya
        </p>
      </aside>
    </div>
  );
}
