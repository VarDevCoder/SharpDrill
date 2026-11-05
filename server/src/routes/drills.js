import { Router } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireUser } from '../auth.js';
import { gradeDrill } from '../content.js';
import { httpError } from '../errors.js';
import { chapterFilter, clampInt, shuffle } from './review.js';

/**
 * Drills de código cronometrados (C#, PL/SQL, SQL, React/TSX, curl, Postman, APIM).
 * El cronómetro lo controla el servidor: /start devuelve un ticket firmado con HMAC
 * que contiene la hora de inicio; al entregar, el tiempo se calcula en el servidor.
 */
/**
 * Clave HMAC: DRILL_SECRET si existe; si no, una derivada de ORACLE_PASSWORD (estable entre instancias
 * serverless); y en local, aleatoria por proceso.
 */
export function defaultDrillSecret(env = process.env) {
  if (env.DRILL_SECRET) return env.DRILL_SECRET;
  if (env.ORACLE_PASSWORD) return createHash('sha256').update(`sharpdrill-drill:${env.ORACLE_PASSWORD}`).digest('hex');
  return randomBytes(32).toString('hex');
}

export function createTicketSigner(secret = defaultDrillSecret()) {
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    issue(userId, itemId, startedAt = Date.now()) {
      const payload = Buffer.from(JSON.stringify({ u: userId, i: itemId, t: startedAt })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    verify(ticket, userId, itemId) {
      const [payload, sig] = String(ticket ?? '').split('.');
      if (!payload || !sig) return null;
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(sig);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (data.u !== userId || data.i !== itemId) return null;
      return data.t;
    },
  };
}

export default function drillRoutes({ repo, content, progress, tickets = createTicketSigner() }) {
  const r = Router();
  r.use(requireUser);

  /** Lista de drills disponibles (filtrable por track, capítulo y lenguaje) con el mejor tiempo del usuario. */
  r.get('/', async (req, res) => {
    const chapters = chapterFilter(content, req.query);
    const lang = req.query.lang ? String(req.query.lang) : null;
    const [best, reviews] = await Promise.all([repo.bestDrillTimes(req.user.id), repo.getReviews(req.user.id)]);
    const bestBy = new Map(best.map((b) => [b.itemId, b.bestMs]));
    const rv = new Map(reviews.map((x) => [x.itemId, x]));
    const nowIso = new Date().toISOString();
    const items = [];
    for (const [id, it] of content.items) {
      if (it.kind !== 'drill') continue;
      if (chapters && !chapters.includes(it.chapterId)) continue;
      if (lang && it.data.lang !== lang) continue;
      const pub = (await progress.resolveItem(req.user.id, id)).public;
      items.push({
        ...pub, chapterTitle: content.chapterById.get(it.chapterId).title,
        bestMs: bestBy.get(id) ?? null, due: rv.has(id) ? rv.get(id).dueAt <= nowIso : null, isNew: !rv.has(id),
      });
    }
    res.json({ items });
  });

  /** Sesión de drills: prioriza vencidos y nuevos; mezcla el resto. */
  r.get('/session', async (req, res) => {
    const count = clampInt(req.query.count, 5, 1, 20);
    const chapters = chapterFilter(content, req.query);
    const lang = req.query.lang ? String(req.query.lang) : null;
    const reviews = new Map((await repo.getReviews(req.user.id)).map((x) => [x.itemId, x]));
    const nowIso = new Date().toISOString();
    const pool = [...content.items].filter(([, it]) => it.kind === 'drill'
      && (!chapters || chapters.includes(it.chapterId)) && (!lang || it.data.lang === lang));
    const score = ([id]) => {
      const rv = reviews.get(id);
      if (!rv) return 2 + Math.random();
      if (rv.dueAt <= nowIso) return 3 + Math.random();
      return Math.random();
    };
    const picked = shuffle(pool).map((e) => [e, score(e)]).sort((a, b) => b[1] - a[1]).slice(0, count).map(([e]) => e[0]);
    const items = [];
    for (const id of picked) {
      const it = await progress.resolveItem(req.user.id, id);
      items.push({ ...it.public, chapterTitle: content.chapterById.get(it.chapterId).title, isNew: !reviews.has(id) });
    }
    res.json({ items });
  });

  r.get('/history', async (req, res) => {
    const rows = await repo.drillHistory(req.user.id, clampInt(req.query.limit, 30, 1, 100));
    res.json({
      history: rows.map((h) => ({ ...h, title: content.items.get(h.itemId)?.data.title ?? h.itemId, lang: content.items.get(h.itemId)?.data.lang })),
    });
  });

  r.post('/:itemId/start', async (req, res) => {
    const it = await progress.resolveItem(req.user.id, req.params.itemId);
    if (!it || it.kind !== 'drill') throw httpError(404, 'Drill no encontrado');
    const startedAt = Date.now();
    res.json({ ticket: tickets.issue(req.user.id, req.params.itemId, startedAt), startedAt: new Date(startedAt).toISOString(), timeLimit: it.data.timeLimit });
  });

  r.post('/:itemId/submit', async (req, res) => {
    const itemId = req.params.itemId;
    const it = await progress.resolveItem(req.user.id, itemId);
    if (!it || it.kind !== 'drill') throw httpError(404, 'Drill no encontrado');
    const startedAt = tickets.verify(req.body?.ticket, req.user.id, itemId);
    if (!startedAt) throw httpError(400, 'Ticket de drill inválido: inicia el drill de nuevo');
    const code = String(req.body?.code ?? '');
    if (code.length > 20_000) throw httpError(413, 'Código demasiado largo');

    const elapsedMs = Date.now() - startedAt;
    const g = gradeDrill(it.data, code, elapsedMs);
    const next = await progress.record(req.user.id, itemId, it.chapterId, g.srsGrade, 'drill', g.correct);
    await repo.saveDrillSubmission({
      userId: req.user.id, itemId, chapterId: it.chapterId, code, passed: g.passed, total: g.total,
      elapsedMs, timeLimit: it.data.timeLimit,
    });
    res.json({
      ...g, elapsedMs, timeLimit: it.data.timeLimit,
      solution: it.data.solution, explanation: it.data.explanation ?? null, next,
    });
  });

  return r;
}
