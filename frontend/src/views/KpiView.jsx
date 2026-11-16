import { useCallback, useMemo, useState } from 'react';
import BarChart from '../charts/BarChart.jsx';
import { chartLabel } from '../charts/chartUtils.js';
import QuadrantChart from '../charts/QuadrantChart.jsx';
import { ChartIcon, ChevronDown, GaugeIcon, TrophyIcon, WrenchIcon } from '../components/Icons.jsx';
import SegmentFilter from '../components/SegmentFilter.jsx';
import { Card, DataState, Skeleton, TitlePill, ViewHeading } from '../components/ui.jsx';
import { COLORS, GRADE_TONES, LEVEL_COLORS } from '../lib/constants.js';
import { fmtDateTime, fmtIndex, fmtInt, fmtPct, fmtScore, fmtScore3, gradeOf, idLocale } from '../lib/format.js';
import { useApi } from '../hooks/useApi.js';
import { api } from '../api/client.js';

const TOP_N = 3;
const scoreFormat = idLocale.format(',.3f');

function aspectTooltip(a, total, scaleMax) {
  return {
    value: `Indeks ${fmtIndex(a.index)} · Mutu ${a.grade ?? gradeOf(a.index)?.grade ?? '–'}`,
    title: a.label,
    lines: [
      `Rata-rata skor ${fmtScore(a.mean)} dari ${scaleMax}`,
      `${fmtInt(a.responses)} responden · ${fmtInt(a.itemCount)} butir · peringkat ${a.rank} dari ${total}`,
    ],
  };
}

function priorityTooltip(p, total, scaleMax) {
  return {
    value: `Skor prioritas ${fmtScore3(p.score)}`,
    title: p.label,
    lines: [
      `Peringkat ${p.rank} dari ${total} · level ${p.level} · ${p.quadrant}`,
      `Kepuasan ${fmtScore(p.satisfaction)} dari ${scaleMax}`,
      `Dipilih ${fmtInt(p.chosen)} responden (${fmtPct(p.chosenPct, 1)}) sebagai paling perlu ditingkatkan`,
      `Disebut di ${fmtInt(p.comments)} komentar`,
    ],
  };
}

/** Cincin indeks 0–100 (proporsi terhadap nilai maksimum). */
function IndexRing({ value }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0)) / 100;
  return (
    <svg viewBox="0 0 140 140" className="size-[132px] shrink-0 sm:size-[148px]" role="img" aria-label={`Indeks total ${fmtIndex(value)} dari 100`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-brand-100)" strokeWidth="12" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(c * pct).toFixed(1)} ${c.toFixed(1)}`}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="74" textAnchor="middle" fontSize="27" fontWeight="700" fill="var(--color-brand-900)" className="tabular">
        {fmtIndex(value)}
      </text>
      <text x="70" y="93" textAnchor="middle" fontSize="10.5" fill="var(--color-ink-muted)">
        dari 100
      </text>
    </svg>
  );
}

function GradeTag({ grade, label }) {
  if (!grade) return null;
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${GRADE_TONES[grade] ?? GRADE_TONES.B}`}>
      Mutu {grade} · {label}
    </span>
  );
}

/** Kartu "Indeks Total": cincin indeks, kategori mutu, dan aspek tertinggi/terendah. */
function IndexTotal({ summary, scaleMax }) {
  const grade = gradeOf(summary.index);
  return (
    <Card className="p-5 sm:p-6">
      <TitlePill icon={GaugeIcon}>Indeks Total</TitlePill>
      <div className="mt-4 flex flex-wrap items-center gap-5 sm:gap-6">
        <IndexRing value={summary.index} />
        <div className="flex min-w-0 flex-col gap-2.5">
          <p className="text-sm text-ink-soft">
            Skala 0–100, setara rata-rata {fmtScore(((summary.index ?? 0) / 100) * scaleMax)} dari {scaleMax}
          </p>
          <GradeTag grade={summary.grade ?? grade?.grade} label={summary.performance ?? grade?.label} />
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
            <div>
              <dt className="sr-only">Jumlah responden</dt>
              <dd>
                <strong className="block text-lg font-bold text-brand-900 tabular">{fmtInt(summary.respondents)}</strong>responden
              </dd>
            </div>
            <div>
              <dt className="sr-only">Jumlah aspek</dt>
              <dd>
                <strong className="block text-lg font-bold text-brand-900 tabular">{fmtInt(summary.aspectCount)}</strong>aspek dinilai
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <ExtremeCard caption="Indeks tertinggi" item={summary.highest} tone="good" />
        <ExtremeCard caption="Indeks terendah" item={summary.lowest} tone="bad" />
      </div>
    </Card>
  );
}

function ExtremeCard({ caption, item, tone }) {
  const pill = tone === 'good' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad';
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-brand-50 px-4 py-3.5">
      <p className="text-xs font-medium text-ink-muted">{caption}</p>
      <p className="line-clamp-2 min-h-[2.5em] text-[15px] leading-tight font-semibold text-brand-900" title={item.label}>
        {item.label ?? '–'}
      </p>
      <p className={`w-fit rounded-full px-3 py-0.5 text-xl leading-snug font-bold tabular ${pill}`}>{fmtIndex(item.index)}</p>
    </div>
  );
}

function RankChart({ title, icon, data, color, max, valueFormat, caption, empty }) {
  return (
    <Card className="px-5 pt-5 pb-4 sm:px-6">
      <TitlePill icon={icon}>{title}</TitlePill>
      {caption && <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">{caption}</p>}
      <div className="mt-3">
        {data.length ? (
          <BarChart data={data} color={color} max={max} valueFormat={valueFormat} ariaLabel={title} />
        ) : (
          <p className="py-8 text-center text-sm text-ink-soft">{empty}</p>
        )}
      </div>
    </Card>
  );
}

function AspectItem({ item, scaleMax }) {
  const pct = Math.max(0, Math.min(100, item.index ?? 0));
  return (
    <li className="py-3 first:pt-1">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13.5px] leading-snug text-ink">{item.text}</p>
        <span className="shrink-0 text-[13px] font-bold text-brand-900 tabular">{fmtIndex(item.index)}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-brand-50"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(pct.toFixed(2))}
        aria-label={`Indeks butir ${fmtIndex(item.index)}`}
      >
        <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11.5px] text-ink-muted">
        Rata-rata {fmtScore(item.mean)} dari {scaleMax} · {fmtInt(item.responses)} responden · {item.code}
      </p>
    </li>
  );
}

function AspectPanel({ aspects, items, scaleMax, className = '' }) {
  const [openKey, setOpenKey] = useState(() => aspects[0]?.key ?? null);
  return (
    <Card className={`flex flex-col px-5 pt-5 pb-5 sm:px-6 ${className}`}>
      <TitlePill icon={ChartIcon}>Aspek Kuisioner</TitlePill>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
        Buka tiap aspek untuk melihat skor per pertanyaan. Indeks butir = rata-rata skor ÷ {scaleMax} × 100.
      </p>
      <ul className="sv-scroll mt-4 min-h-0 flex-1 space-y-2.5 pr-2">
        {aspects.map((a) => {
          const open = openKey === a.key;
          const list = items[a.key] ?? [];
          const panelId = `aspek-${a.order}`;
          const grade = a.grade ?? gradeOf(a.index)?.grade;
          const pct = Math.max(0, Math.min(100, a.index ?? 0));
          return (
            <li key={a.key} className={`rounded-2xl border bg-white transition ${open ? 'border-brand-200 shadow-card' : 'border-line'}`}>
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : a.key)}
                aria-expanded={open}
                aria-controls={panelId}
                className="w-full rounded-2xl px-4 py-3 text-left transition hover:bg-brand-50/60"
              >
                <span className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-brand-900">{a.label}</span>
                  {grade && (
                    <span className={`shrink-0 rounded-md px-1.5 text-[11px] font-bold ${GRADE_TONES[grade] ?? ''}`} title={`Mutu ${grade}`}>
                      {grade}
                    </span>
                  )}
                  <span className="shrink-0 text-sm font-bold text-brand-900 tabular" title="Indeks aspek">
                    {fmtIndex(a.index)}
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-gold-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-brand-50" aria-hidden>
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </span>
              </button>
              {open && (
                <ul id={panelId} className="animate-fade-in divide-y divide-line border-t border-line px-4 pb-2">
                  {list.map((item) => (
                    <AspectItem key={item.code} item={item} scaleMax={scaleMax} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LevelLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-soft">
      {Object.entries(LEVEL_COLORS).map(([level, color]) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full ring-2 ring-white" style={{ background: color }} /> Prioritas {level.toLowerCase()}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-5 border-t-2 border-dashed border-ink-muted" /> rata-rata
      </span>
    </div>
  );
}

/** Drill-down notebook tim (sel 17): 3 butir terendah pada aspek prioritas teratas. */
function LowestItems({ priority, items, scaleMax, highlight, onHighlight }) {
  return (
    <ol className="space-y-5">
      {priority.slice(0, 3).map((p) => {
        const lowest = [...(items[p.key] ?? [])].sort((a, b) => a.mean - b.mean).slice(0, 3);
        const active = highlight === p.key;
        return (
          <li key={p.key}>
            <button
              type="button"
              onClick={() => onHighlight(active ? null : p.key)}
              aria-pressed={active}
              className={`flex w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left transition ${active ? 'bg-gold-100 shadow-[inset_0_0_0_1.5px_var(--color-gold)]' : 'hover:bg-white'}`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white tabular">
                {p.rank}
              </span>
              <span className="min-w-0 flex-1 text-[15px] leading-tight font-semibold text-brand-900">{p.label}</span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ background: LEVEL_COLORS[p.level] ?? COLORS.brand }}
              >
                {p.level}
              </span>
            </button>
            <ul className="mt-2 space-y-2 pl-11">
              {lowest.map((item) => (
                <li key={item.code} className="text-[13px] leading-snug text-ink">
                  <div className="flex items-start justify-between gap-3">
                    <span>{item.text}</span>
                    <span className="shrink-0 font-bold text-bad tabular">{fmtScore(item.mean)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden>
                    <div className="h-full rounded-full bg-bad" style={{ width: `${((item.mean ?? 0) / scaleMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function PrioritySection({ priority, items, scaleMax, summary }) {
  const [highlight, setHighlight] = useState(null);
  const onSelect = useCallback((key) => setHighlight(key), []);
  const data = useMemo(
    () =>
      priority.map((p) => ({
        key: p.key,
        label: p.label,
        short: p.short,
        x: p.chosenPct,
        y: p.satisfaction,
        level: p.level,
        quadrant: p.quadrant,
        tooltip: priorityTooltip(p, priority.length, scaleMax),
      })),
    [priority, scaleMax],
  );
  const meanX = priority.reduce((s, p) => s + (p.chosenPct ?? 0), 0) / (priority.length || 1);
  const meanY = priority.reduce((s, p) => s + (p.satisfaction ?? 0), 0) / (priority.length || 1);
  const counts = Object.fromEntries(['Prioritas Utama', 'Pertahankan', 'Prioritas Rendah', 'Sudah Cukup'].map((q) => [q, 0]));
  priority.forEach((p) => {
    counts[p.quadrant] = (counts[p.quadrant] ?? 0) + 1;
  });

  return (
    <Card className="mt-6 px-4 pt-5 pb-6 sm:mt-8 sm:px-6" aria-labelledby="judul-prioritas">
      <TitlePill icon={WrenchIcon}>
        <span id="judul-prioritas">Analisis Prioritas Perbaikan</span>
      </TitlePill>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="max-w-[640px] text-sm leading-relaxed text-ink-soft">
          Gabungan tiga sumber data: skor kepuasan, pilihan “paling perlu ditingkatkan”
          {Number.isFinite(summary.priorityRespondents) && <> ({fmtInt(summary.priorityRespondents)} pengisi)</>}, dan
          frekuensi aspek di komentar. Kuadran kanan-bawah = sering dipilih tetapi kepuasannya di bawah rata-rata.
        </p>
        <LevelLegend />
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0">
          <QuadrantChart data={data} meanX={meanX} meanY={meanY} scaleMax={scaleMax} highlight={highlight} onSelect={onSelect} />
          <p className="mt-1 text-center text-[11.5px] text-ink-muted">
            {Object.entries(counts)
              .filter(([, n]) => n > 0)
              .map(([q, n]) => `${q}: ${n}`)
              .join(' · ')}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-canvas px-4 py-5 sm:px-5">
          <h3 className="text-[15px] font-semibold text-brand-900">Butir terendah pada aspek prioritas</h3>
          <p className="mt-1 mb-4 text-xs text-ink-soft">
            Rata-rata skor tiap butir (skala 1–{scaleMax}); klik aspek untuk menyorot di grafik.
          </p>
          <LowestItems priority={priority} items={items} scaleMax={scaleMax} highlight={highlight} onHighlight={setHighlight} />
        </div>
      </div>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8">
      <div className="space-y-6">
        <Skeleton className="h-72" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-[640px]" />
    </div>
  );
}

export default function KpiView({ group, segment, onSegmentChange, segments }) {
  const { data, error, loading, refreshing, reload } = useApi(api.kpi(group.key, segment));
  const summary = data?.summary;
  const scaleMax = summary?.scaleMax ?? 4;

  const ranked = useMemo(() => {
    const aspects = (data?.aspects ?? []).filter((a) => Number.isFinite(a.index));
    const priority = data?.priority ?? [];
    // Prioritas perbaikan = urutan skor prioritas tim; unggulan = indeks tertinggi di luar
    // daftar prioritas, agar satu aspek tidak tampil di dua grafik saat aspeknya sedikit.
    const nPriority = Math.min(TOP_N, Math.max(1, Math.floor(aspects.length / 2)), priority.length);
    const prioritas = priority.slice(0, nPriority);
    const keys = new Set(prioritas.map((p) => p.key));
    const unggulan = aspects
      .filter((a) => !keys.has(a.key))
      .sort((a, b) => b.index - a.index || a.order - b.order)
      .slice(0, Math.min(TOP_N, aspects.length - nPriority));
    return {
      top: unggulan.map((a) => ({
        key: a.key,
        label: chartLabel(a.label),
        value: a.index,
        tooltip: aspectTooltip(a, aspects.length, scaleMax),
      })),
      bottom: prioritas.map((p) => ({
        key: p.key,
        label: chartLabel(p.label),
        value: p.score,
        valueLabel: scoreFormat(p.score ?? 0),
        tooltip: priorityTooltip(p, priority.length, scaleMax),
      })),
    };
  }, [data, scaleMax]);

  const segmentLabel = segments.data?.segmentLabel ?? group.segmentLabel;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <ViewHeading title="Key Performance Indicator">
          {summary ? (
            <>
              <strong className="font-semibold text-ink">{fmtInt(summary.respondents)} responden</strong> menilai{' '}
              {fmtInt(summary.aspectCount)} aspek layanan & fasilitas
              {summary.updatedAt && <>, diperbarui {fmtDateTime(summary.updatedAt)}</>}.
            </>
          ) : (
            'Ringkasan indeks kepuasan layanan dan fasilitas kampus.'
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
        <KpiSkeleton />
      ) : error || data?.status !== 'ready' ? (
        <Card>
          <DataState status={data?.status} error={error} onRetry={reload} groupLabel={group.label} what="ringkasan KPI" />
        </Card>
      ) : (
        <div className={`transition-opacity duration-300 ${refreshing ? 'opacity-50' : ''}`} aria-busy={refreshing}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8">
            <div className="flex min-w-0 flex-col gap-6">
              <IndexTotal summary={summary} scaleMax={scaleMax} />
              <RankChart
                title={`${ranked.top.length} Layanan Unggulan`}
                icon={TrophyIcon}
                data={ranked.top}
                color={COLORS.good}
                max={100}
                caption="Indeks kepuasan (0–100) tertinggi."
                empty="Belum ada aspek yang dinilai."
              />
              <RankChart
                title={`${ranked.bottom.length} Layanan Prioritas Perbaikan`}
                icon={WrenchIcon}
                data={ranked.bottom}
                color={COLORS.bad}
                max={1}
                valueFormat={scoreFormat}
                caption="Skor prioritas (0–1) = ⅓ ketidakpuasan + ⅓ % responden memilih + ⅓ frekuensi di komentar."
                empty="Belum ada hasil priority analysis."
              />
            </div>
            {/* Panel kanan mengikuti tinggi kolom kiri (seimbang), isi bergulir di dalam. */}
            <div className="relative min-w-0">
              <AspectPanel
                key={group.key}
                aspects={data.aspects}
                items={data.items}
                scaleMax={scaleMax}
                className="max-h-[680px] lg:absolute lg:inset-0 lg:max-h-none"
              />
            </div>
          </div>
          {data.priority.length > 0 && (
            <PrioritySection priority={data.priority} items={data.items} scaleMax={scaleMax} summary={summary} />
          )}
        </div>
      )}
    </div>
  );
}
