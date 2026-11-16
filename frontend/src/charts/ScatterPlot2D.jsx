import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import ChartTooltip from '../components/ChartTooltip.jsx';
import { useElementSize, usePrefersReducedMotion } from '../hooks/useElementSize.js';
import { COLORS } from '../lib/constants.js';
import { fmtCoord, fmtIndex, fmtInt, fmtPct, fmtScore } from '../lib/format.js';
import { clamp, placeLabels, symmetricDomain, tickFormatter } from './chartUtils.js';

const colorOf = (group) => (group === 'Fasilitas' ? COLORS.fasilitas : COLORS.layanan);

/**
 * Peta 2D (D3) — dipakai untuk peta persepsi aspek hasil MDS tim.
 * points: [{ name, label, short, group, x, y, index, mean, responses }]
 * categories: titik tambahan opsional (belah ketupat), inertia: % variasi per dimensi (opsional)
 */
export default function ScatterPlot2D({ points, categories = [], showCategories, highlight, inertia = [], height = 520, onSelect }) {
  const [wrapRef, { width }] = useElementSize();
  const svgRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [tip, setTip] = useState(null);

  useEffect(() => {
    if (!width || !svgRef.current) return;
    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    const margin = { top: 20, right: 24, bottom: 58, left: 70 };
    // Skala mengikuti titik layanan; kategori jawaban yang jauh (jarang dipilih)
    // dijepit di tepi agar sebaran layanan tetap terbaca.
    const xDomain = symmetricDomain(points.map((d) => d.x), 1.3);
    const yDomain = symmetricDomain(points.map((d) => d.y), 1.3);
    const cats = (showCategories ? categories : []).map((d) => {
      const cx = clamp(d.x, xDomain);
      const cy = clamp(d.y, yDomain);
      return { ...d, x: cx, y: cy, clamped: cx !== d.x || cy !== d.y };
    });
    const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
    const xTicks = width < 520 ? 4 : 8; // layar sempit: tick lebih jarang agar label tidak bertumpuk
    const y = d3.scaleLinear().domain(yDomain).range([height - margin.bottom, margin.top]);
    const duration = reduced ? 0 : 650;

    // Grid & garis nol
    const gx = svg.select('g.grid-x').selectAll('line').data(x.ticks(xTicks), (d) => d);
    gx.join('line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', (d) => (Math.abs(d) < 1e-9 ? COLORS.lineStrong : COLORS.line))
      .attr('stroke-width', (d) => (Math.abs(d) < 1e-9 ? 1.5 : 1));
    svg
      .select('g.grid-y')
      .selectAll('line')
      .data(y.ticks(7), (d) => d)
      .join('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', (d) => (Math.abs(d) < 1e-9 ? COLORS.lineStrong : COLORS.line))
      .attr('stroke-width', (d) => (Math.abs(d) < 1e-9 ? 1.5 : 1));

    const styleAxis = (g) =>
      g
        .call((s) => s.select('.domain').remove())
        .call((s) =>
          s.selectAll('text').attr('fill', COLORS.inkMuted).attr('font-size', 11).attr('class', 'tabular'),
        );
    svg
      .select('g.axis-x')
      .attr('transform', `translate(0,${height - margin.bottom + 4})`)
      .call(d3.axisBottom(x).ticks(xTicks).tickSize(0).tickPadding(8).tickFormat(tickFormatter(xDomain, xTicks)))
      .call(styleAxis);
    svg
      .select('g.axis-y')
      .attr('transform', `translate(${margin.left - 6},0)`)
      .call(d3.axisLeft(y).ticks(7).tickSize(0).tickPadding(8).tickFormat(tickFormatter(yDomain, 7)))
      .call(styleAxis);

    const pct = (v) => (Number.isFinite(v) ? ` (${fmtPct(v, 1)})` : '');
    svg
      .select('text.title-x')
      .attr('x', (margin.left + width - margin.right) / 2)
      .attr('y', height - 12)
      .text(`Dimensi 1${pct(inertia[0])}`);
    svg
      .select('text.title-y')
      .attr('transform', `translate(18,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
      .text(`Dimensi 2${pct(inertia[1])}`);

    // Titik kategori jawaban (belah ketupat abu, tanpa isi)
    const diamond = d3.symbol(d3.symbolDiamond, 110)();
    svg
      .select('g.cats')
      .selectAll('path')
      .data(cats, (d) => d.name)
      .join('path')
      .attr('d', diamond)
      .attr('fill', '#fff')
      .attr('stroke', COLORS.kategori)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (d) => (d.clamped ? '3 2' : null))
      .attr('transform', (d) => `translate(${x(d.x)},${y(d.y)})`);

    // Titik layanan/fasilitas dengan cincin putih 2px
    const isDim = (d) => highlight && d.name !== highlight;
    svg
      .select('g.points')
      .selectAll('circle')
      .data(points, (d) => d.name)
      .join((enter) =>
        enter
          .append('circle')
          .attr('cx', x(0))
          .attr('cy', y(0))
          .attr('r', 0),
      )
      .attr('fill', (d) => colorOf(d.group))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', (d) => (d.name === highlight ? 10 : 7))
      .attr('opacity', (d) => (isDim(d) ? 0.35 : 1));

    // Cincin sorot (kuning) untuk layanan yang dipilih
    svg
      .select('g.halo')
      .selectAll('circle')
      .data(points.filter((d) => d.name === highlight), (d) => d.name)
      .join('circle')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke', COLORS.gold)
      .attr('stroke-width', 5)
      .attr('stroke-opacity', 0.95);

    // Label (tinta, bukan warna data) dengan penempatan anti-tabrakan
    const items = [
      ...points.map((d) => ({ id: `p:${d.name}`, x: x(d.x), y: y(d.y), r: d.name === highlight ? 12 : 8, text: d.short, priority: d.name === highlight ? 2 : 1 })),
      ...cats.map((d) => ({ id: `c:${d.name}`, x: x(d.x), y: y(d.y), r: 7, text: d.clamped ? `${d.label} (di luar skala)` : d.label, priority: 0 })),
    ];
    const layout = placeLabels(items, { x0: margin.left, x1: width - margin.right, y0: margin.top, y1: height - margin.bottom });
    svg
      .select('g.labels')
      .selectAll('text')
      .data(items, (d) => d.id)
      .join('text')
      .attr('font-size', (d) => (d.id.startsWith('c:') ? 11.5 : 12.5))
      .attr('font-weight', (d) => (d.priority === 2 ? 700 : d.id.startsWith('c:') ? 500 : 600))
      .attr('font-style', (d) => (d.id.startsWith('c:') ? 'italic' : 'normal'))
      .attr('fill', (d) => (d.id.startsWith('c:') ? COLORS.inkMuted : COLORS.ink))
      .attr('opacity', (d) => (highlight && d.priority === 1 ? 0.5 : 1))
      .attr('paint-order', 'stroke')
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .attr('stroke-linejoin', 'round')
      .text((d) => d.text)
      .attr('text-anchor', (d) => layout.get(d.id).anchor)
      .attr('x', (d) => layout.get(d.id).x)
      .attr('y', (d) => layout.get(d.id).y);

    // Area sentuh 28px (lebih besar dari titik) untuk hover/fokus/klik
    svg
      .select('g.hits')
      .selectAll('circle')
      .data(points, (d) => d.name)
      .join('circle')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', 14)
      .attr('fill', 'transparent')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => `${d.label}, indeks ${fmtIndex(d.index)}, dimensi 1 ${fmtCoord(d.x)}, dimensi 2 ${fmtCoord(d.y)}`)
      .style('cursor', onSelect ? 'pointer' : 'default')
      .style('outline', 'none')
      .on('pointerenter focus', (event, d) => {
        setTip({
          x: x(d.x),
          y: y(d.y),
          value: `Indeks ${fmtIndex(d.index)}`,
          title: d.label,
          lines: [`${d.group} · rata-rata ${fmtScore(d.mean)} · ${fmtInt(d.responses)} responden`, `Dim 1: ${fmtCoord(d.x)} · Dim 2: ${fmtCoord(d.y)}`],
        });
      })
      .on('pointerleave blur', () => setTip(null))
      .on('click', (event, d) => onSelect?.(d.name === highlight ? null : d.name))
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(d.name === highlight ? null : d.name);
        }
      });
  }, [points, categories, showCategories, highlight, inertia, width, height, reduced, onSelect]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        role="img"
        aria-label="Peta dua dimensi kedekatan aspek layanan dan fasilitas hasil MDS"
        className="block"
      >
        <g className="grid-x" />
        <g className="grid-y" />
        <g className="axis-x" />
        <g className="axis-y" />
        <text className="title-x" textAnchor="middle" fill={COLORS.inkSoft} fontSize="13" fontWeight="600" />
        <text className="title-y" textAnchor="middle" fill={COLORS.inkSoft} fontSize="13" fontWeight="600" />
        <g className="labels" style={{ pointerEvents: 'none' }} />
        <g className="cats" />
        <g className="halo" />
        <g className="points" />
        <g className="hits" />
      </svg>
      <ChartTooltip tip={tip} bounds={{ width }} />
    </div>
  );
}
