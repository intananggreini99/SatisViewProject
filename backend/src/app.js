import compression from 'compression';
import express from 'express';
import { createAuthService } from './auth/service.js';
import { createPgUserStore } from './auth/users.js';
import { createKafkaProducer } from './kuesioner/producer.js';
import { config } from './config.js';
import { createRouter } from './routes.js';

/**
 * @param {object} deps  dependensi yang bisa diganti saat pengujian:
 *   auth (layanan login), producer (Kafka), kontrak (isi kuisioner).
 */
export function createApp(deps = {}) {
  const auth = deps.auth ?? createAuthService({ store: deps.userStore ?? createPgUserStore() });
  const producer = deps.producer === undefined ? createKafkaProducer() : deps.producer;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.use(compression());
  app.use('/api', createRouter({ auth, producer, kontrak: deps.kontrak }));
  app.get('/', (req, res) => res.json({ service: 'satisview-api', docs: '/api/health' }));
  app.locals.auth = auth;
  app.locals.producer = producer;
  return app;
}
