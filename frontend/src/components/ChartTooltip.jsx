import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tooltip grafik: nilai tebal di atas, keterangan di bawahnya.
 * Posisi dijaga agar tidak keluar dari kontainer grafik.
 */
export default function ChartTooltip({ tip, bounds }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    const maxW = bounds?.width ?? window.innerWidth;
    let left = tip.x + 14;
    if (left + w > maxW - 4) left = tip.x - w - 14;
    let top = tip.y - h - 12;
    if (top < 4) top = tip.y + 16;
    setPos({ left: Math.max(4, left), top });
  }, [tip, bounds]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none absolute z-30 max-w-[260px] rounded-xl bg-brand-900 px-3.5 py-2.5 text-white shadow-pop"
      style={{ left: pos.left, top: pos.top }}
    >
      {tip.value && <p className="text-base leading-tight font-bold text-gold">{tip.value}</p>}
      <p className="text-sm leading-snug font-semibold">{tip.title}</p>
      {tip.lines?.map((line) => (
        <p key={line} className="text-xs leading-snug text-brand-100">
          {line}
        </p>
      ))}
    </div>
  );
}
