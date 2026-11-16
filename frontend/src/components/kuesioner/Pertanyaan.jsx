import { useId } from 'react';
import { MAKS_TEKS, isLainnya, potongTebal } from '../../lib/kuesioner.js';
import { AlertIcon, CheckIcon, ChevronDown } from '../Icons.jsx';

export function TeksKaya({ teks }) {
  return potongTebal(teks).map((p, i) =>
    p.tebal ? (
      <strong key={i} className="font-bold">
        {p.teks}
      </strong>
    ) : (
      <span key={i}>{p.teks}</span>
    ),
  );
}

const LABEL_LAINNYA = 'Yang lain:';

function Galat({ id, pesan }) {
  if (!pesan) return null;
  return (
    <p id={id} className="mt-3 flex items-start gap-1.5 text-[13px] font-medium text-bad">
      <AlertIcon size={16} className="mt-px shrink-0" /> {pesan}
    </p>
  );
}

// Tombol pilihan (radio / kotak centang) bergaya kartu: lingkaran/kotak kustom + label.
function Opsi({ jenis, name, checked, onChange, disabled, children, invalid }) {
  const radio = jenis === 'radio';
  return (
    <label
      className={`group flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[14px] leading-snug transition ${
        checked
          ? 'border-brand bg-brand-50 font-medium text-brand-900 shadow-[inset_3px_0_0_var(--color-brand)]'
          : `bg-white text-ink hover:border-brand-200 hover:bg-brand-50/60 ${invalid ? 'border-bad/40' : 'border-line'}`
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''} has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500`}
    >
      <input type={jenis} name={name} checked={checked} onChange={onChange} disabled={disabled} className="peer sr-only" />
      <span
        aria-hidden
        className={`grid size-5 shrink-0 place-items-center border-2 transition ${radio ? 'rounded-full' : 'rounded-md'} ${
          checked ? 'border-brand bg-brand text-white' : 'border-brand-300 bg-white'
        }`}
      >
        {checked && (radio ? <span className="size-2 rounded-full bg-white" /> : <CheckIcon size={13} strokeWidth={3} />)}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function PilihanGanda({ q, nilai, ubah, invalid }) {
  const name = useId();
  const lain = isLainnya(nilai);
  const banyak = q.opsi.length > 5;
  return (
    <div role="radiogroup" aria-invalid={invalid || undefined} className={`grid gap-2 ${banyak ? 'sm:grid-cols-2' : ''}`}>
      {q.opsi.map((o) => (
        <Opsi key={o} jenis="radio" name={name} checked={nilai === o} onChange={() => ubah(o)} invalid={invalid}>
          {o}
        </Opsi>
      ))}
      {q.lainnya && (
        <div className={banyak ? 'sm:col-span-2' : ''}>
          <Opsi jenis="radio" name={name} checked={lain} onChange={() => ubah({ lainnya: lain ? nilai.lainnya : '' })} invalid={invalid}>
            {LABEL_LAINNYA}
          </Opsi>
          {lain && (
            <input
              autoFocus
              aria-label="Jawaban lainnya"
              maxLength={MAKS_TEKS.lainnya}
              value={nilai.lainnya}
              onChange={(e) => ubah({ lainnya: e.target.value })}
              placeholder="Tuliskan jawaban Anda"
              className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-3 focus:ring-brand-100"
            />
          )}
        </div>
      )}
      {!q.wajib && nilai && (
        <button type="button" onClick={() => ubah(undefined)} className="justify-self-start text-[12px] font-semibold text-brand-600 hover:underline">
          Hapus pilihan
        </button>
      )}
    </div>
  );
}

function KotakCentang({ q, nilai, ubah, invalid }) {
  const name = useId();
  const daftar = Array.isArray(nilai) ? nilai : [];
  const lain = daftar.find(isLainnya);
  const penuh = q.maks_pilihan && daftar.length >= q.maks_pilihan;
  const set = (opsi, aktif) => {
    const tanpa = daftar.filter((v) => v !== opsi);
    ubah(aktif ? [...tanpa, opsi] : tanpa);
  };
  const setLain = (aktif, teks = '') => {
    const tanpa = daftar.filter((v) => !isLainnya(v));
    ubah(aktif ? [...tanpa, { lainnya: teks }] : tanpa);
  };
  return (
    <div>
      {q.maks_pilihan && (
        <p className="mb-3 text-[12px] text-ink-muted" aria-live="polite">
          Dipilih <strong className="text-brand-900 tabular">{daftar.length}</strong> dari maksimal {q.maks_pilihan}.
        </p>
      )}
      <div className={`grid gap-2 ${q.opsi.length > 5 ? 'sm:grid-cols-2' : ''}`} aria-invalid={invalid || undefined}>
        {q.opsi.map((o) => {
          const cek = daftar.includes(o);
          return (
            <Opsi key={o} jenis="checkbox" name={name} checked={cek} disabled={!cek && penuh} onChange={(e) => set(o, e.target.checked)} invalid={invalid}>
              {o}
            </Opsi>
          );
        })}
        {q.lainnya && (
          <div className={q.opsi.length > 5 ? 'sm:col-span-2' : ''}>
            <Opsi jenis="checkbox" name={name} checked={Boolean(lain)} disabled={!lain && penuh} onChange={(e) => setLain(e.target.checked)} invalid={invalid}>
              {LABEL_LAINNYA}
            </Opsi>
            {lain && (
              <input
                autoFocus
                aria-label="Jawaban lainnya"
                maxLength={MAKS_TEKS.lainnya}
                value={lain.lainnya}
                onChange={(e) => setLain(true, e.target.value)}
                placeholder="Tuliskan jawaban Anda"
                className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-3 focus:ring-brand-100"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Dropdown({ q, nilai, ubah, invalid, idGalat, idInput }) {
  return (
    <div className="relative max-w-xl">
      <select
        id={idInput}
        value={typeof nilai === 'string' ? nilai : ''}
        onChange={(e) => ubah(e.target.value || undefined)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? idGalat : undefined}
        className={`h-12 w-full appearance-none rounded-xl border bg-white pr-11 pl-3.5 text-[14px] text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-brand-100 ${
          invalid ? 'border-bad/60' : 'border-line hover:border-brand-200'
        } ${nilai ? '' : 'text-ink-muted'}`}
      >
        <option value="">Pilih</option>
        {q.opsi.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={18} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-brand-400" />
    </div>
  );
}

function Teks({ q, nilai, ubah, invalid, idGalat, idInput }) {
  const panjang = q.jenis === 'paragraf';
  const maks = q.validasi?.maks ?? MAKS_TEKS[q.jenis];
  const umum = {
    id: idInput,
    value: nilai ?? '',
    maxLength: maks,
    onChange: (e) => ubah(e.target.value),
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? idGalat : undefined,
    className: `w-full rounded-xl border bg-white px-3.5 py-3 text-[14px] text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-brand focus:ring-3 focus:ring-brand-100 ${
      invalid ? 'border-bad/60' : 'border-line hover:border-brand-200'
    }`,
  };
  if (panjang) {
    return (
      <div>
        <textarea rows={4} placeholder="Jawaban Anda" {...umum} className={`${umum.className} min-h-[120px] resize-y leading-relaxed`} />
        <p className="mt-1 text-right text-[11px] text-ink-muted tabular">
          {(nilai ?? '').length}/{maks}
        </p>
      </div>
    );
  }
  const pola = Boolean(q.validasi?.pola);
  return (
    <input
      type={pola ? 'tel' : 'text'}
      inputMode={pola ? 'numeric' : undefined}
      autoComplete={pola ? 'tel' : 'organization'}
      placeholder={q.placeholder ?? 'Jawaban Anda'}
      {...umum}
      className={`${umum.className} max-w-xl`}
    />
  );
}

function Grid({ q, nilai, ubah, galat }) {
  const isi = nilai ?? {};
  const dinilai = q.baris.filter((b) => isi[b.id]).length;
  return (
    <div>
      <p className="mb-3 text-[12px] text-ink-muted" aria-live="polite">
        <strong className="text-brand-900 tabular">{dinilai}</strong> dari {q.baris.length} pernyataan sudah dinilai.
      </p>
      <ol className="space-y-2.5">
        {q.baris.map((b, i) => {
          const belum = Boolean(galat[`${q.id}.${b.id}`]);
          return (
            <li
              key={b.id}
              data-galat={belum || undefined}
              className={`rounded-2xl border p-3 transition sm:p-4 ${belum ? 'border-bad/50 bg-bad-soft/40' : isi[b.id] ? 'border-brand-100 bg-brand-50/40' : 'border-line bg-white'}`}
            >
              <p id={`${q.id}-${b.id}`} className="flex gap-2 text-[14px] leading-snug font-medium text-brand-900">
                <span className="mt-px grid size-6 shrink-0 place-items-center rounded-lg bg-white text-[11px] font-bold text-brand-500 shadow-[0_0_0_1px_var(--color-line)] tabular">
                  {i + 1}
                </span>
                <span className="min-w-0">{b.teks}</span>
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`${q.id}-${b.id}`}
                aria-invalid={belum || undefined}
                className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {q.skala.map((s) => {
                  const aktif = isi[b.id] === s;
                  return (
                    <label
                      key={s}
                      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-[13px] leading-tight transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500 ${
                        aktif
                          ? 'border-brand bg-brand font-semibold text-white shadow-[0_6px_14px_-8px_rgb(20_72_122/0.8)]'
                          : 'border-line bg-white text-ink-soft hover:border-brand-200 hover:bg-brand-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${q.id}-${b.id}`}
                        checked={aktif}
                        onChange={() => ubah({ ...isi, [b.id]: s })}
                        className="sr-only"
                      />
                      {s}
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const RENDER = {
  pilihan_ganda: PilihanGanda,
  dropdown: Dropdown,
  kotak_centang: KotakCentang,
  teks_singkat: Teks,
  paragraf: Teks,
  grid: Grid,
};

export default function Pertanyaan({ q, nomor, nilai, ubah, galat }) {
  const id = useId();
  const pesan = galat[q.id];
  const Input = RENDER[q.jenis];
  const label = q.jenis === 'dropdown' || q.jenis === 'teks_singkat' || q.jenis === 'paragraf';
  const Judul = label ? 'label' : 'legend';
  const Wadah = label ? 'div' : 'fieldset';
  return (
    <Wadah
      data-pertanyaan={q.id}
      data-galat={pesan ? true : undefined}
      className={`min-w-0 rounded-[20px] border p-4 transition sm:p-6 ${pesan ? 'border-bad/50 bg-bad-soft/30' : 'border-line bg-white'}`}
    >
      <Judul
        {...(label ? { htmlFor: `${id}-input` } : {})}
        className={`mb-4 flex w-full gap-2.5 text-[15px] leading-snug font-semibold text-brand-900 sm:text-base ${label ? '' : 'float-left'}`}
      >
        <span className="mt-0.5 hidden h-6 min-w-6 shrink-0 place-items-center rounded-lg bg-gold-100 px-1 text-[11px] font-bold text-gold-700 tabular sm:grid">
          {nomor}
        </span>
        <span className="min-w-0">
          <TeksKaya teks={q.judul} />
          {q.wajib && (
            <span className="ml-1 text-bad" aria-hidden>
              *
            </span>
          )}
          {q.wajib && <span className="sr-only"> (wajib)</span>}
          {q.help && <span className="mt-1 block text-[13px] font-normal text-ink-muted">{q.help}</span>}
        </span>
      </Judul>
      <div className="clear-left">
        <Input q={q} nilai={nilai} ubah={ubah} invalid={Boolean(pesan)} galat={galat} idGalat={`${id}-galat`} idInput={`${id}-input`} />
        <Galat id={`${id}-galat`} pesan={pesan} />
      </div>
    </Wadah>
  );
}
