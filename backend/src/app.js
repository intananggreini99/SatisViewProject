import compression from 'compression';
import express from 'express';
import { createRouter } from './routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(compression());
  app.use('/api', createRouter());
  app.get('/', (req, res) => res.json({ service: 'satisview-api', docs: '/api/health' }));
  return app;
}
