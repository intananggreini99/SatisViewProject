import * as d3 from 'd3';
import { useCallback, useEffect, useRef, useState } from 'react';
import ChartTooltip from '../components/ChartTooltip.jsx';
import { MinusIcon, PlusIcon, RotateIcon } from '../components/Icons.jsx';
import { GhostButton } from '../components/ui.jsx';
import { useElementSize, usePrefersReducedMotion } from '../hooks/useElementSize.js';
import { COLORS } from '../lib/constants.js';
import { fmtCoord, fmtIndex, fmtInt, fmtPct, fmtScore } from '../lib/format.js';
import { clamp, placeLabels, symmetricDomain, tickFormatter } from './chartUtils.js';

const colorOf = (group) => (group === 'Fasilitas' ? COLORS.fasilitas : COLORS.layanan);
const DEFAULT_CAM = { yaw: -0.62, pitch: 0.42, zoom: 1 };
const AXES = ['u', 'v', 'w'];

/** Proyeksi titik kubus [-1,1]^3 ke layar: rotasi yaw/pitch + perspektif ringan. */
function makeProjector(cam, cx, cy, scale) {
  const cosY = Math.cos(cam.yaw);
  const sinY = Math.sin(cam.yaw);
  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const project = (u, v, w) => {
    const x1 = u * cosY - v * sinY;
    const y1 = u * sinY + v * cosY;
    const up = w * cosP + y1 * sinP;
    const depth = y1 * cosP - w * sinP; // positif = menjauh dari pengamat
    const persp = 4 / (4 + depth);
    return { x: cx + x1 * scale * persp, y: cy - up * scale * persp, depth };
  };
  const depthOfDirection = (n) => (n.u * sinY + n.v * cosY) * cosP - n.w * sinP;
  return { project, depthOfDirection };
}

const vec = (axis, value, rest) => ({ u: 0, v: 0, w: 0, ...rest, [axis]: value });

/**
 * Peta 3D (D3 + proyeksi manual, tanpa WebGL) — peta persepsi aspek hasil MDS 3 dimensi.
 * Seret untuk memutar, tombol +/− untuk zoom, panah keyboard saat grafik fokus.
 */
export default function ScatterPlot3D({ points, categories = [], showCategories, highlight, inertia = [], height = 560, onSelect }) {
  const [wrapRef, { width }] = useElementSize();
  const svgRef = useRef(null);
  const cam = useRef({ ...DEFAULT_CAM });
  const drawRef = useRef(() => {});
  const reduced = usePrefersReducedMotion();
  const [tip, setTip] = useState(null);

  useEffect(() => {
    if (!width || !svgRef.current) return undefined;
    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    const domains = {
      x: symmetricDomain(points.map((d) => d.x), 1.3),
      y: symmetricDomain(points.map((d) => d.y), 1.3),
      z: symmetricDomain(points.map((d) => d.z), 1.3),
    };
    const cats = (showCategories ? categories : []).map((d) => {
      const c = { ...d, x: clamp(d.x, domains.x), y: clamp(d.y, domains.y), z: clamp(d.z, domains.z) };
      return { ...c, clamped: c.x !== d.x || c.y !== d.y || c.z !== d.z };
    });
    const scales = {
      u: d3.scaleLinear().domain(domains.x).range([-1, 1]),
      v: d3.scaleLinear().domain(domains.y).range([-1, 1]),
      w: d3.scaleLinear().domain(domains.z).range([-1, 1]),
    };
    const titles = {
      u: `Dimensi 1${Number.isFinite(inertia[0]) ? ` (${fmtPct(inertia[0], 1)})` : ''}`,
      v: `Dimensi 2${Number.isFinite(inertia[1]) ? ` (${fmtPct(inertia[1], 1)})` : ''}`,
      w: `Dimensi 3${Number.isFinite(inertia[2]) ? ` (${fmtPct(inertia[2], 1)})` : ''}`,
    };
    const cx = width / 2;
    const cy = height * 0.46;
    const baseScale = Math.min(width * 0.34, height * 0.28);

    const draw = () => {
      const scale = baseScale * cam.current.zoom;
      const { project, depthOfDirection } = makeProjector(cam.current, cx, cy, scale);
      const center = project(0, 0, 0);

      // 1) Dinding belakang kubus + grid (seperti plot 3D Plotly)
      const faces = [];
      for (const axis of AXES) {
        for (const sign of [-1, 1]) {
          const normal = vec(axis, sign);
          if (depthOfDirection(normal) <= 0.02) continue; // hanya sisi yang menjauh
          const [a, b] = AXES.filter((k) => k !== axis);
          const corner = (sa, sb) => {
            const p = vec(axis, sign, { [a]: sa, [b]: sb });
            return project(p.u, p.v, p.w);
          };
          const poly = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
          const lines = [];
          for (const [lineAxis, other] of [[a, b], [b, a]]) {
            for (const t of scales[lineAxis].ticks(5)) {
              const tn = scales[lineAxis](t);
              const p1 = vec(axis, sign, { [lineAxis]: tn, [other]: -1 });
              const p2 = vec(axis, sign, { [lineAxis]: tn, [other]: 1 });
              lines.push([project(p1.u, p1.v, p1.w), project(p2.u, p2.v, p2.w), Math.abs(t) < 1e-9]);
            }
          }
          faces.push({ id: `${axis}${sign}`, poly, lines });
        }
      }
      const faceSel = svg.select('g.faces').selectAll('g.face').data(faces, (d) => d.id);
      const faceEnter = faceSel.enter().append('g').attr('class', 'face');
      faceEnter.append('path').attr('class', 'wall');
      faceEnter.append('g').attr('class', 'wall-grid');
      faceSel.exit().remove();
      const faceAll = faceEnter.merge(faceSel);
      faceAll
        .select('path.wall')
        .attr('d', (d) => `M${d.poly.map((p) => `${p.x},${p.y}`).join('L')}Z`)
        .attr('fill', '#F6F9FC')
        .attr('stroke', COLORS.line)
        .attr('stroke-width', 1);
      faceAll
        .select('g.wall-grid')
        .selectAll('line')
        .data((d) => d.lines)
        .join('line')
        .attr('x1', (d) => d[0].x)
        .attr('y1', (d) => d[0].y)
        .attr('x2', (d) => d[1].x)
        .attr('y2', (d) => d[1].y)
        .attr('stroke', (d) => (d[2] ? COLORS.lineStrong : COLORS.line))
        .attr('stroke-width', (d) => (d[2] ? 1.4 : 1));

      // 2) Label sumbu pada rusuk terdekat dengan pengamat
      const axisLabels = [];
      const pushOut = (p, mid, dist) => {
        const dx = mid.x - center.x;
        const dy = mid.y - center.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
      };
      const floorW = cam.current.pitch >= 0 ? -1 : 1;
      for (const axis of AXES) {
        let edge;
        if (axis === 'w') {
          const options = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([su, sv]) => ({
            fixed: { u: su, v: sv },
            screen: project(su, sv, 0),
          }));
          edge = options.sort((p, q) => p.screen.x - q.screen.x)[0].fixed;
        } else {
          const other = axis === 'u' ? 'v' : 'u';
          const options = [-1, 1].map((s) => ({ fixed: { [other]: s, w: floorW } }));
          edge = options
            .map((o) => ({ ...o, depth: project(...['u', 'v', 'w'].map((k) => (k === axis ? 0 : o.fixed[k]))).depth }))
            .sort((p, q) => p.depth - q.depth)[0].fixed;
        }
        const point = (t) => {
          const p = { u: 0, v: 0, w: 0, ...edge, [axis]: t };
          return project(p.u, p.v, p.w);
        };
        const mid = point(0);
        const format = tickFormatter(scales[axis].domain(), 4);
        for (const t of scales[axis].ticks(4)) {
          const tn = scales[axis](t);
          const pos = pushOut(point(tn), mid, 16);
          axisLabels.push({ id: `${axis}:${t}`, x: pos.x, y: pos.y, text: format(t), kind: 'tick' });
        }
        const titlePos = pushOut(mid, mid, axis === 'w' ? 46 : 40);
        axisLabels.push({ id: `${axis}:title`, x: titlePos.x, y: titlePos.y, text: titles[axis], kind: 'title', vertical: axis === 'w' });
      }
      svg
        .select('g.axis-labels')
        .selectAll('text')
        .data(axisLabels, (d) => d.id)
        .join('text')
        .attr('x', (d) => d.x)
        .attr('y', (d) => d.y)
        .attr('transform', (d) => (d.vertical ? `rotate(-90 ${d.x} ${d.y})` : null))
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', (d) => (d.kind === 'title' ? COLORS.inkSoft : COLORS.inkMuted))
        .attr('font-size', (d) => (d.kind === 'title' ? 12.5 : 10.5))
        .attr('font-weight', (d) => (d.kind === 'title' ? 600 : 400))
        .attr('class', (d) => (d.kind === 'title' ? null : 'tabular'))
        .text((d) => d.text);

      // 3) Titik + garis jatuh ke lantai, diurutkan dari yang terjauh
      const nodes = [
        ...cats.map((d) => ({ ...d, kind: 'kategori' })),
        ...points.map((d) => ({ ...d, kind: 'layanan' })),
      ].map((d) => {
        const u = scales.u(d.x);
        const v = scales.v(d.y);
        const w = scales.w(d.z);
        return { ...d, id: `${d.kind}:${d.name}`, p: project(u, v, w), floor: project(u, v, floorW) };
      });
      nodes.sort((a, b) => b.p.depth - a.p.depth);

      svg
        .select('g.drops')
        .selectAll('line')
        .data(nodes, (d) => d.id)
        .join('line')
        .attr('x1', (d) => d.p.x)
        .attr('y1', (d) => d.p.y)
        .attr('x2', (d) => d.floor.x)
        .attr('y2', (d) => d.floor.y)
        .attr('stroke', COLORS.lineStrong)
        .attr('stroke-width', 1.5)
        .attr('opacity', (d) => (highlight && d.name !== highlight ? 0.3 : 0.9));

      const isDim = (d) => highlight && d.name !== highlight;
      const markSel = svg.select('g.marks').selectAll('g.mark').data(nodes, (d) => d.id);
      const markEnter = markSel.enter().append('g').attr('class', 'mark');
      markEnter.append('circle').attr('class', 'halo');
      markEnter.append('path').attr('class', 'dot');
      markSel.exit().remove();
      const marks = markEnter.merge(markSel).order();
      marks.attr('transform', (d) => `translate(${d.p.x},${d.p.y})`).attr('opacity', (d) => (isDim(d) ? 0.35 : 1));
      marks
        .select('circle.halo')
        .attr('r', (d) => (d.name === highlight ? 15 : 0))
        .attr('fill', 'none')
        .attr('stroke', COLORS.gold)
        .attr('stroke-width', 5);
      marks
        .select('path.dot')
        .attr('d', (d) => {
          const persp = 4 / (4 + d.p.depth);
          if (d.kind === 'kategori') return d3.symbol(d3.symbolDiamond, 100 * persp)();
          const r = (d.name === highlight ? 9.5 : 7) * persp;
          return d3.symbol(d3.symbolCircle, Math.PI * r * r)();
        })
        .attr('fill', (d) => (d.kind === 'kategori' ? '#fff' : colorOf(d.group)))
        .attr('stroke', (d) => (d.kind === 'kategori' ? COLORS.kategori : '#fff'))
        .attr('stroke-dasharray', (d) => (d.clamped ? '3 2' : null))
        .attr('stroke-width', 2);

      const layout = placeLabels(
        nodes.map((d) => ({
          id: d.id,
          x: d.p.x,
          y: d.p.y,
          r: 8,
          text: d.kind === 'kategori' ? (d.clamped ? `${d.label} (di luar skala)` : d.label) : d.short,
          priority: d.name === highlight ? 2 : d.kind === 'kategori' ? 0 : 1,
        })),
        { x0: 8, x1: width - 8, y0: 8, y1: height - 8 },
      );
      svg
        .select('g.labels')
        .selectAll('text')
        .data(nodes, (d) => d.id)
        .join('text')
        .attr('x', (d) => layout.get(d.id).x)
        .attr('y', (d) => layout.get(d.id).y)
        .attr('text-anchor', (d) => layout.get(d.id).anchor)
        .attr('font-size', (d) => (d.kind === 'kategori' ? 11.5 : 12.5))
        .attr('font-style', (d) => (d.kind === 'kategori' ? 'italic' : 'normal'))
        .attr('font-weight', (d) => (d.name === highlight ? 700 : d.kind === 'kategori' ? 500 : 600))
        .attr('fill', (d) => (d.kind === 'kategori' ? COLORS.inkMuted : COLORS.ink))
        .attr('opacity', (d) => (isDim(d) ? 0.5 : 1))
        .attr('paint-order', 'stroke')
        .attr('stroke', '#fff')
        .attr('stroke-width', 3)
        .attr('stroke-linejoin', 'round')
        .text((d) => (d.kind === 'kategori' ? (d.clamped ? `${d.label} (di luar skala)` : d.label) : d.short));

      svg
        .select('g.hits')
        .selectAll('circle')
        .data(nodes.filter((d) => d.kind === 'layanan'), (d) => d.id)
        .join('circle')
        .attr('cx', (d) => d.p.x)
        .attr('cy', (d) => d.p.y)
        .attr('r', 14)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('pointerenter', (event, d) =>
          setTip({
            x: d.p.x,
            y: d.p.y,
            value: `Indeks ${fmtIndex(d.index)}`,
            title: d.label,
            lines: [
              `${d.group} · rata-rata ${fmtScore(d.mean)} · ${fmtInt(d.responses)} responden`,
              `Dim 1: ${fmtCoord(d.x)} · Dim 2: ${fmtCoord(d.y)} · Dim 3: ${fmtCoord(d.z)}`,
            ],
          }),
        )
        .on('pointerleave', () => setTip(null))
        .on('click', (event, d) => onSelect?.(d.name === highlight ? null : d.name));
    };

    drawRef.current = draw;
    draw();

    // Putar dengan menyeret
    const drag = d3
      .drag()
      .filter((event) => !event.target.closest?.('g.hits'))
      .on('start', () => setTip(null))
      .on('drag', (event) => {
        cam.current.yaw += event.dx * 0.009;
        cam.current.pitch = Math.max(-0.15, Math.min(1.45, cam.current.pitch + event.dy * 0.009));
        draw();
      });
    svg.call(drag);

    // Animasi pembuka singkat (dilewati bila pengguna memilih kurangi gerakan)
    let timer = null;
    if (!reduced && !cam.current.introDone) {
      cam.current.introDone = true;
      const start = cam.current.yaw - 0.7;
      const end = cam.current.yaw;
      cam.current.yaw = start;
      timer = d3.timer((elapsed) => {
        const t = Math.min(1, elapsed / 1100);
        cam.current.yaw = start + (end - start) * d3.easeCubicOut(t);
        draw();
        if (t >= 1) timer.stop();
      });
    }
    return () => {
      timer?.stop();
      svg.on('.drag', null);
    };
  }, [points, categories, showCategories, highlight, inertia, width, height, reduced, onSelect]);

  const adjust = useCallback((patch) => {
    Object.assign(cam.current, patch(cam.current));
    drawRef.current();
  }, []);

  const onKeyDown = (event) => {
    const step = 0.12;
    const map = {
      ArrowLeft: (c) => ({ yaw: c.yaw - step }),
      ArrowRight: (c) => ({ yaw: c.yaw + step }),
      ArrowUp: (c) => ({ pitch: Math.min(1.45, c.pitch + step) }),
      ArrowDown: (c) => ({ pitch: Math.max(-0.15, c.pitch - step) }),
      '+': (c) => ({ zoom: Math.min(2.2, c.zoom * 1.15) }),
      '-': (c) => ({ zoom: Math.max(0.6, c.zoom / 1.15) }),
    };
    if (map[event.key]) {
      event.preventDefault();
      adjust(map[event.key]);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="absolute top-2 right-2 z-10 flex gap-1.5">
        <GhostButton onClick={() => adjust((c) => ({ zoom: Math.min(2.2, c.zoom * 1.15) }))} aria-label="Perbesar">
          <PlusIcon size={14} />
        </GhostButton>
        <GhostButton onClick={() => adjust((c) => ({ zoom: Math.max(0.6, c.zoom / 1.15) }))} aria-label="Perkecil">
          <MinusIcon size={14} />
        </GhostButton>
        <GhostButton onClick={() => adjust(() => ({ ...DEFAULT_CAM }))} aria-label="Kembalikan sudut pandang">
          <RotateIcon size={14} /> Reset
        </GhostButton>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        tabIndex={0}
        onKeyDown={onKeyDown}
        role="img"
        aria-label="Peta tiga dimensi kedekatan aspek layanan dan fasilitas hasil MDS. Seret atau gunakan tombol panah untuk memutar."
        className="block cursor-grab touch-none active:cursor-grabbing"
      >
        <g className="faces" />
        <g className="axis-labels" style={{ pointerEvents: 'none' }} />
        <g className="drops" />
        <g className="labels" style={{ pointerEvents: 'none' }} />
        <g className="marks" />
        <g className="hits" />
      </svg>
      <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-ink-muted">
        Seret untuk memutar · tombol panah saat grafik aktif
      </p>
      <ChartTooltip tip={tip} bounds={{ width }} />
    </div>
  );
}
