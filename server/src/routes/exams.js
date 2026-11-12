import { Router } from 'express';
import { requireUser } from '../auth.js';
import { grade as gradeAnswer } from '../content.js';
import { httpError } from '../errors.js';
import { shuffle } from './review.js';

const GRACE_SECONDS = 30;

export default function examRoutes({ repo, content, progress }) {
  const r = Router();
  r.use(requireUser);

  /** Crea un examen cronometrado con preguntas aleatorias de los capítulos elegidos. */
  r.post('/', async (req, res) => {
    const userId = req.user.id;
    let chapters = Array.isArray(req.body?.chapters) ? req.body.chapters.filter((c) => content.chapterById.has(c)) : [];
    if (req.body?.track) chapters = (chapters.length ? chapters : content.chapters.map((c) => c.id))
      .filter((id) => content.chapterById.get(id).track === req.body.track);
    if (chapters.length === 0 && !req.body?.track) chapters = content.chapters.map((c) => c.id);
    const count = Math.min(60, Math.max(5, Number(req.body?.count) || 20));
    const minutes = Math.min(120, Math.max(1, Number(req.body?.minutes) || 20));

    const pool = [...content.items].filter(([, it]) => it.kind === 'question' && chapters.includes(it.chapterId));
    const picked = shuffle(pool).slice(0, count).map(([id]) => id);
    if (picked.length === 0) throw httpError(400, 'No hay preguntas para esos capítulos');

    const startedAt = new Date();
    const id = await repo.createExam({ userId, itemIds: picked, chapters, timeLimit: minutes * 60, startedAt, total: picked.length });
    const items = [];
    for (const itemId of picked) items.push((await progress.resolveItem(userId, itemId)).public);
    res.status(201).json({ exam: { id, startedAt: startedAt.toISOString(), timeLimit: minutes * 60, total: picked.length, items } });
  });

  /** Entrega y corrige el examen. Cada respuesta también alimenta el SM-2. */
  r.post('/:id/submit', async (req, res) => {
    const userId = req.user.id;
    const exam = await repo.getExam(userId, Number(req.params.id));
    if (!exam) throw httpError(404, 'Examen no encontrado');
    if (exam.finishedAt) throw httpError(409, 'Este examen ya fue entregado');

    const answers = req.body?.answers ?? {};
    const elapsed = (Date.now() - Date.parse(exam.startedAt)) / 1000;
    const late = elapsed > exam.timeLimit + GRACE_SECONDS;

    const graded = [];
    for (const id of exam.itemIds) {
      const it = await progress.resolveItem(userId, id);
      if (!it) continue; // la pregunta ya no existe en el contenido
      const answered = Object.hasOwn(answers, id) && answers[id] !== null && answers[id] !== '';
      const { correct, expected } = answered && !late ? gradeAnswer(it.data, answers[id]) : { correct: false, expected: it.data.answer };
      graded.push({ it, id, answered, correct, expected });
    }
    const score = graded.filter((x) => x.correct).length;
    // finishExam es condicional (finished_at IS NULL): dos entregas simultáneas no puntúan dos veces
    if (!(await repo.finishExam(userId, exam.id, score))) throw httpError(409, 'Este examen ya fue entregado');

    await Promise.all(graded.map((g) => progress.record(userId, g.id, g.it.chapterId, g.correct ? 2 : 0, 'exam', g.correct)));
    const results = [];
    for (const g of graded) {
      results.push({ ...g.it.public, answer: g.answered ? answers[g.id] : null, correct: g.correct, expected: g.expected, explanation: g.it.data.explanation });
    }
    res.json({ result: { id: exam.id, score, total: exam.total, late, elapsed: Math.round(elapsed), results } });
  });

  r.get('/', async (req, res) => {
    const exams = await repo.listExams(req.user.id, 20);
    res.json({ exams: exams.map(({ itemIds, ...x }) => x) });
  });

  return r;
}
