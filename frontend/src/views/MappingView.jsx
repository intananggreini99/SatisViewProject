import { useCallback, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import BiplotChart from '../charts/BiplotChart.jsx';
import ScatterPlot2D from '../charts/ScatterPlot2D.jsx';
import ScatterPlot3D from '../charts/ScatterPlot3D.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { ChartIcon, InfoIcon, TableIcon } from '../components/Icons.jsx';
import SegmentFilter from '../components/SegmentFilter.jsx';
import { Card, DataState, GhostButton, Skeleton, StateMessage, ViewHeading } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { COLORS, SEMUA } from '../lib/constants.js';
import { fmtCoord, fmtIndex, fmtInt, fmtScore3 } from '../lib/format.js';

const ALL = '__semua__';
const VIEW_OPTIONS = [
  { value: '2d', label: 'Visualisasi 2D' },
  { value: '3d', label: 'Visualisasi 3D' },
  { value: 'responden', label: 'Peta Responden' },
];
const STRESS_TONE = {
  'sangat baik': 'bg-good-soft text-good',
  baik: 'bg-good-soft text-good',
  cukup: 'bg-gold-100 text-gold-700',
  'kurang baik': 'bg-bad-soft text-bad',
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const cosine = (a, b) => (a.x * b.x + a.y * b.y) / ((Math.hypot(a.x, a.y) || 1) * (Math.hypot(b.x, b.y) || 1));

function StressBadge({ stress }) {
  if (!stress) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STRESS_TONE[stress.interpretation] ?? 'bg-brand-50 text-brand'}`}
      title="Kruskal Stress-1: < 0,05 sangat baik · < 0,10 baik · < 0,20 cukup · ≥ 0,20 kurang baik"
    >
      Stress-1 {fmtScore3(stress.value)} · {stress.interpretation}
    </span>
  );
}

function Legend({ view, segment, segmentCount, groups }) {
  const dot = (color, label, cls = 'size-3.5 rounded-full ring-2 ring-white') => (
    <span className="inline-flex items-center gap-2">
      <span className={cls} style={{ background: color }} /> {label}
    </span>
  );
  if (view === 'responden') {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-soft">
        {segment !== SEMUA
          ? dot(COLORS.brand, `${segment}${Number.isFinite(segmentCount) ? ` (${fmtInt(segmentCount)})` : ''}`, 'size-3 rounded-full')
          : dot(COLORS.respondent, 'Responden', 'size-3 rounded-full')}
        {segment !== SEMUA && dot(COLORS.respondentSoft, 'Responden lain', 'size-3 rounded-full')}
        {groups.has('Layanan') && (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-0.5 w-5 rounded" style={{ background: COLORS.layanan }} /> Aspek layanan
          </span>
        )}
        {groups.has('Fasilitas') && (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-0.5 w-5 rounded" style={{ background: COLORS.fasilitas }} /> Aspek fasilitas
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-soft">
      {groups.has('Layanan') && dot(COLORS.layanan, 'Layanan')}
      {groups.has('Fasilitas') && dot(COLORS.fasilitas, 'Fasilitas')}
    </div>
  );
}

function HelpText({ view }) {
  if (view === 'responden') {
    return (
      <>
        Setiap titik adalah <strong>satu responden</strong>, ditempatkan dengan MDS dari jarak Euclidean skor
        aspeknya: responden yang berdekatan memberi penilaian yang mirip. <strong>Panah</strong> adalah korelasi skor
        aspek dengan Dimensi 1 & 2 — responden di arah panah cenderung memberi skor lebih tinggi pada aspek itu, dan
        panah yang searah menandakan aspek yang dinilai serupa. Peta ini dihitung untuk seluruh responden; filter
        segmen menyorot posisi responden segmen tersebut.
      </>
    );
  }
  return (
    <>
      Peta disusun dengan <strong>Multidimensional Scaling (MDS)</strong> dari jarak antar aspek = 1 − korelasi skor
      aspek antar responden. Aspek yang <strong>berdekatan</strong> cenderung dinilai serupa oleh responden yang sama
      (puas pada satu aspek, puas juga pada aspek di dekatnya). Sumbu MDS tidak memiliki satuan; yang dibaca adalah
      jarak antar titik. <strong>Stress-1</strong> menunjukkan kecocokan peta (&lt; 0,05 sangat baik, &lt; 0,10 baik,
      &lt; 0,20 cukup). Peta tiap segmen diputar (Procrustes) agar searah dengan peta seluruh responden. Aspek yang
      dijawab kurang dari separuh responden (mis. Klinik) tidak diikutkan.
    </>
  );
}

function CoordinateTable({ view, points, vectors }) {
  if (view === 'responden') {
    return (
      <div className="max-h-[480px] overflow-auto rounded-2xl border border-line">
        <table className="sv-table w-full">
          <caption className="sr-only">Korelasi skor aspek dengan dimensi peta responden</caption>
          <thead className="sticky top-0">
            <tr>
              <th>Aspek</th>
              <th>Kelompok</th>
              <th className="text-right">Korelasi Dim 1</th>
              <th className="text-right">Korelasi Dim 2</th>
            </tr>
          </thead>
          <tbody>
            {vectors.map((v) => (
              <tr key={v.name}>
                <td className="font-medium">{v.label}</td>
                <td>{v.group}</td>
                <td className="text-right tabular">{fmtScore3(v.x)}</td>
                <td className="text-right tabular">{fmtScore3(v.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="max-h-[480px] overflow-auto rounded-2xl border border-line">
      <table className="sv-table w-full">
        <caption className="sr-only">Koordinat MDS aspek</caption>
        <thead className="sticky top-0">
          <tr>
            <th>Aspek</th>
            <th>Kelompok</th>
            <th className="text-right">Indeks</th>
            <th className="text-right">Dimensi 1</th>
            <th className="text-right">Dimensi 2</th>
            {view === '3d' && <th className="text-right">Dimensi 3</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.name}>
              <td className="font-medium">{p.label}</td>
              <td>{p.group}</td>
              <td className="text-right tabular">{fmtIndex(p.index)}</td>
              <td className="text-right tabular">{fmtCoord(p.x)}</td>
              <td className="text-right tabular">{fmtCoord(p.y)}</td>
              {view === '3d' && <td className="text-right tabular">{fmtCoord(p.z)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectionSummary({ view, selected, points, vectors }) {
  if (!selected) {
    return (
      <p className="text-sm text-ink-soft">
        {view === 'responden'
          ? 'Klik ujung panah atau pilih aspek pada dropdown untuk melihat aspek yang searah.'
          : 'Klik titik atau pilih aspek pada dropdown untuk melihat aspek yang dinilai paling serupa.'}
      </p>
    );
  }
  if (view === 'responden') {
    const vector = vectors.find((v) => v.name === selected.name);
    const aligned = vectors
      .filter((v) => v.name !== selected.name)
      .map((v) => ({ ...v, c: cosine(v, vector) }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 3);
    return (
      <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-4">
        <p>
          <strong className="text-ink">{selected.label}</strong>
          <span className="text-ink-soft">
            {' '}
            · korelasi Dim 1 {fmtScore3(vector?.x)} · Dim 2 {fmtScore3(vector?.y)}
          </span>
        </p>
        <p className="text-ink-soft">
          Paling searah: <span className="font-semibold text-ink">{aligned.map((v) => v.short).join(', ') || '–'}</span>
        </p>
      </div>
    );
  }
  const nearest = points
    .filter((p) => p.name !== selected.name)
    .map((p) => ({ ...p, d: distance(p, selected) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-4">
      <p>
        <strong className="text-ink">{selected.label}</strong>
        <span className="text-ink-soft">
          {' '}
          · Indeks {fmtIndex(selected.index)} · {fmtInt(selected.responses)} responden
        </span>
      </p>
      <p className="text-ink-soft">
        Dinilai paling serupa: <span className="font-semibold text-ink">{nearest.map((p) => p.short).join(', ') || '–'}</span>
      </p>
    </div>
  );
}

export default function MappingView({ group, segment, onSegmentChange, segments }) {
  const { data, error, loading, refreshing, reload } = useApi(api.mapping(group.key, segment));
  const [aspect, setAspect] = useState(ALL);
  const [view, setView] = useState('2d');
  const [asTable, setAsTable] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const status = data?.status;
  const respondentMap = data?.respondentMap ?? null;
  const points2d = useMemo(() => data?.points ?? [], [data]);
  const points3d = useMemo(() => data?.points3d ?? [], [data]);
  const vectors = useMemo(() => respondentMap?.vectors ?? [], [respondentMap]);
  const has3d = points3d.length > 0;
  const activeView = view === '3d' && !has3d ? '2d' : view;
  const points = activeView === '3d' ? points3d : points2d;

  const aspectList = activeView === 'responden' || status === 'skipped' ? vectors : points2d;
  const aspectOptions = useMemo(
    () => [
      { value: ALL, label: 'Semua Aspek' },
      ...[...aspectList].sort((a, b) => a.label.localeCompare(b.label, 'id')).map((p) => ({ value: p.name, label: p.label })),
    ],
    [aspectList],
  );
  const viewOptions = useMemo(
    () => VIEW_OPTIONS.filter((o) => (o.value === '3d' ? has3d || status !== 'ready' : o.value !== 'responden' || respondentMap)),
    [has3d, status, respondentMap],
  );
  const highlight = aspect !== ALL && aspectList.some((p) => p.name === aspect) ? aspect : null;
  const selected = aspectList.find((p) => p.name === highlight) ?? null;
  const onSelect = useCallback((name) => setAspect(name ?? ALL), []);
  const segmentLabel = segments.data?.segmentLabel ?? group.segmentLabel;
  const segmentCount = segments.data?.segments?.find((s) => s.value === segment)?.respondents;
  const stress =
    activeView === 'responden' ? respondentMap?.stress : activeView === '3d' ? data?.stress?.aspects3d : data?.stress?.aspects2d;
  const showChart = status === 'ready' || (status === 'skipped' && activeView === 'responden' && respondentMap);

  return (
    <div>
      <div className="mb-5">
        <ViewHeading title="Mapping Analytics">
          Peta persepsi kedekatan aspek layanan & fasilitas berdasarkan pola penilaian responden (Multidimensional
          Scaling).
          {status === 'ready' && (
            <>
              {' '}
              <strong className="font-semibold text-ink">{fmtInt(data.respondents)} responden</strong> dengan jawaban lengkap,{' '}
              {fmtInt(data.aspectCount)} aspek.
            </>
          )}
        </ViewHeading>
      </div>
      <div className="relative z-30 mb-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <Dropdown label="Aspek" value={highlight ?? ALL} options={aspectOptions} onChange={setAspect} disabled={!aspectList.length} />
        <SegmentFilter segments={segments.data?.segments} segmentLabel={segmentLabel} value={segment} onChange={onSegmentChange} />
        <Dropdown label="Tampilan" value={activeView} options={viewOptions} onChange={setView} className="sm:col-span-2 lg:col-span-1" />
      </div>

      <Card className="relative overflow-visible px-3 pt-4 pb-4 sm:px-5 sm:pt-5">
        {loading ? (
          <Skeleton className="m-2 h-[520px]" />
        ) : error || (status !== 'ready' && status !== 'skipped') ? (
          <DataState status={status} error={error} onRetry={reload} groupLabel={group.label} what="hasil pemetaan" />
        ) : !showChart ? (
          <StateMessage
            title={`Peta MDS ${segment} belum dapat dihitung`}
            action={
              respondentMap && (
                <GhostButton onClick={() => setView('responden')} className="mt-1">
                  Lihat posisi responden {segment} di Peta Responden
                </GhostButton>
              )
            }
          >
            Segmen ini hanya memiliki {fmtInt(data.respondents)} responden, sedangkan MDS membutuhkan minimal{' '}
            {fmtInt(data.minRespondents)} responden yang menjawab semua aspek agar petanya stabil. Pilih segmen lain atau
            kembali ke “Semua”.
          </StateMessage>
        ) : (
          <div className={`transition-opacity duration-300 ${refreshing ? 'opacity-50' : ''}`} aria-busy={refreshing}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-2">
              <Legend
                view={activeView}
                segment={segment}
                segmentCount={segmentCount}
                groups={new Set((activeView === 'responden' ? vectors : points).map((p) => p.group))}
              />
              <div className="flex flex-wrap items-center gap-2">
                <StressBadge stress={stress} />
                <GhostButton active={showHelp} onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
                  <InfoIcon size={14} /> Cara membaca
                </GhostButton>
                <GhostButton onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
                  {asTable ? <ChartIcon size={14} /> : <TableIcon size={14} />} {asTable ? 'Grafik' : 'Tabel'}
                </GhostButton>
              </div>
            </div>

            {showHelp && (
              <div className="mx-2 mt-3 animate-fade-in rounded-2xl bg-brand-50 px-4 py-3 text-sm leading-relaxed text-ink-soft">
                <HelpText view={activeView} />
              </div>
            )}
            {status === 'skipped' && (
              <p className="mx-2 mt-3 rounded-2xl bg-gold-50 px-4 py-2.5 text-sm text-ink-soft shadow-[inset_0_0_0_1px_var(--color-gold-200)]">
                Peta aspek segmen ini tidak dihitung (responden &lt; {fmtInt(data.minRespondents)}); ditampilkan posisi
                responden {segment} pada peta seluruh responden.
              </p>
            )}

            <div className="mt-2">
              {asTable ? (
                <div className="p-2">
                  <CoordinateTable view={activeView} points={points} vectors={vectors} />
                </div>
              ) : activeView === 'responden' ? (
                <BiplotChart
                  points={respondentMap.points}
                  vectors={vectors}
                  highlightSegment={segment !== SEMUA ? segment : null}
                  highlightAspect={highlight}
                  onSelectAspect={onSelect}
                />
              ) : activeView === '3d' ? (
                <ScatterPlot3D points={points} highlight={highlight} onSelect={onSelect} />
              ) : (
                <ScatterPlot2D points={points} highlight={highlight} onSelect={onSelect} />
              )}
            </div>

            <div className="mx-2 mt-2 rounded-2xl bg-canvas px-4 py-3">
              <SelectionSummary view={activeView} selected={selected} points={points} vectors={vectors} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
