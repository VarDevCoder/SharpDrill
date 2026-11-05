import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import authRoutes from './routes/auth.js';
import chapterRoutes from './routes/chapters.js';
import reviewRoutes from './routes/review.js';
import drillRoutes from './routes/drills.js';
import examRoutes from './routes/exams.js';
import statsRoutes from './routes/stats.js';
import customCardRoutes from './routes/custom-cards.js';
import snippetRoutes from './routes/snippets.js';
import { createProgress } from './progress.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WEB_DIST = join(__dirname, '..', '..', 'web', 'dist');

export function createApp({ repo, content, secureCookies = false, staticDir = WEB_DIST }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(loadUser(repo));

  const ctx = { repo, content, secureCookies, progress: createProgress(repo, content) };

  app.get('/api/health', (_req, res) => res.json({ ok: true, db: repo.kind, chapters: content.chapters.length, items: content.items.size }));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/chapters', chapterRoutes(ctx));
  app.use('/api/review', reviewRoutes(ctx));
  app.use('/api/drills', drillRoutes(ctx));
  app.use('/api/exams', examRoutes(ctx));
  app.use('/api/stats', statsRoutes(ctx));
  app.use('/api/custom-cards', customCardRoutes(ctx));
  app.use('/api/snippets', snippetRoutes(ctx));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // Frontend React compilado (npm run build). En desarrollo lo sirve Vite con proxy a /api.
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: 'index.html', maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  // Manejador de errores: 4xx con mensaje, 5xx genérico
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno' : err.message });
  });

  return app;
}
