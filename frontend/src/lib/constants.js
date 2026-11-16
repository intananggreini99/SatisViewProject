import { ChatIcon, GaugeIcon, ScatterIcon } from '../components/Icons.jsx';

// Kelompok responden & tab dashboard (urutan sesuai desain).
export const GROUPS = [
  { key: 'mahasiswa', label: 'Mahasiswa', segmentLabel: 'Program Studi' },
  { key: 'dosen', label: 'Dosen', segmentLabel: 'Departemen' },
  { key: 'karyawan', label: 'Karyawan', segmentLabel: 'Unit Kerja' },
  { key: 'mitra_kerjasama', label: 'Mitra Kerja Sama', segmentLabel: 'Jenis Instansi' },
  { key: 'mitra_pengadaan', label: 'Mitra Pengadaan', segmentLabel: 'Jenis Penyedia' },
];

export const TABS = [
  { key: 'kpi', label: 'KPI', title: 'Key Performance Indicator', icon: GaugeIcon },
  { key: 'mapping', label: 'Mapping Analytics', title: 'Mapping Analytics', icon: ScatterIcon },
  { key: 'text', label: 'Text Analytics', title: 'Text Analytics', icon: ChatIcon },
];

export const SEMUA = 'Semua';

// Warna grafik D3 (harus sama dengan token di index.css).
// Pasangan Layanan/Fasilitas dan tiga level prioritas sudah diuji dengan
// validator palet dataviz (aman buta warna, kontras >= 3:1 di atas putih).
export const COLORS = {
  brand: '#14487A', // biru PENS
  brand900: '#0B2B4B',
  brand600: '#1F5FA6',
  brand400: '#5B87B9',
  gold: '#F3C903', // kuning PENS (sorotan)
  gold600: '#C98500',
  good: '#2A8A60', // batang "layanan unggulan"
  bad: '#B83A2B', // batang "prioritas perbaikan"
  layanan: '#1F5FA6',
  fasilitas: '#C98500',
  kategori: '#7A8699',
  respondent: '#A9C0DD',
  respondentSoft: '#D3DFEE',
  ink: '#10233D',
  inkSoft: '#44556C',
  inkMuted: '#5F6F87',
  line: '#DCE4EE',
  lineStrong: '#C5D2E2',
  surface: '#FFFFFF',
};

export const findGroup = (key) => GROUPS.find((g) => g.key === key) ?? GROUPS[0];

/** Warna level prioritas perbaikan (priority analysis tim): mendesak = merah, rendah = biru. */
export const LEVEL_COLORS = { Tinggi: '#C0392B', Sedang: '#C98500', Rendah: '#2C6DB3' };

/** Warna kategori mutu IKM (selalu tampil bersama huruf mutunya). */
export const GRADE_TONES = {
  A: 'bg-good-soft text-good',
  B: 'bg-brand-50 text-brand-700',
  C: 'bg-gold-100 text-gold-700',
  D: 'bg-bad-soft text-bad',
};
