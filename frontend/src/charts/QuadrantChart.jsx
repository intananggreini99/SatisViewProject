import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import ChartTooltip from '../components/ChartTooltip.jsx';
import { useElementSize, usePrefersReducedMotion } from '../hooks/useElementSize.js';
import { COLORS, LEVEL_COLORS } from '../lib/constants.js';
import { fmtPct, fmtScore, idLocale } from '../lib/format.js';
import { measureText, placeLabels } from './chartUtils.js';

// Kuadran = rata-rata % dipilih (x) & rata-rata skor kepuasan (y), sama seperti notebook tim.
const QUADRANTS = [
  { key: 'Prioritas Utama', fill: '#B83A2B', opacity: 0.075, corner: 'bottom-right' },
  { key: 'Pertahankan', fill: '#14487A', opacity: 0.05, corner: 'top-right' },
  { key: 'Prioritas Rendah', fill: '#C98500', opacity: 0.07, corner: 'bottom-left' },
  { key: 'Sudah Cukup', fill: '#5F6F87', opacity: 0.045, corner: 'top-left' },
];

/**
 * Kuadran prioritas perbaikan (priority-analysis-mahasiswa.ipynb, sel 15).
 * data: [{ key, label, short, x: % dipilih, y: skor kepuasan, level, tooltip }]
 */
export default function QuadrantChart({ data, meanX, meanY, scaleMax = 4, height: heightProp, highlight, onSelect }) {
  const [wrapRef, { width }] = useElementSize();
  const svgRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [tip, setTip] = useState(null);
  const height = heightProp ?? (width && width < 520 ? 360 : 500);

  useEffect(() => {
    if (!width || !svgRef.current) return;
    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    const narrow = width < 520;
    const margin = { top: 16, right: narrow ? 12 : 20, bottom: 54, left: narrow ? 54 : 62 };
    const xMax = Math.max(10, d3.max(data, (d) => d.x) ?? 0, meanX ?? 0) * 1.12;
    const [yLo, yHi] = d3.extent([...data.map((d) => d.y), meanY].filter(Number.isFinite));
    const pad = Math.max(0.15, ((yHi ?? 1) - (yLo ?? 0)) * 0.18);
    const x = d3.scaleLinear().domain([0, Math.min(100, xMax)]).range([margin.left, width - margin.right]).nice(6);
    const y = d3
      .scaleLinear()
      .domain([Math.max(1, (yLo ?? 1) - pad), Math.min(scaleMax, (yHi ?? scaleMax) + pad)])
      .range([height - margin.bottom, margin.top])
      .nice(6);
    const [x0, x1] = x.range();
    const [y0, y1] = y.range(); // y0 = bawah
    const mx = x(meanX);
    const my = y(meanY);
    const duration = reduced ? 0 : 650;

    // Latar kuadran
    const rects = {
      'Prioritas Utama': [mx, my, x1, y0],
      Pertahankan: [mx, y1, x1, my],
      'Prioritas Rendah': [x0, my, mx, y0],
      'Sudah Cukup': [x0, y1, mx, my],
    };
    svg
      .select('g.quads')
      .selectAll('rect')
      .data(QUADRANTS, (d) => d.key)
      .join('rect')
      .attr('x', (d) => rects[d.key][0])
      .attr('y', (d) => rects[d.key][1])
      .attr('width', (d) => Math.max(0, rects[d.key][2] - rects[d.key][0]))
      .attr('height', (d) => Math.max(0, rects[d.key][3] - rects[d.key][1]))
      .attr('fill', (d) => d.fill)
      .attr('fill-opacity', (d) => d.opacity);
    svg
      .select('g.quad-labels')
      .selectAll('text')
      .data(QUADRANTS, (d) => d.key)
      .join('text')
      .attr('x', (d) => (d.corner.endsWith('right') ? x1 - 8 : x0 + 8))
      .attr('y', (d) => (d.corner.startsWith('top') ? y1 + 16 : y0 - 9))
      .attr('text-anchor', (d) => (d.corner.endsWith('right') ? 'end' : 'start'))
      .attr('fill', (d) => (d.key === 'Prioritas Utama' ? COLORS.bad : COLORS.inkSoft))
      .attr('font-size', 11.5)
      .attr('font-weight', 700)
      .attr('letter-spacing', '0.04em')
      .text((d) => d.key.toUpperCase())
      // Sembunyikan nama kuadran yang tidak muat (mis. layar sempit / kuadran sangat kecil).
      .attr('opacity', (d) => {
        const [qx0, , qx1] = rects[d.key];
        return measureText(d.key.toUpperCase(), '700 11.5px Poppins, sans-serif') * 1.06 + 16 > qx1 - qx0 ? 0 : 1;
      });

    // Grid & sumbu
    svg
      .select('g.grid')
      .selectAll('line')
      .data(y.ticks(6), (d) => d)
      .join('line')
      .attr('x1', x0)
      .attr('x2', x1)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', COLORS.line);
    const styleAxis = (g) =>
      g
        .call((s) => s.select('.domain').remove())
        .call((s) => s.selectAll('text').attr('fill', COLORS.inkMuted).attr('font-size', 11).attr('class', 'tabular'));
    svg
      .select('g.axis-x')
      .attr('transform', `translate(0,${y0 + 6})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(0).tickPadding(6).tickFormat((v) => `${idLocale.format('~g')(v)}%`))
      .call(styleAxis);
    svg
      .select('g.axis-y')
      .attr('transform', `translate(${x0 - 6},0)`)
      .call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(6).tickFormat(idLocale.format('.1f')))
      .call(styleAxis);
    svg
      .select('text.title-x')
      .attr('x', (x0 + x1) / 2)
      .attr('y', height - 10)
      .text(narrow ? '% memilih sebagai prioritas' : '% responden memilih aspek sebagai prioritas peningkatan');
    svg
      .select('text.title-y')
      .attr('transform', `translate(16,${(y0 + y1) / 2}) rotate(-90)`)
      .text(narrow ? `Skor kepuasan (1–${scaleMax})` : `Skor kepuasan rata-rata (1–${scaleMax})`);

    // Garis rata-rata (putus-putus)
    const means = [
      { id: 'mx', x1: mx, x2: mx, y1, y2: y0, label: `rata-rata ${fmtPct(meanX, 1)}`, lx: mx + 5, ly: y1 + 32, anchor: 'start' },
      { id: 'my', x1: x0, x2: x1, y1: my, y2: my, label: `rata-rata ${fmtScore(meanY)}`, lx: x1 - 6, ly: my - 6, anchor: 'end' },
    ];
    const meanSel = svg.select('g.means');
    meanSel
      .selectAll('line')
      .data(means, (d) => d.id)
      .join('line')
      .attr('x1', (d) => d.x1)
      .attr('x2', (d) => d.x2)
      .attr('y1', (d) => d.y1)
      .attr('y2', (d) => d.y2)
      .attr('stroke', COLORS.inkMuted)
      .attr('stroke-dasharray', '5 4')
      .attr('stroke-width', 1.3);
    meanSel
      .selectAll('text')
      .data(means, (d) => d.id)
      .join('text')
      .attr('x', (d) => d.lx)
      .attr('y', (d) => d.ly)
      .attr('text-anchor', (d) => d.anchor)
      .attr('fill', COLORS.inkMuted)
      .attr('font-size', 10.5)
      .attr('font-style', 'italic')
      .text((d) => d.label);

    // Titik aspek (warna = level prioritas)
    const isDim = (d) => highlight && d.key !== highlight;
    svg
      .select('g.points')
      .selectAll('circle')
      .data(data, (d) => d.key)
      .join((enter) => enter.append('circle').attr('cx', x(0)).attr('cy', y0).attr('r', 0))
      .attr('fill', (d) => LEVEL_COLORS[d.level] ?? COLORS.brand)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', (d) => (d.key === highlight ? 10 : 7.5))
      .attr('opacity', (d) => (isDim(d) ? 0.35 : 1));
    svg
      .select('g.halo')
      .selectAll('circle')
      .data(data.filter((d) => d.key === highlight), (d) => d.key)
      .join('circle')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke', COLORS.gold)
      .attr('stroke-width', 5);

    const items = data.map((d) => ({
      id: d.key,
      x: x(d.x),
      y: y(d.y),
      r: d.key === highlight ? 12 : 9,
      text: d.short,
      priority: d.key === highlight ? 2 : 1,
    }));
    const layout = placeLabels(items, { x0, x1, y0: y1, y1: y0 }, undefined, { hideOverlaps: true });
    svg
      .select('g.labels')
      .selectAll('text')
      .data(items, (d) => d.id)
      .join('text')
      .attr('font-size', 12)
      .attr('font-weight', (d) => (d.priority === 2 ? 700 : 600))
      .attr('fill', COLORS.ink)
      .attr('opacity', (d) => (layout.get(d.id).hidden ? 0 : highlight && d.priority === 1 ? 0.5 : 1))
      .attr('paint-order', 'stroke')
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .attr('stroke-linejoin', 'round')
      .text((d) => d.text)
      .attr('text-anchor', (d) => layout.get(d.id).anchor)
      .attr('x', (d) => layout.get(d.id).x)
      .attr('y', (d) => layout.get(d.id).y);

    svg
      .select('g.hits')
      .selectAll('circle')
      .data(data, (d) => d.key)
      .join('circle')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', 14)
      .attr('fill', 'transparent')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => `${d.label}: ${d.tooltip.value}, kuadran ${d.quadrant}`)
      .style('cursor', onSelect ? 'pointer' : 'default')
      .style('outline', 'none')
      .on('pointerenter focus', (event, d) => setTip({ x: x(d.x), y: y(d.y), ...d.tooltip }))
      .on('pointerleave blur', () => setTip(null))
      .on('click', (event, d) => onSelect?.(d.key === highlight ? null : d.key))
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(d.key === highlight ? null : d.key);
        }
      });
  }, [data, meanX, meanY, scaleMax, width, height, reduced, highlight, onSelect]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        role="img"
        aria-label="Kuadran prioritas perbaikan: persentase responden memilih aspek sebagai prioritas terhadap skor kepuasan"
        className="block"
      >
        <g className="quads" />
        <g className="grid" />
        <g className="quad-labels" style={{ pointerEvents: 'none' }} />
        <g className="axis-x" />
        <g className="axis-y" />
        <text className="title-x" textAnchor="middle" fill={COLORS.inkSoft} fontSize="12.5" fontWeight="600" />
        <text className="title-y" textAnchor="middle" fill={COLORS.inkSoft} fontSize="12.5" fontWeight="600" />
        <g className="means" style={{ pointerEvents: 'none' }} />
        <g className="labels" style={{ pointerEvents: 'none' }} />
        <g className="halo" />
        <g className="points" />
        <g className="hits" />
      </svg>
      <ChartTooltip tip={tip} bounds={{ width }} />
    </div>
  );
}
