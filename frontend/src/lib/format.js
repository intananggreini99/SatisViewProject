import { formatLocale } from 'd3';

// Format angka konsisten bahasa Indonesia: desimal koma, ribuan titik.
export const idLocale = formatLocale({
  decimal: ',',
  thousands: '.',
  grouping: [3],
  currency: ['Rp', ''],
  minus: '−',
});

const fixed2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fixed3 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fixed1 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const fmtIndex = (v) => (isNum(v) ? fixed2.format(v) : '–');
export const fmtPct = (v, digits = 2) => (isNum(v) ? `${(digits === 1 ? fixed1 : fixed2).format(v)}%` : '–');
export const fmtInt = (v) => (isNum(v) ? integer.format(v) : '–');
/** Skor rata-rata Likert (2 desimal) dan skor prioritas / stress (3 desimal). */
export const fmtScore = (v) => (isNum(v) ? fixed2.format(v) : '–');
export const fmtScore3 = (v) => (isNum(v) ? fixed3.format(v) : '–');
export const fmtCoord = idLocale.format('.2f');
export const fmtAxis = idLocale.format('~g');

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

export function fmtDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${dateFmt.format(date)} WIB`;
}

export function fmtBytes(bytes) {
  if (!isNum(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${fixed1.format(bytes / 1024)} KB`;
  return `${fixed1.format(bytes / 1024 / 1024)} MB`;
}

/** Kategori mutu pelayanan (PermenPANRB No. 14 Tahun 2017). */
export const GRADES = [
  { grade: 'A', label: 'Sangat Baik', range: '88,31 – 100,00' },
  { grade: 'B', label: 'Baik', range: '76,61 – 88,30' },
  { grade: 'C', label: 'Kurang Baik', range: '65,00 – 76,60' },
  { grade: 'D', label: 'Tidak Baik', range: '25,00 – 64,99' },
];

export function gradeOf(index) {
  if (!isNum(index)) return null;
  if (index >= 88.31) return GRADES[0];
  if (index >= 76.61) return GRADES[1];
  if (index >= 65) return GRADES[2];
  return GRADES[3];
}
