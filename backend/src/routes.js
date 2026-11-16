import { Readable } from 'node:stream';
import { Router } from 'express';
import { createCache } from './cache.js';
import { config } from './config.js';
import { query } from './db.js';
import { findGroup, GROUPS } from './groups.js';
import {
  SEMUA,
  getComments,
  getGroupOverview,
  getKpi,
  getMapping,
  getSegments,
  getTopics,
} from './services/dashboard.js';
import { getReportStatus, openReportStream, reportFilename } from './services/report.js';

const cache = createCache(config.cacheTtlMs);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const cleanText = (value, max = 200) => {
  if (value === undefined || value === null) return '';
  const textValue = String(value).trim();
  if (textValue.length > max) throw new HttpError(400, 'Parameter terlalu panjang.');
  return textValue;
};

const intParam = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

function requireGroup(req) {
  const group = findGroup(req.params.group);
  if (!group) throw new HttpError(404, `Kelompok responden '${req.params.group}' tidak dikenal.`);
  return group;
}

const segmentOf = (req) => cleanText(req.query.segmen) || SEMUA;

export function createRouter() {
  const router = Router();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, max-age=15');
    next();
  });

  router.get('/health/live', (req, res) => res.json({ status: 'ok' }));

  router.get('/health', async (req, res) => {
    const checks = { api: 'ok' };
    try {
      await query(config.rawDb, 'SELECT 1');
      checks.postgres = 'ok';
    } catch (error) {
      checks.postgres = error.code === '3D000' ? 'ok (database raw_data belum dibuat)' : `error: ${error.message}`;
    }
    const report = await getReportStatus();
    checks.hdfs = report.reason === 'hdfs_unreachable' ? `error: ${report.detail}` : 'ok';
    const healthy = checks.postgres.startsWith('ok');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
  });

  router.get('/groups', async (req, res) => {
    const data = await cache.wrap('groups', async () => ({
      groups: await Promise.all(GROUPS.map((group) => getGroupOverview(group))),
    }));
    res.json(data);
  });

  router.get('/groups/:group/segments', async (req, res) => {
    const group = requireGroup(req);
    res.json(await cache.wrap(`segments:${group.key}`, () => getSegments(group)));
  });

  router.get('/groups/:group/kpi', async (req, res) => {
    const group = requireGroup(req);
    const segment = segmentOf(req);
    res.json(await cache.wrap(`kpi:${group.key}:${segment}`, () => getKpi(group, segment)));
  });

  router.get('/groups/:group/mapping', async (req, res) => {
    const group = requireGroup(req);
    const segment = segmentOf(req);
    res.json(await cache.wrap(`mapping:${group.key}:${segment}`, () => getMapping(group, segment)));
  });

  router.get('/groups/:group/topics', async (req, res) => {
    const group = requireGroup(req);
    const segment = segmentOf(req);
    res.json(await cache.wrap(`topics:${group.key}:${segment}`, () => getTopics(group, segment)));
  });

  router.get('/groups/:group/comments', async (req, res) => {
    const group = requireGroup(req);
    const params = {
      segment: segmentOf(req),
      topic: cleanText(req.query.topik),
      search: cleanText(req.query.q, 100),
      limit: intParam(req.query.limit, 50, 1, 100),
      offset: intParam(req.query.offset, 0, 0, 1_000_000),
    };
    const key = `comments:${group.key}:${JSON.stringify(params)}`;
    res.json(await cache.wrap(key, () => getComments(group, params)));
  });

  router.get('/report/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await getReportStatus());
  });

  router.get('/report', async (req, res) => {
    const status = await getReportStatus();
    if (!status.available) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).json({
        error: 'Laporan belum tersedia.',
        detail:
          status.reason === 'hdfs_unreachable'
            ? 'HDFS tidak dapat dihubungi.'
            : `Unggah ${status.filename} ke folder laporan Google Drive lalu jalankan DAG gdrive_to_hdfs.`,
      });
    }
    const upstream = await openReportStream();
    if (!upstream.ok || !upstream.body) throw new HttpError(502, 'Gagal membaca laporan dari HDFS.');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${reportFilename()}"`,
      'Cache-Control': 'no-store',
    });
    if (upstream.headers.get('content-length')) res.set('Content-Length', upstream.headers.get('content-length'));
    Readable.fromWeb(upstream.body).pipe(res);
  });

  router.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

  // eslint-disable-next-line no-unused-vars
  router.use((error, req, res, next) => {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    const unreachable = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P03'].includes(error.code);
    console.error(`[api] ${req.method} ${req.originalUrl}:`, error.message);
    return res.status(unreachable ? 503 : 500).json({
      error: unreachable ? 'Database belum dapat dihubungi. Coba lagi sebentar.' : 'Terjadi kesalahan pada server.',
    });
  });

  return router;
}
