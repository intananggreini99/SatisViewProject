import { SparkleIcon } from './Icons.jsx';

/** Logo "Satisview": S kaligrafi + "atis" biru tua + "view" kuning emas + bintang (warna logo asli). */
export default function Logo({ size = 'md', className = '' }) {
  const sizes = {
    lg: { s: 'text-[88px]', word: 'text-[40px]', star: 'size-8 -right-6', gap: '-mr-3' },
    md: { s: 'text-[44px] sm:text-[50px]', word: 'text-[21px] sm:text-[24px]', star: 'size-[18px] -right-4', gap: '-mr-1.5' },
    sm: { s: 'text-[40px]', word: 'text-[19px]', star: 'size-4 -right-3.5', gap: '-mr-1.5' },
  }[size];
  return (
    <span className={`relative inline-flex items-baseline select-none ${className}`} aria-label="SatisView" role="img">
      <span aria-hidden className={`font-script leading-none text-[#0b3383] ${sizes.s} ${sizes.gap}`} style={{ transform: 'translateY(0.1em)' }}>
        S
      </span>
      <span aria-hidden className={`leading-none font-extrabold tracking-tight text-[#0b3383] ${sizes.word}`}>atis</span>
      <span aria-hidden className={`leading-none font-extrabold tracking-tight text-[#f2a902] ${sizes.word}`}>view</span>
      <SparkleIcon className={`absolute -top-1 ${sizes.star}`} />
    </span>
  );
}
