import { Router } from 'express';
import { requireUser } from '../auth.js';
import { grade as gradeAnswer } from '../content.js';
import { httpError } from '../errors.js';

const MODES = new Set(['study', 'review', 'practice', 'exam']);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const clampInt = (v, def, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function parseChapters(content, v) {
  return v ? String(v).split(',').filter((c) => content.chapterById.has(c)) : null;
}

/** Filtra capítulos por track (csharp, db, react, api, english) además de por lista explícita. */
export function chapterFilter(content, query) {
  let ids = parseChapters(content, query.chapter);
  if (query.track) {
    const inTrack = content.chapters.filter((c) => c.track === query.track).map((c) => c.id);
    ids = ids ? ids.filter((i) => inTrack.includes(i)) : inTrack;
  }
  return ids;
}

export default function reviewRoutes({ repo, content, progress }) {
  const r = Router();
  r.use(requireUser);

  /** Candidatos (ids globales) filtrados por capítulo(s) y tipo. */
  async function candidates(userId, chapters, kinds) {
    const out = [];
    for (const [id, it] of content.items) {
      if (chapters && !chapters.includes(it.chapterId)) continue;
      if (!kinds.includes(it.kind)) continue;
      out.push({ id, chapterId: it.chapterId });
    }
    if (kinds.includes('card')) {
      for (const c of await repo.listCustomCards(userId)) {
        if (chapters && !chapters.includes(c.chapterId)) continue;
        out.push({ id: c.id, chapterId: c.chapterId });
      }
    }
    return out;
  }

  /**
   * Cola de repaso activo: primero lo vencido (SM-2), luego elementos nuevos.
   * mode=mixed|cards|questions|drills|mistakes
   */
  r.get('/queue', async (req, res) => {
    const userId = req.user.id;
    const chapters = chapterFilter(content, req.query);
    const mode = String(req.query.mode ?? 'mixed');
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const newLimit = clampInt(req.query.newLimit, 10, 0, 100);
    const kinds = { cards: ['card'], questions: ['question'], drills: ['drill'] }[mode] ?? ['card', 'question'];

    const reviews = new Map((await repo.getReviews(userId)).map((x) => [x.itemId, x]));
    const cands = await candidates(userId, chapters, kinds);
    const nowIso = new Date().toISOString();

    let due, fresh;
    if (mode === 'mistakes') {
      due = cands.filter((c) => reviews.get(c.id)?.lastGrade === 0)
        .sort((a, b) => reviews.get(b.id).updatedAt.localeCompare(reviews.get(a.id).updatedAt));
      fresh = [];
    } else {
      due = cands.filter((c) => reviews.has(c.id) && reviews.get(c.id).dueAt <= nowIso)
        .sort((a, b) => reviews.get(a.id).dueAt.localeCompare(reviews.get(b.id).dueAt));
      fresh = cands.filter((c) => !reviews.has(c.id));
    }

    const picked = due.slice(0, limit);
    const room = Math.min(newLimit, limit - picked.length);
    if (room > 0) picked.push(...fresh.slice(0, room));

    const items = [];
    for (const c of shuffle(picked)) {
      const it = await progress.resolveItem(userId, c.id);
      if (it) items.push({ ...it.public, isNew: !reviews.has(c.id), chapterTitle: content.chapterById.get(it.chapterId)?.title });
    }
    res.json({ items, counts: { due: due.length, new: fresh.length } });
  });

  /** Autoevaluación de una flashcard (0 Otra vez, 1 Difícil, 2 Bien, 3 Fácil). */
  r.post('/card', async (req, res) => {
    const { itemId, grade } = req.body ?? {};
    const mode = MODES.has(req.body?.mode) ? req.body.mode : 'review';
    const it = await progress.resolveItem(req.user.id, itemId);
    if (!it || it.kind !== 'card') throw httpError(404, 'Tarjeta no encontrada');
    if (![0, 1, 2, 3].includes(grade)) throw httpError(400, 'grade debe ser 0..3');
    const next = await progress.record(req.user.id, itemId, it.chapterId, grade, mode, grade > 0);
    res.json({ next });
  });

  /** Responder una pregunta: el servidor corrige, explica y reprograma. */
  r.post('/answer', async (req, res) => {
    const { itemId, answer } = req.body ?? {};
    const mode = MODES.has(req.body?.mode) ? req.body.mode : 'practice';
    const it = await progress.resolveItem(req.user.id, itemId);
    if (!it || it.kind !== 'question') throw httpError(404, 'Pregunta no encontrada');
    if (answer === undefined || answer === null || answer === '' || typeof answer === 'object') throw httpError(400, 'Falta la respuesta');
    const { correct, expected } = gradeAnswer(it.data, answer);
    const confidence = [1, 2, 3].includes(req.body?.confidence) ? req.body.confidence : 2;
    const next = await progress.record(req.user.id, itemId, it.chapterId, correct ? confidence : 0, mode, correct);
    res.json({ correct, expected, explanation: it.data.explanation, next });
  });

  /** Set de práctica: prioriza lo fallado, lo nunca visto y lo de baja facilidad. */
  r.get('/practice', async (req, res) => {
    const userId = req.user.id;
    const chapters = chapterFilter(content, req.query);
    const count = clampInt(req.query.count, 10, 1, 50);
    const reviews = new Map((await repo.getReviews(userId)).map((x) => [x.itemId, x]));
    const weight = (id) => {
      const rv = reviews.get(id);
      if (!rv) return 2 + Math.random();
      if (rv.lastGrade === 0) return 3 + Math.random();
      return (3 - rv.ease) + Math.random() * 1.5;
    };
    const picked = (await candidates(userId, chapters, ['question']))
      .map((c) => ({ c, w: weight(c.id) })).sort((a, b) => b.w - a.w).slice(0, count);
    const items = [];
    for (const { c } of picked) {
      const it = await progress.resolveItem(userId, c.id);
      items.push({ ...it.public, chapterTitle: content.chapterById.get(it.chapterId)?.title });
    }
    res.json({ items: shuffle(items) });
  });

  return r;
}
