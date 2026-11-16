import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import ChartTooltip from '../components/ChartTooltip.jsx';
import { useElementSize, usePrefersReducedMotion } from '../hooks/useElementSize.js';
import { COLORS } from '../lib/constants.js';
import { fmtCoord, fmtScore3 } from '../lib/format.js';
import { measureText, stackLabels, symmetricDomain, tickFormatter } from './chartUtils.js';

const colorOf = (group) => (group === 'Fasilitas' ? COLORS.fasilitas : COLORS.layanan);

/**
 * Peta persepsi responden + vektor aspek (mds-mahasiswa.ipynb, sel 13 & 15).
 * points : [{ id, x, y, segment }]  — koordinat MDS tiap responden
 * vectors: [{ name, label, short, group, x, y }] — korelasi skor aspek dengan dimensi 1 & 2
 * Panjang panah = korelasi × (|koordinat| maks × 0,9), sama seperti notebook tim.
 */
export default function BiplotChart({ points, vectors, highlightSegment, highlightAspect, height = 540, onSelectAspect }) {
  const [wrapRef, { width }] = useElementSize();
  const svgRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [tip, setTip] = useState(null);
  const markerId = useMemo(() => `arrow-${Math.random().toString(36).slice(2, 9)}`, []);

  useEffect(() => {
    if (!width || !svgRef.current) return;
    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    const margin = { top: 18, right: 24, bottom: 54, left: 64 };
    const scale = (d3.max(points, (d) => Math.max(Math.abs(d.x), Math.abs(d.y))) ?? 1) * 0.9;
    const arrows = vectors.map((v) => ({ ...v, ax: v.x * scale, ay: v.y * scale }));
    let xDomain = symmetricDomain([...points.map((d) => d.x), ...arrows.map((d) => d.ax * 1.1)], 1.08);
    const yDomain = symmetricDomain([...points.map((d) => d.y), ...arrows.map((d) => d.ay * 1.1)], 1.08);
    // Beri ruang untuk kolom label di luar ujung panah (kiri & kanan), domain tetap simetris.
    const plotW = width - margin.left - margin.right;
    const font = '600 12px Poppins, sans-serif';
    const sides = [arrows.filter((d) => d.ax < 0), arrows.filter((d) => d.ax >= 0)];
    for (let k = 0; k < 4; k++) {
      const ppu = plotW / (xDomain[1] - xDomain[0]);
      const need = sides.map((list, i) => {
        if (!list.length) return 0;
        const widest = Math.max(...list.map((d) => measureText(d.short, font)));
        const room = i === 0 ? Math.min(...list.map((d) => d.ax)) - xDomain[0] : xDomain[1] - Math.max(...list.map((d) => d.ax));
        return (widest + 22) / ppu - room;
      });
      const grow = Math.max(0, ...need);
      if (grow <= 1e-9) break;
      xDomain = [xDomain[0] - grow, xDomain[1] + grow];
    }
    const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
    const xTicks = width < 520 ? 4 : 8; // layar sempit: tick lebih jarang agar label tidak bertumpuk
    const y = d3.scaleLinear().domain(yDomain).range([height - margin.bottom, margin.top]);
    const duration = reduced ? 0 : 600;
    const active = highlightSegment ?? null;

    const gridLine = (sel, horizontal) =>
      sel
        .join('line')
        .attr('x1', (d) => (horizontal ? margin.left : x(d)))
        .attr('x2', (d) => (horizontal ? width - margin.right : x(d)))
        .attr('y1', (d) => (horizontal ? y(d) : margin.top))
        .attr('y2', (d) => (horizontal ? y(d) : height - margin.bottom))
        .attr('stroke', (d) => (Math.abs(d) < 1e-9 ? COLORS.lineStrong : COLORS.line))
        .attr('stroke-width', (d) => (Math.abs(d) < 1e-9 ? 1.5 : 1));
    gridLine(svg.select('g.grid-x').selectAll('line').data(x.ticks(xTicks), (d) => d), false);
    gridLine(svg.select('g.grid-y').selectAll('line').data(y.ticks(7), (d) => d), true);

    const styleAxis = (g) =>
      g
        .call((s) => s.select('.domain').remove())
        .call((s) =>
          s
            .selectAll('text')
            .attr('fill', COLORS.inkMuted)
            .attr('font-size', 11)
            .attr('class', 'tabular'),
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
    svg.select('text.title-x').attr('x', (margin.left + width - margin.right) / 2).attr('y', height - 12).text('Dimensi 1');
    svg
      .select('text.title-y')
      .attr('transform', `translate(18,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
      .text('Dimensi 2');

    // Responden: segmen terpilih di atas & berwarna, sisanya abu-biru muda
    const ordered = active ? [...points].sort((a, b) => (a.segment === active) - (b.segment === active)) : points;
    svg
      .select('g.dots')
      .selectAll('circle')
      .data(ordered, (d) => d.id)
      .join('circle')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', (d) => (active && d.segment === active ? 4.2 : 3.2))
      .attr('fill', (d) => (active ? (d.segment === active ? COLORS.brand : COLORS.respondentSoft) : COLORS.respondent))
      .attr('fill-opacity', (d) => (active && d.segment !== active ? 0.9 : 0.85))
      .attr('stroke', (d) => (active && d.segment === active ? '#fff' : 'none'))
      .attr('stroke-width', 1)
      .order();

    // Vektor aspek
    const isDim = (d) => highlightAspect && d.name !== highlightAspect;
    svg
      .select('g.vectors')
      .selectAll('line')
      .data(arrows, (d) => d.name)
      .join((enter) => enter.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(0)).attr('y2', y(0)))
      .attr('stroke', (d) => colorOf(d.group))
      .attr('stroke-width', (d) => (d.name === highlightAspect ? 3.2 : 2.2))
      .attr('opacity', (d) => (isDim(d) ? 0.3 : 1))
      .attr('marker-end', (d) => `url(#${markerId}-${d.group === 'Fasilitas' ? 'f' : 'l'})`)
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('x1', x(0))
      .attr('y1', y(0))
      .attr('x2', (d) => x(d.ax))
      .attr('y2', (d) => y(d.ay));

    const items = arrows.map((d) => ({ id: d.name, x: x(d.ax), y: y(d.ay), dx: d.ax, dy: d.ay, text: d.short }));
    const layout = stackLabels(items, { x0: margin.left, x1: width - margin.right, y0: margin.top, y1: height - margin.bottom });
    const labelOpacity = (d) => (highlightAspect && d.id !== highlightAspect ? 0.45 : 1);
    svg
      .select('g.leaders')
      .selectAll('line')
      .data(items.filter((d) => layout.get(d.id).leader), (d) => d.id)
      .join('line')
      .attr('x1', (d) => layout.get(d.id).leader[0])
      .attr('y1', (d) => layout.get(d.id).leader[1])
      .attr('x2', (d) => layout.get(d.id).leader[2])
      .attr('y2', (d) => layout.get(d.id).leader[3])
      .attr('stroke', COLORS.inkMuted)
      .attr('stroke-width', 0.8)
      .attr('opacity', (d) => labelOpacity(d) * 0.8);
    svg
      .select('g.labels')
      .selectAll('text')
      .data(items, (d) => d.id)
      .join('text')
      .attr('font-size', 12)
      .attr('font-weight', (d) => (d.id === highlightAspect ? 700 : 600))
      .attr('fill', COLORS.ink)
      .attr('opacity', labelOpacity)
      .attr('paint-order', 'stroke')
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .attr('stroke-linejoin', 'round')
      .text((d) => d.text)
      .attr('text-anchor', (d) => layout.get(d.id).anchor)
      .attr('x', (d) => layout.get(d.id).x)
      .attr('y', (d) => layout.get(d.id).y);

    // Area sentuh pada ujung panah
    svg
      .select('g.hits')
      .selectAll('circle')
      .data(arrows, (d) => d.name)
      .join('circle')
      .attr('cx', (d) => x(d.ax))
      .attr('cy', (d) => y(d.ay))
      .attr('r', 14)
      .attr('fill', 'transparent')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => `${d.label}: korelasi dimensi 1 ${fmtScore3(d.x)}, dimensi 2 ${fmtScore3(d.y)}`)
      .style('cursor', onSelectAspect ? 'pointer' : 'default')
      .style('outline', 'none')
      .on('pointerenter focus', (event, d) =>
        setTip({
          x: x(d.ax),
          y: y(d.ay),
          value: d.label,
          title: 'Arah skor aspek lebih tinggi',
          lines: [`Korelasi dgn Dimensi 1: ${fmtScore3(d.x)}`, `Korelasi dgn Dimensi 2: ${fmtScore3(d.y)}`],
        }),
      )
      .on('pointerleave blur', () => setTip(null))
      .on('click', (event, d) => onSelectAspect?.(d.name === highlightAspect ? null : d.name));

    // Tooltip responden (tanpa area sentuh per titik agar ratusan titik tetap ringan)
    svg.on('pointermove', (event) => {
      if (event.target.closest?.('g.hits')) return;
      const [px, py] = d3.pointer(event);
      let best = null;
      let bestD = 81; // radius 9px
      for (const d of points) {
        const dd = (x(d.x) - px) ** 2 + (y(d.y) - py) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = d;
        }
      }
      setTip(
        best
          ? {
              x: x(best.x),
              y: y(best.y),
              value: best.id,
              title: best.segment ?? '',
              lines: [`Dim 1: ${fmtCoord(best.x)} · Dim 2: ${fmtCoord(best.y)}`],
            }
          : null,
      );
    });
    svg.on('pointerleave', () => setTip(null));
  }, [points, vectors, highlightSegment, highlightAspect, width, height, reduced, onSelectAspect, markerId]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        role="img"
        aria-label="Peta persepsi responden hasil MDS dengan panah arah aspek"
        className="block"
      >
        <defs>
          {[
            ['l', COLORS.layanan],
            ['f', COLORS.fasilitas],
          ].map(([suffix, fill]) => (
            <marker
              key={suffix}
              id={`${markerId}-${suffix}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={fill} />
            </marker>
          ))}
        </defs>
        <g className="grid-x" />
        <g className="grid-y" />
        <g className="axis-x" />
        <g className="axis-y" />
        <text className="title-x" textAnchor="middle" fill={COLORS.inkSoft} fontSize="13" fontWeight="600" />
        <text className="title-y" textAnchor="middle" fill={COLORS.inkSoft} fontSize="13" fontWeight="600" />
        <g className="dots" />
        <g className="vectors" />
        <g className="leaders" style={{ pointerEvents: 'none' }} />
        <g className="labels" style={{ pointerEvents: 'none' }} />
        <g className="hits" />
      </svg>
      <ChartTooltip tip={tip} bounds={{ width }} />
    </div>
  );
}
