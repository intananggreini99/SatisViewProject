import { precisionFixed, tickStep } from 'd3';
import { idLocale } from '../lib/format.js';

// Utilitas bersama untuk grafik D3.
let measureCtx = null;

/** Lebar teks (px) memakai font yang sama dengan grafik. */
export function measureText(text, font = '500 13px Poppins, sans-serif') {
  if (typeof document === 'undefined') return String(text).length * 7;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = font;
  return measureCtx.measureText(String(text ?? '')).width;
}

/** Potong teks dengan elipsis agar muat pada lebar tertentu. */
export function truncateText(text, maxWidth, font) {
  const value = String(text ?? '');
  if (measureText(value, font) <= maxWidth) return value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(`${value.slice(0, mid)}…`, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${value.slice(0, Math.max(1, lo)).trimEnd()}…`;
}

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Penempatan label titik sederhana: coba kanan, kiri, atas, bawah, diagonal;
 * pilih posisi pertama yang tidak menabrak label lain, titik lain, atau tepi.
 * Dengan { hideOverlaps: true } label yang tetap menabrak ditandai hidden
 * (namanya tetap terbaca lewat tooltip).
 */
export function placeLabels(items, bounds, font = '500 12px Poppins, sans-serif', { hideOverlaps = false } = {}) {
  const placed = [];
  const pointBoxes = items.map((p) => ({ x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r, id: p.id }));
  const result = new Map();
  const ordered = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const p of ordered) {
    const w = measureText(p.text, font);
    const h = 14;
    const ring = (gap) => [
      { x0: p.x + gap, y0: p.y - h / 2, anchor: 'start' },
      { x0: p.x - gap - w, y0: p.y - h / 2, anchor: 'end' },
      { x0: p.x - w / 2, y0: p.y - gap - h, anchor: 'middle' },
      { x0: p.x - w / 2, y0: p.y + gap, anchor: 'middle' },
      { x0: p.x + gap - 2, y0: p.y - gap - h + 4, anchor: 'start' },
      { x0: p.x - gap - w + 2, y0: p.y - gap - h + 4, anchor: 'end' },
      { x0: p.x + gap - 2, y0: p.y + gap - 4, anchor: 'start' },
      { x0: p.x - gap - w + 2, y0: p.y + gap - 4, anchor: 'end' },
    ];
    // Mode hideOverlaps: coba lingkar kedua yang sedikit lebih jauh sebelum label disembunyikan.
    const candidates = [...ring(p.r + 5), ...(hideOverlaps ? ring(p.r + 13) : [])].map((c) => ({
      ...c,
      x1: c.x0 + w,
      y1: c.y0 + h,
    }));

    // Skor tabrakan: label lain (berat), titik lain, keluar batas (sangat berat).
    const cost = (c) => {
      const outside = c.x0 < bounds.x0 || c.x1 > bounds.x1 || c.y0 < bounds.y0 || c.y1 > bounds.y1 ? 100 : 0;
      const labelHits = placed.filter((b) => overlaps(b, c)).length * 10;
      const pointHits = pointBoxes.filter((b) => b.id !== p.id && overlaps(b, c)).length * 3;
      return outside + labelHits + pointHits;
    };
    let chosen = candidates[0];
    let best = Infinity;
    for (const c of candidates) {
      const score = cost(c);
      if (score < best) {
        best = score;
        chosen = c;
      }
      if (score === 0) break;
    }
    const hidden = hideOverlaps && best >= 10 && (p.priority ?? 0) < 2; // tetap bertabrakan dgn label lain
    if (!hidden) placed.push(chosen);
    const textX = chosen.anchor === 'start' ? chosen.x0 : chosen.anchor === 'end' ? chosen.x1 : (chosen.x0 + chosen.x1) / 2;
    result.set(p.id, { x: textX, y: chosen.y0 + h - 3, anchor: chosen.anchor, hidden });
  }
  return result;
}

export const clamp = (value, [lo, hi]) => Math.min(hi, Math.max(lo, value));

/** Domain simetris di sekitar nol, dibulatkan rapi (untuk peta CA). */
export function symmetricDomain(values, pad = 1.15, minExtent = 0.05) {
  const extent = Math.max(minExtent, ...values.map((v) => Math.abs(v ?? 0))) * pad;
  const step = extent > 1 ? 0.5 : extent > 0.4 ? 0.1 : extent > 0.2 ? 0.05 : 0.02;
  const rounded = Math.ceil(extent / step) * step;
  return [-rounded, rounded];
}

/** Format tick dengan jumlah desimal sesuai jarak antar tick (hindari label kembar, mis. 0,05 -> "0,1"). */
export function tickFormatter([lo, hi], count) {
  const step = Math.abs(tickStep(lo, hi, count)) || 1;
  return idLocale.format(`.${precisionFixed(step)}f`);
}

/** Label kategori untuk grafik batang: tanpa awalan "Layanan", dan tanpa akhiran "Kampus" bila panjang. */
export function chartLabel(label, max = 24) {
  const value = String(label ?? '').replace(/^Layanan /, '');
  return value.length > max ? value.replace(/ [Kk]ampus$/, '') : value;
}

/**
 * Label ujung panah (biplot): ujung yang berdekatan dikelompokkan lalu labelnya
 * disusun bertumpuk vertikal di samping kelompok, dengan garis penunjuk ke ujung
 * panahnya (mirip label luar diagram lingkaran). Mengembalikan Map id ->
 * { x, y, anchor, leader: [x1, y1, x2, y2] | null }.
 * items: [{ id, x, y, text, dx, dy }]  (dx, dy = arah panah, untuk menentukan sisi)
 */
export function stackLabels(items, bounds, { font = '600 12px Poppins, sans-serif', spacing = 16, near = 48 } = {}) {
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const sideOf = (it) => (it.dx >= 0 ? 'right' : 'left');
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (sideOf(a) === sideOf(b) && Math.hypot(a.x - b.x, a.y - b.y) < near) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  items.forEach((it, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push({ ...it, w: measureText(it.text, font) });
  });

  const labels = [];
  for (const members of groups.values()) {
    let side = sideOf(members[0]);
    const widest = Math.max(...members.map((m) => m.w));
    let column = side === 'right' ? Math.max(...members.map((m) => m.x)) + 12 : Math.min(...members.map((m) => m.x)) - 12;
    // Tidak muat di tepi grafik -> letakkan di sisi lain kelompok.
    if (side === 'right' && column + widest > bounds.x1) {
      side = 'left';
      column = Math.min(...members.map((m) => m.x)) - 12;
    } else if (side === 'left' && column - widest < bounds.x0) {
      side = 'right';
      column = Math.max(...members.map((m) => m.x)) + 12;
    }
    members.sort((a, b) => a.y - b.y);
    const center = members.reduce((sum, m) => sum + m.y, 0) / members.length;
    members.forEach((m, k) => {
      const single = members.length === 1;
      labels.push({
        id: m.id,
        tipX: m.x,
        tipY: m.y,
        x: single ? m.x + (side === 'right' ? 9 : -9) : column,
        y: single ? m.y : center + (k - (members.length - 1) / 2) * spacing,
        w: m.w,
        side,
      });
    });
  }

  // Pisahkan tumpukan yang masih bertabrakan (relaksasi 1 dimensi pada sumbu y).
  const box = (l) => (l.side === 'right' ? [l.x, l.x + l.w] : [l.x - l.w, l.x]);
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const [a0, a1] = box(a);
        const [b0, b1] = box(b);
        if (a1 < b0 || b1 < a0) continue;
        const dy = b.y - a.y;
        if (Math.abs(dy) >= spacing) continue;
        const push = (spacing - Math.abs(dy)) / 2 + 0.05;
        const dir = dy > 0 || (dy === 0 && a.tipY <= b.tipY) ? 1 : -1;
        a.y -= push * dir;
        b.y += push * dir;
        moved = true;
      }
    }
    for (const l of labels) l.y = Math.min(bounds.y1 - 4, Math.max(bounds.y0 + 10, l.y));
    if (!moved) break;
  }

  const result = new Map();
  for (const l of labels) {
    const displaced = Math.hypot(l.x - l.tipX, l.y - l.tipY) > 14;
    const endX = l.side === 'right' ? l.x - 3 : l.x + 3;
    result.set(l.id, {
      x: l.x,
      y: l.y + 4,
      anchor: l.side === 'right' ? 'start' : 'end',
      leader: displaced ? [l.tipX, l.tipY, endX, l.y] : null,
    });
  }
  return result;
}
