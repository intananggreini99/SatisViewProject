// Kelompok responden — harus sama dengan airflow/include/satisview/respondents.py
export const GROUPS = [
  { key: 'mahasiswa', label: 'Mahasiswa', segmentLabel: 'Program Studi' },
  { key: 'dosen', label: 'Dosen', segmentLabel: 'Departemen' },
  { key: 'karyawan', label: 'Karyawan', segmentLabel: 'Unit Kerja' },
  { key: 'mitra_kerjasama', label: 'Mitra Kerja Sama', segmentLabel: 'Jenis Instansi' },
  { key: 'mitra_pengadaan', label: 'Mitra Pengadaan', segmentLabel: 'Jenis Penyedia' },
].map((group) => ({
  ...group,
  database: `analysis_${group.key}`,
  rawTable: `kuisioner_${group.key}`,
}));

const BY_KEY = new Map(GROUPS.map((group) => [group.key, group]));

export function findGroup(key) {
  return BY_KEY.get(String(key ?? '').toLowerCase()) ?? null;
}
