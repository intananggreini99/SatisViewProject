// Konfigurasi API dashboard dari environment variable.
const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: int(process.env.PORT, 4000),
  pg: {
    host: process.env.PGHOST ?? 'postgres',
    port: int(process.env.PGPORT, 5432),
    user: process.env.PGUSER ?? 'satisview',
    password: process.env.PGPASSWORD ?? 'satisview',
    maxPerDatabase: int(process.env.PG_POOL_MAX, 4),
  },
  rawDb: process.env.RAW_DB ?? 'raw_data',
  webhdfsUrl: (process.env.WEBHDFS_URL ?? 'http://namenode:9870/webhdfs/v1').replace(/\/$/, ''),
  hdfsUser: process.env.HDFS_USER ?? 'root',
  reportPath: process.env.HDFS_REPORT_PATH ?? '/satisview/report/SatisView_Report.pdf',
  cacheTtlMs: int(process.env.CACHE_TTL_SECONDS, 30) * 1000,
  // Sama dengan SATISVIEW_MIN_RESPONDEN_MDS di pipeline (untuk pesan "MDS dilewati").
  minRespondenMds: int(process.env.SATISVIEW_MIN_RESPONDEN_MDS, 10),
};
