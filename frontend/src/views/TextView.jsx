import { useEffect, useMemo, useState } from 'react';
import { api, fetchJson } from '../api/client.js';
import BarChart from '../charts/BarChart.jsx';
import { chartLabel } from '../charts/chartUtils.js';
import Dropdown from '../components/Dropdown.jsx';
import { ChatIcon, ChartIcon, SearchIcon } from '../components/Icons.jsx';
import SegmentFilter from '../components/SegmentFilter.jsx';
import { Card, DataState, RetryButton, Skeleton, StateMessage, TitlePill, ViewHeading } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { COLORS, SEMUA } from '../lib/constants.js';
import { fmtInt, fmtPct, idLocale } from '../lib/format.js';

const PAGE = 20;
const TANPA_ASPEK = '__tanpa_aspek__';
const countFormat = idLocale.format(',d');

function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Kata paling sering muncul setelah preprocessing teks tim (stopword dibuang, kata di-stem). */
function TopWords({ words }) {
  if (!words.length) return null;
  const max = words[0].count || 1;
  return (
    <section className="mt-6 border-t border-line pt-5" aria-labelledby="judul-kata">
      <h3 id="judul-kata" className="text-[15px] font-semibold text-brand-900">
        Kata yang paling sering muncul
      </h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {words.slice(0, 18).map((w) => {
          const strength = w.count / max;
          return (
            <li
              key={w.word}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
                strength > 0.5
                  ? 'border-brand bg-brand text-white'
                  : strength > 0.25
                    ? 'border-brand-100 bg-brand-50 text-brand-800'
                    : 'border-line bg-white text-brand-800'
              }`}
              title={`“${w.word}” muncul ${fmtInt(w.count)} kali`}
            >
              {w.word}
              <span className={`text-[11px] font-semibold tabular ${strength > 0.5 ? 'text-gold' : 'text-ink-muted'}`}>{fmtInt(w.count)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11.5px] text-ink-muted">Bentuk dasar kata (stemming Sastrawi), tanpa kata umum/stopword.</p>
    </section>
  );
}

/** Daftar komentar dengan paginasi "tampilkan lebih banyak". */
function CommentList({ group, segment, topic, search }) {
  const [state, setState] = useState({ items: [], total: 0, loading: true, error: null, more: false });
  const [page, setPage] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: page === 0, more: page > 0, error: null }));
    fetchJson(api.comments(group, { segment, topic, search, limit: PAGE, offset: page * PAGE }), { signal: controller.signal })
      .then((data) =>
        setState((s) => ({
          items: page === 0 ? data.items : [...s.items, ...data.items],
          total: data.total ?? 0,
          loading: false,
          more: false,
          error: null,
        })),
      )
      .catch((error) => {
        if (!controller.signal.aborted) setState((s) => ({ ...s, loading: false, more: false, error }));
      });
    return () => controller.abort();
  }, [group, segment, topic, search, page, nonce]);

  if (state.loading) {
    return (
      <div className="space-y-4 p-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (state.error && !state.items.length) {
    return (
      <StateMessage tone="error" title="Komentar gagal dimuat" action={<RetryButton onClick={() => setNonce((n) => n + 1)} />}>
        {state.error.message}
      </StateMessage>
    );
  }
  if (!state.items.length) {
    return (
      <StateMessage title="Tidak ada komentar">
        {search ? `Tidak ada komentar yang memuat “${search}”.` : 'Belum ada komentar untuk topik dan segmen ini.'}
      </StateMessage>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <ul className="sv-scroll max-h-[560px] divide-y divide-line px-5 sm:px-6" aria-label="Daftar komentar">
        {state.items.map((c) => (
          <li key={c.id} className="py-4">
            <p className="text-[14.5px] leading-relaxed text-ink">{c.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
              {c.aspects.length ? (
                c.aspects.map((a) => (
                  <span
                    key={a.key}
                    className={`rounded-full px-2.5 py-0.5 font-semibold ${a.key === topic ? 'bg-brand text-white' : 'bg-brand-50 text-brand-800'}`}
                  >
                    {a.short}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-dashed border-ink-muted/60 px-2.5 py-0.5">Aspek tidak terdeteksi</span>
              )}
              {c.segment && c.segment !== SEMUA && <span className="ml-1">· {c.segment}</span>}
              {c.question && <span className="hidden sm:inline">· {c.question}</span>}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
        <p className="text-sm text-ink-soft" aria-live="polite">
          Menampilkan <strong className="text-ink">{fmtInt(state.items.length)}</strong> dari {fmtInt(state.total)} komentar
        </p>
        {state.items.length < state.total && (
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={state.more}
            className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60"
          >
            {state.more ? 'Memuat…' : 'Tampilkan lebih banyak'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TextView({ group, segment, onSegmentChange, segments }) {
  const { data, error, loading, refreshing, reload } = useApi(api.topics(group.key, segment));
  const [topic, setTopic] = useState(null);
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim());

  const topics = useMemo(() => (data?.topics ?? []).filter((t) => t.count > 0), [data]);
  const total = data?.total ?? 0;
  const withoutAspect = data?.withoutAspect ?? 0;
  const top5 = useMemo(
    () =>
      topics.slice(0, 5).map((t) => ({
        key: t.key,
        label: chartLabel(t.label),
        value: t.count,
        valueLabel: countFormat(t.count),
        tooltip: {
          value: `${fmtInt(t.count)} komentar`,
          title: t.label,
          lines: [`${fmtPct(t.pct, 1)} dari seluruh komentar · peringkat ${t.rank}`],
        },
      })),
    [topics],
  );

  const topicOptions = useMemo(() => {
    const list = topics.map((t) => ({ value: t.key, label: t.label, count: t.count }));
    if (withoutAspect > 0) list.push({ value: TANPA_ASPEK, label: 'Aspek tidak terdeteksi', count: withoutAspect });
    return list;
  }, [topics, withoutAspect]);
  // Topik default = topik teratas; tetap dipertahankan bila masih ada setelah filter berubah.
  const activeTopic = topicOptions.some((t) => t.value === topic) ? topic : (topicOptions[0]?.value ?? null);
  const segmentLabel = segments.data?.segmentLabel ?? group.segmentLabel;
  const detected = total - withoutAspect;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <ViewHeading title="Text Analytics">
          {data?.status === 'ready' && total > 0 ? (
            <>
              <strong className="font-semibold text-ink">{fmtInt(total)} komentar</strong> terbuka; {fmtInt(detected)} (
              {fmtPct((detected / total) * 100, 1)}) menyebut minimal satu aspek. Satu komentar dapat menyebut lebih dari
              satu aspek.
            </>
          ) : (
            'Deteksi aspek layanan & fasilitas pada komentar dan saran responden.'
          )}
        </ViewHeading>
        <SegmentFilter
          segments={segments.data?.segments}
          segmentLabel={segmentLabel}
          value={segment}
          onChange={onSegmentChange}
          className="w-full shrink-0 md:w-[320px]"
        />
      </div>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : error || data?.status !== 'ready' ? (
        <Card>
          <DataState status={data?.status} error={error} onRetry={reload} groupLabel={group.label} what="komentar" />
        </Card>
      ) : total === 0 ? (
        <Card>
          <StateMessage title="Belum ada komentar">
            Responden {segment === SEMUA ? group.label : segment} belum menuliskan komentar atau saran terbuka.
          </StateMessage>
        </Card>
      ) : (
        <div
          className={`grid items-start gap-6 transition-opacity duration-300 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8 ${refreshing ? 'opacity-50' : ''}`}
          aria-busy={refreshing}
        >
          <Card className="px-5 pt-5 pb-5 sm:px-6" aria-labelledby="judul-top5">
            <TitlePill icon={ChartIcon}>
              <span id="judul-top5">Top {top5.length} Topik Komentar</span>
            </TitlePill>
            <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
              Jumlah komentar yang menyebut tiap aspek (kamus kata kunci tim) dari total {fmtInt(total)} komentar.
            </p>
            <div className="mt-3">
              {top5.length ? (
                <BarChart data={top5} color={COLORS.gold600} ariaLabel="Lima aspek yang paling sering disebut dalam komentar" />
              ) : (
                <p className="py-6 text-center text-sm text-ink-soft">Belum ada komentar yang menyebut aspek layanan.</p>
              )}
            </div>
            <TopWords words={data.words ?? []} />
          </Card>

          <Card className="relative overflow-visible" aria-label="Komentar per topik">
            <div className="px-5 pt-5 sm:px-6">
              <TitlePill icon={ChatIcon}>Komentar Responden</TitlePill>
              <div className="relative z-30 mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
                <Dropdown
                  label="Topik Komentar"
                  value={activeTopic}
                  options={topicOptions}
                  onChange={setTopic}
                  className="sm:flex-1"
                  renderOption={(o) => (
                    <span className="flex items-center justify-between gap-3">
                      {o.label}
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 text-[11px] font-semibold text-brand-700 tabular">
                        {fmtInt(o.count)}
                      </span>
                    </span>
                  )}
                />
                <label className="relative sm:w-[240px]">
                  <span className="sr-only">Cari kata dalam komentar</span>
                  <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-brand-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari kata, mis. wifi"
                    maxLength={100}
                    className="h-[54px] w-full rounded-2xl border border-line-strong bg-white pr-4 pl-11 text-[15px] text-ink transition placeholder:text-ink-muted hover:border-brand-300 focus:border-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                  />
                </label>
              </div>
            </div>
            <div className="mt-2 overflow-hidden rounded-b-[22px]">
              {activeTopic ? (
                <CommentList
                  key={`${group.key}|${segment}|${activeTopic}|${search}`}
                  group={group.key}
                  segment={segment}
                  topic={activeTopic}
                  search={search}
                />
              ) : (
                <StateMessage title="Belum ada komentar">Responden belum menuliskan komentar terbuka.</StateMessage>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
