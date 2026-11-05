import { Router } from 'express';
import { requireUser } from '../auth.js';
import { publicCard, publicQuestion } from '../content.js';
import { httpError } from '../errors.js';

export default function chapterRoutes({ db, content, progress }) {
  const r = Router();
  r.use(requireUser);

  r.get('/', (req, res) => {
    res.json({ chapters: progress.chapterSummaries(req.user.id) });
  });

  // Búsqueda de texto en teoría y tarjetas
  r.get('/search', (req, res) => {
    const term = String(req.query.q ?? '').trim().toLowerCase();
    if (term.length < 2) return res.json({ results: [] });
    const results = [];
    for (const ch of content.chapters) {
      for (const s of ch.sections) {
        const hay = (s.title + '\n' + s.body).toLowerCase();
        const i = hay.indexOf(term);
        if (i >= 0) results.push({ type: 'section', chapterId: ch.id, chapterTitle: ch.title, sectionId: s.id,
          title: s.title, snippet: (s.title + '\n' + s.body).slice(Math.max(0, i - 60), i + 100) });
      }
      for (const c of ch.cards) {
        const hay = (c.front + '\n' + c.back).toLowerCase();
        if (hay.includes(term)) results.push({ type: 'card', chapterId: ch.id, chapterTitle: ch.title,
          title: c.front, snippet: c.back.slice(0, 160) });
      }
    }
    res.json({ results: results.slice(0, 40) });
  });

  r.get('/:id', (req, res) => {
    const ch = content.chapterById.get(req.params.id);
    if (!ch) throw httpError(404, 'Capítulo no encontrado');
    const read = db.prepare('SELECT section_id FROM sections_read WHERE user_id = ? AND chapter_id = ?')
      .all(req.user.id, ch.id).map((x) => x.section_id);
    const summary = progress.chapterSummaries(req.user.id).find((c) => c.id === ch.id);
    const idx = content.chapters.indexOf(ch);
    res.json({
      chapter: {
        ...summary,
        objectives: ch.objectives ?? [],
        sections: ch.sections,
        cards: ch.cards.map((c) => publicCard(`${ch.id}.${c.id}`, c, ch.id)),
        questions: ch.questions.map((q) => publicQuestion(`${ch.id}.${q.id}`, q, ch.id)),
        readSections: read,
        prev: content.chapters[idx - 1]?.id ?? null,
        next: content.chapters[idx + 1]?.id ?? null,
      },
    });
  });

  r.post('/:id/sections/:sid/read', (req, res) => {
    const ch = content.chapterById.get(req.params.id);
    if (!ch || !ch.sections.some((s) => s.id === req.params.sid)) throw httpError(404, 'Sección no encontrada');
    const done = req.body?.read !== false;
    if (done) {
      db.prepare('INSERT OR IGNORE INTO sections_read (user_id, chapter_id, section_id) VALUES (?, ?, ?)')
        .run(req.user.id, ch.id, req.params.sid);
    } else {
      db.prepare('DELETE FROM sections_read WHERE user_id = ? AND chapter_id = ? AND section_id = ?')
        .run(req.user.id, ch.id, req.params.sid);
    }
    res.json({ ok: true, read: done });
  });

  return r;
}
