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

const clampInt = (v, def, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export default function reviewRoutes({ db, content, progress }) {
  const r = Router();
  r.use(requireUser);

  /** Candidatos (ids globales) filtrados por capítulo(s) y tipo. */
  function candidates(userId, chapters, kind) {
    const out = [];
    for (const [id, it] of content.items) {
      if (chapters && !chapters.includes(it.chapterId)) continue;
      if (kind && it.kind !== kind) continue;
      out.push({ id, chapterId: it.chapterId });
    }
    if (!kind || kind === 'card') {
      const rows = db.prepare('SELECT id, chapter_id FROM custom_cards WHERE user_id = ?').all(userId);
      for (const row of rows) {
        if (chapters && !chapters.includes(row.chapter_id)) continue;
        out.push({ id: `u.${row.id}`, chapterId: row.chapter_id });
      }
    }
    return out;
  }

  const parseChapters = (v) => (v ? String(v).split(',').filter((c) => content.chapterById.has(c)) : null);

  /**
   * Cola de repaso activo: primero lo vencido (SM-2), luego elementos nuevos.
   * mode=mixed|cards|questions|mistakes
   */
  r.get('/queue', (req, res) => {
    const userId = req.user.id;
    const chapters = parseChapters(req.query.chapter);
    const mode = String(req.query.mode ?? 'mixed');
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const newLimit = clampInt(req.query.newLimit, 10, 0, 100);
    const kind = mode === 'cards' ? 'card' : mode === 'questions' ? 'question' : null;

    const reviews = new Map(db.prepare('SELECT * FROM reviews WHERE user_id = ?').all(userId).map((x) => [x.item_id, x]));
    const cands = candidates(userId, chapters, kind);
    const nowIso = new Date().toISOString();

    let due, fresh;
    if (mode === 'mistakes') {
      due = cands.filter((c) => reviews.get(c.id)?.last_grade === 0)
        .sort((a, b) => reviews.get(b.id).updated_at.localeCompare(reviews.get(a.id).updated_at));
      fresh = [];
    } else {
      due = cands.filter((c) => reviews.has(c.id) && reviews.get(c.id).due_at <= nowIso)
        .sort((a, b) => reviews.get(a.id).due_at.localeCompare(reviews.get(b.id).due_at));
      fresh = cands.filter((c) => !reviews.has(c.id));
    }

    const picked = due.slice(0, limit);
    const room = Math.min(newLimit, limit - picked.length);
    if (room > 0) picked.push(...fresh.slice(0, room));

    const items = shuffle(picked).map((c) => {
      const it = progress.resolveItem(userId, c.id);
      const rv = reviews.get(c.id);
      return { ...it.public, isNew: !rv, chapterTitle: content.chapterById.get(it.chapterId)?.title };
    });
    res.json({ items, counts: { due: due.length, new: fresh.length } });
  });

  /** Autoevaluación de una flashcard (0 Otra vez, 1 Difícil, 2 Bien, 3 Fácil). */
  r.post('/card', (req, res) => {
    const { itemId, grade } = req.body ?? {};
    const mode = MODES.has(req.body?.mode) ? req.body.mode : 'review';
    const it = progress.resolveItem(req.user.id, itemId);
    if (!it || it.kind !== 'card') throw httpError(404, 'Tarjeta no encontrada');
    if (![0, 1, 2, 3].includes(grade)) throw httpError(400, 'grade debe ser 0..3');
    const next = progress.record(req.user.id, itemId, it.chapterId, grade, mode, grade > 0);
    res.json({ next });
  });

  /** Responder una pregunta: el servidor corrige, explica y reprograma. */
  r.post('/answer', (req, res) => {
    const { itemId, answer } = req.body ?? {};
    const mode = MODES.has(req.body?.mode) ? req.body.mode : 'practice';
    const it = progress.resolveItem(req.user.id, itemId);
    if (!it || it.kind !== 'question') throw httpError(404, 'Pregunta no encontrada');
    const { correct, expected } = gradeAnswer(it.data, answer);
    const confidence = [1, 2, 3].includes(req.body?.confidence) ? req.body.confidence : 2;
    const next = progress.record(req.user.id, itemId, it.chapterId, correct ? confidence : 0, mode, correct);
    res.json({ correct, expected, explanation: it.data.explanation, next });
  });

  /** Set de práctica: prioriza lo nunca visto, lo fallado y lo de baja facilidad. */
  r.get('/practice', (req, res) => {
    const userId = req.user.id;
    const chapters = parseChapters(req.query.chapter);
    const count = clampInt(req.query.count, 10, 1, 50);
    const reviews = new Map(db.prepare('SELECT * FROM reviews WHERE user_id = ?').all(userId).map((x) => [x.item_id, x]));
    const weight = (id) => {
      const rv = reviews.get(id);
      if (!rv) return 2 + Math.random();
      if (rv.last_grade === 0) return 3 + Math.random();
      return (3 - rv.ease) + Math.random() * 1.5;
    };
    const items = candidates(userId, chapters, 'question')
      .map((c) => ({ c, w: weight(c.id) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, count)
      .map(({ c }) => {
        const it = progress.resolveItem(userId, c.id);
        return { ...it.public, chapterTitle: content.chapterById.get(it.chapterId)?.title };
      });
    res.json({ items: shuffle(items) });
  });

  return r;
}
