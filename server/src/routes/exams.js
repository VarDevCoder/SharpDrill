import { Router } from 'express';
import { requireUser } from '../auth.js';
import { grade as gradeAnswer } from '../content.js';
import { httpError } from '../errors.js';
import { shuffle } from './review.js';

const GRACE_SECONDS = 30;

export default function examRoutes({ db, content, progress }) {
  const r = Router();
  r.use(requireUser);

  /** Crea un examen cronometrado con preguntas aleatorias de los capítulos elegidos. */
  r.post('/', (req, res) => {
    const userId = req.user.id;
    let chapters = Array.isArray(req.body?.chapters) ? req.body.chapters.filter((c) => content.chapterById.has(c)) : [];
    if (chapters.length === 0) chapters = content.chapters.map((c) => c.id);
    const count = Math.min(60, Math.max(5, Number(req.body?.count) || 20));
    const minutes = Math.min(120, Math.max(1, Number(req.body?.minutes) || 20));

    const pool = [...content.items].filter(([, it]) => it.kind === 'question' && chapters.includes(it.chapterId));
    const picked = shuffle(pool).slice(0, count).map(([id]) => id);
    if (picked.length === 0) throw httpError(400, 'No hay preguntas para esos capítulos');

    const startedAt = new Date().toISOString();
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO exams (user_id, item_ids, chapters, time_limit, started_at, total) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, JSON.stringify(picked), JSON.stringify(chapters), minutes * 60, startedAt, picked.length);

    res.status(201).json({
      exam: {
        id: Number(lastInsertRowid), startedAt, timeLimit: minutes * 60, total: picked.length,
        items: picked.map((id) => progress.resolveItem(userId, id).public),
      },
    });
  });

  /** Entrega y corrige el examen. Cada respuesta también alimenta el SM-2. */
  r.post('/:id/submit', (req, res) => {
    const userId = req.user.id;
    const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(Number(req.params.id), userId);
    if (!exam) throw httpError(404, 'Examen no encontrado');
    if (exam.finished_at) throw httpError(409, 'Este examen ya fue entregado');

    const answers = req.body?.answers ?? {};
    const elapsed = (Date.now() - Date.parse(exam.started_at)) / 1000;
    const late = elapsed > exam.time_limit + GRACE_SECONDS;

    const results = JSON.parse(exam.item_ids).map((id) => {
      const it = progress.resolveItem(userId, id);
      const answered = Object.hasOwn(answers, id) && answers[id] !== null && answers[id] !== '';
      const { correct, expected } = answered && !late ? gradeAnswer(it.data, answers[id]) : { correct: false, expected: it.data.answer };
      progress.record(userId, id, it.chapterId, correct ? 2 : 0, 'exam', correct);
      return { ...it.public, answer: answered ? answers[id] : null, correct, expected, explanation: it.data.explanation };
    });
    const score = results.filter((x) => x.correct).length;
    db.prepare('UPDATE exams SET finished_at = ?, score = ? WHERE id = ?').run(new Date().toISOString(), score, exam.id);

    res.json({ result: { id: exam.id, score, total: exam.total, late, elapsed: Math.round(elapsed), results } });
  });

  r.get('/', (req, res) => {
    const rows = db.prepare(`SELECT id, chapters, time_limit, started_at, finished_at, score, total
      FROM exams WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 20`).all(req.user.id);
    res.json({
      exams: rows.map((x) => ({
        id: x.id, chapters: JSON.parse(x.chapters), timeLimit: x.time_limit,
        startedAt: x.started_at, finishedAt: x.finished_at, score: x.score, total: x.total,
      })),
    });
  });

  return r;
}
