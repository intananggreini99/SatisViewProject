import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import ChartTooltip from '../components/ChartTooltip.jsx';
import { useElementSize, usePrefersReducedMotion } from '../hooks/useElementSize.js';
import { COLORS } from '../lib/constants.js';
import { idLocale } from '../lib/format.js';
import { measureText, truncateText } from './chartUtils.js';

const BAR = 24; // tebal batang maksimum (px)
const ROW = 46; // tinggi baris (layar lebar)
const ROW_COMPACT = 60; // tinggi baris (layar sempit: label di atas batang)
const COMPACT_BELOW = 460;
const DEFAULT_FORMAT = idLocale.format(',.2f');
const AXIS_FORMAT = idLocale.format('~g');

/**
 * Grafik batang horizontal (D3).
 * data: [{ key, label, value, valueLabel, tooltip: { value, title, lines } }]
 * Pada layar sempit label kategori dipindah ke atas batang agar tidak terpotong.
 */
export default function BarChart({
  data,
  color = COLORS.brand,
  max,
  ticks = 5,
  ariaLabel,
  boldLabels = false,
  valueFormat = DEFAULT_FORMAT,
}) {
  const [wrapRef, { width }] = useElementSize();
  const svgRef = useRef(null);
  const clipId = useMemo(() => `bar-clip-${Math.random().toString(36).slice(2, 9)}`, []);
  const reduced = usePrefersReducedMotion();
  const [tip, setTip] = useState(null);
  const [hovered, setHovered] = useState(null);

  const compact = width > 0 && width < COMPACT_BELOW;
  const height = Math.max(120, data.length * (compact ? ROW_COMPACT : ROW) + 44);
  const labelFont = `${boldLabels ? 700 : 500} 14px Poppins, sans-serif`;

  useEffect(() => {
    if (!width || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const longest = d3.max(data, (d) => measureText(d.label, labelFont)) ?? 0;
    const labelWidth = compact ? width - 8 : Math.min(longest, width * 0.42);
    const margin = compact
      ? { top: 4, right: 52, bottom: 34, left: 4 }
      : { top: 6, right: 60, bottom: 34, left: labelWidth + 18 };
    const domainMax = max ?? (d3.max(data, (d) => d.value) || 1);

    const x = d3
      .scaleLinear()
      .domain([0, domainMax])
      .range([margin.left, width - margin.right]);
    if (max === undefined) x.nice(ticks);
    const y = d3
      .scaleBand()
      .domain(data.map((d) => d.key))
      .range([margin.top, height - margin.bottom])
      .paddingInner(compact ? 0.12 : 0.3)
      .paddingOuter(compact ? 0.05 : 0.2);
    const barH = Math.min(BAR, compact ? 20 : y.bandwidth());
    const barY = (d) => (compact ? y(d.key) + y.bandwidth() - barH : y(d.key) + (y.bandwidth() - barH) / 2);
    const duration = reduced ? 0 : 700;
    const tickCount = compact ? Math.min(ticks, 4) : ticks;

    svg.attr('viewBox', `0 0 ${width} ${height}`);
    svg
      .select('clipPath rect')
      .attr('x', margin.left)
      .attr('y', 0)
      .attr('width', Math.max(0, width - margin.left))
      .attr('height', height);

    // Garis grid tipis (solid, satu tingkat dari permukaan) & sumbu bawah
    svg
      .select('g.grid')
      .selectAll('line')
      .data(x.ticks(tickCount), (d) => d)
      .join('line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', COLORS.line)
      .attr('stroke-width', 1);

    svg
      .select('g.axis')
      .attr('transform', `translate(0,${height - margin.bottom + 6})`)
      .call(d3.axisBottom(x).ticks(tickCount).tickSize(0).tickPadding(8).tickFormat(AXIS_FORMAT))
      .call((g) => g.select('.domain').remove())
      .call((g) =>
        g.selectAll('text').attr('fill', COLORS.inkSoft).attr('font-size', 13).attr('font-weight', 600).attr('class', 'tabular'),
      );

    // Batang: ujung data membulat 4px, sisi baseline lurus (dipotong clip-path)
    svg
      .select('g.bars')
      .selectAll('rect')
      .data(data, (d) => d.key)
      .join((enter) => enter.append('rect').attr('x', margin.left - 6).attr('width', 0).attr('y', barY).attr('height', barH))
      .attr('rx', 4)
      .attr('fill', color)
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('x', margin.left - 6)
      .attr('y', barY)
      .attr('height', barH)
      .attr('width', (d) => Math.max(0, x(Math.max(0, d.value ?? 0)) - margin.left + 6));

    // Label kategori (warna tinta, bukan warna data)
    svg
      .select('g.labels')
      .selectAll('text')
      .data(data, (d) => d.key)
      .join('text')
      .attr('x', compact ? margin.left : margin.left - 12)
      .attr('y', (d) => (compact ? barY(d) - 7 : y(d.key) + y.bandwidth() / 2))
      .attr('dy', compact ? 0 : '0.35em')
      .attr('text-anchor', compact ? 'start' : 'end')
      .attr('fill', COLORS.ink)
      .attr('font-size', 14)
      .attr('font-weight', boldLabels ? 700 : 500)
      .text((d) => truncateText(d.label, labelWidth, labelFont));

    // Nilai di ujung batang
    svg
      .select('g.values')
      .selectAll('text')
      .data(data, (d) => d.key)
      .join('text')
      .attr('y', (d) => barY(d) + barH / 2)
      .attr('dy', '0.35em')
      .attr('fill', COLORS.ink)
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .text((d) => d.valueLabel ?? valueFormat(d.value ?? 0))
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('x', (d) => x(Math.max(0, d.value ?? 0)) + 8);

    // Area sentuh selebar baris (lebih besar dari batang) untuk hover & fokus keyboard
    svg
      .select('g.hits')
      .selectAll('rect')
      .data(data, (d) => d.key)
      .join('rect')
      .attr('x', 0)
      .attr('width', width)
      .attr('y', (d) => y(d.key) - (y.step() * y.paddingInner()) / 2)
      .attr('height', y.step())
      .attr('fill', 'transparent')
      .attr('tabindex', 0)
      .attr('role', 'listitem')
      .attr('aria-label', (d) => `${d.label}: ${d.valueLabel ?? valueFormat(d.value ?? 0)}`)
      .style('outline', 'none')
      .on('pointerenter pointermove', (event, d) => {
        const [px, py] = d3.pointer(event, svgRef.current);
        setHovered(d.key);
        setTip({ x: px, y: py, ...d.tooltip });
      })
      .on('pointerleave blur', () => {
        setHovered(null);
        setTip(null);
      })
      .on('focus', (event, d) => {
        setHovered(d.key);
        setTip({ x: x(Math.max(0, d.value ?? 0)), y: barY(d), ...d.tooltip });
      });
  }, [data, width, height, compact, color, max, ticks, reduced, valueFormat, labelFont, boldLabels]);

  // Sorot batang yang di-hover/fokus: batang lain sedikit diredupkan
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll('g.bars rect')
      .attr('opacity', (d) => (hovered && d.key !== hovered ? 0.45 : 1));
  }, [hovered, data]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg ref={svgRef} role="list" aria-label={ariaLabel} width="100%" height={height} className="block overflow-visible">
        <defs>
          <clipPath id={clipId}>
            <rect />
          </clipPath>
        </defs>
        <g className="grid" />
        <g className="bars" clipPath={`url(#${clipId})`} />
        <g className="labels" />
        <g className="values" />
        <g className="axis" />
        <g className="hits" />
      </svg>
      <ChartTooltip tip={tip} bounds={{ width }} />
    </div>
  );
}
