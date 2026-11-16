import { createApp } from './app.js';
import { config } from './config.js';
import { closeAll } from './db.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`[satisview-api] berjalan di port ${config.port} (PostgreSQL ${config.pg.host}:${config.pg.port})`);
});

const shutdown = async (signal) => {
  console.log(`[satisview-api] ${signal} diterima, menutup koneksi...`);
  server.close(async () => {
    await closeAll();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
