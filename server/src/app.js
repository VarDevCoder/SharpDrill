import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import authRoutes from './routes/auth.js';
import chapterRoutes from './routes/chapters.js';
import reviewRoutes from './routes/review.js';
import examRoutes from './routes/exams.js';
import statsRoutes from './routes/stats.js';
import customCardRoutes from './routes/custom-cards.js';
import { createProgress } from './progress.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

export function createApp({ db, content, secureCookies = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(loadUser(db));

  const ctx = { db, content, secureCookies, progress: createProgress(db, content) };

  app.get('/api/health', (_req, res) => res.json({ ok: true, chapters: content.chapters.length }));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/chapters', chapterRoutes(ctx));
  app.use('/api/review', reviewRoutes(ctx));
  app.use('/api/exams', examRoutes(ctx));
  app.use('/api/stats', statsRoutes(ctx));
  app.use('/api/custom-cards', customCardRoutes(ctx));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(PUBLIC_DIR, 'index.html')));

  // Manejador de errores: errores de validación (status) vs. errores internos
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno' : err.message });
  });

  return app;
}
