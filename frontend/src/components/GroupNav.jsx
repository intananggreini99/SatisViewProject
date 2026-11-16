import { useCallback, useEffect, useRef, useState } from 'react';
import { GROUPS } from '../lib/constants.js';

const STATUS_TITLE = { empty: 'Belum ada respons', no_data: 'Data belum diproses' };

/** Pilihan kelompok responden (pil, aktif = kuning PENS). Dapat digeser di layar sempit. */
export default function GroupNav({ group, onGroupChange, groupStatus }) {
  const listRef = useRef(null);
  const activeRef = useRef(null);
  const [more, setMore] = useState({ left: false, right: false });

  // Bayangan tepi menandakan masih ada pilihan di luar layar (umpan balik saat digeser).
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
    measure();
  }, [group, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <nav aria-label="Kelompok responden" className="mx-auto w-full max-w-[1320px] px-3 pt-4 sm:px-6 lg:px-10">
      <div className="relative max-w-full rounded-full border border-line bg-white shadow-card sm:w-fit">
        <ul ref={listRef} onScroll={measure} className="no-scrollbar flex gap-1 overflow-x-auto rounded-full p-1.5">
          {GROUPS.map((g) => {
            const active = g.key === group;
            const status = groupStatus?.[g.key];
            const pending = status && status !== 'ready';
            return (
              <li key={g.key} className="shrink-0">
                <button
                  ref={active ? activeRef : undefined}
                  type="button"
                  onClick={() => onGroupChange(g.key)}
                  aria-current={active ? 'page' : undefined}
                  title={pending ? STATUS_TITLE[status] : undefined}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm whitespace-nowrap transition sm:px-5 ${
                    active ? 'bg-gold font-bold text-brand-950' : 'font-medium text-brand-800 hover:bg-brand-50'
                  }`}
                >
                  {g.label}
                  {pending && (
                    <span
                      className={`size-2 rounded-full ${active ? 'bg-brand-900/45' : 'bg-brand-200'}`}
                      aria-label={`(${STATUS_TITLE[status] ?? 'belum ada data'})`}
                      role="img"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 w-10 rounded-l-full bg-gradient-to-r from-white to-transparent transition-opacity ${more.left ? 'opacity-100' : 'opacity-0'}`}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-full bg-gradient-to-l from-white to-transparent transition-opacity ${more.right ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
    </nav>
  );
}
