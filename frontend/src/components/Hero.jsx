import { fmtDateTime, fmtIndex, fmtInt, gradeOf } from '../lib/format.js';

/**
 * Banner foto gedung PENS (gradasi biru) berisi kelompok responden yang sedang
 * dibuka beserta ringkasan datanya.
 */
export default function Hero({ group, info }) {
  const ready = info?.status === 'ready';
  const grade = ready ? (info.grade ?? gradeOf(info.index)?.grade) : null;
  const chips = ready
    ? [
        `${fmtInt(info.respondents)} responden`,
        `Indeks total ${fmtIndex(info.index)}${grade ? ` (mutu ${grade})` : ''}`,
        info.updatedAt && `Diperbarui ${fmtDateTime(info.updatedAt)}`,
      ]
    : [info?.status === 'empty' ? 'Belum ada respons' : info ? 'Belum diproses pipeline' : 'Memuat ringkasan…'];

  return (
    <section className="mx-auto w-full max-w-[1320px] px-3 pt-4 sm:px-6 sm:pt-6 lg:px-10">
      <div className="on-dark relative isolate overflow-hidden rounded-[24px] shadow-banner sm:rounded-[28px]">
        <picture>
          <source srcSet="/hero-pens.webp" type="image/webp" />
          <img
            src="/hero-pens.jpg"
            alt=""
            className="absolute inset-0 -z-20 size-full object-cover object-[60%_35%]"
            fetchPriority="high"
          />
        </picture>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgb(7_28_51/0.96)_0%,rgb(11_43_75/0.9)_38%,rgb(20_72_122/0.62)_72%,rgb(20_72_122/0.28)_100%)]" />

        <div className="flex min-h-[156px] flex-col justify-end gap-4 px-5 py-6 sm:min-h-[184px] sm:px-9 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-gold uppercase">Kelompok responden</p>
            <h1 className="mt-1 text-[28px] leading-tight font-bold tracking-tight text-white sm:text-[36px]">
              <span className="sr-only">SatisView, dashboard kepuasan </span>
              {group.label}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-brand-100 sm:text-[15px]">
              Kepuasan terhadap layanan dan fasilitas kampus Politeknik Elektronika Negeri Surabaya.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2 lg:justify-end" aria-label="Ringkasan data">
            {chips.filter(Boolean).map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-white/35 bg-white/12 px-3 py-1 text-xs font-medium text-white backdrop-blur-[2px] sm:text-[13px]"
              >
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
