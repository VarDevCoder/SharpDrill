import { Router } from 'express';
import { requireUser } from '../auth.js';
import { publicCard, publicQuestion, publicDrill } from '../content.js';
import { httpError } from '../errors.js';

export default function chapterRoutes({ repo, content, progress }) {
  const r = Router();
  r.use(requireUser);

  r.get('/', async (req, res) => {
    res.json({ chapters: await progress.chapterSummaries(req.user.id), tracks: Object.values(content.tracks) });
  });

  // Búsqueda de texto en teoría, tarjetas y snippets
  r.get('/search', (req, res) => {
    const term = String(req.query.q ?? '').trim().toLowerCase();
    if (term.length < 2) return res.json({ results: [] });
    const results = [];
    const snip = (text, i) => text.slice(Math.max(0, i - 60), i + 120);
    for (const ch of content.chapters) {
      for (const s of ch.sections) {
        const text = s.title + '\n' + s.body;
        const i = text.toLowerCase().indexOf(term);
        if (i >= 0) results.push({ type: 'section', chapterId: ch.id, chapterTitle: ch.title, sectionId: s.id, title: s.title, snippet: snip(text, i) });
      }
      for (const c of ch.cards) {
        if ((c.front + '\n' + c.back).toLowerCase().includes(term))
          results.push({ type: 'card', chapterId: ch.id, chapterTitle: ch.title, title: c.front, snippet: c.back.slice(0, 160) });
      }
      for (const s of ch.snippets) {
        const text = `${s.title}\n${s.note ?? ''}\n${s.code}`;
        const i = text.toLowerCase().indexOf(term);
        if (i >= 0) results.push({ type: 'snippet', chapterId: ch.id, chapterTitle: ch.title, title: s.title, snippet: snip(text, i) });
      }
      for (const k of ch.shortcuts) {
        if (`${k.keys} ${k.action} ${k.tool}`.toLowerCase().includes(term))
          results.push({ type: 'shortcut', chapterId: ch.id, chapterTitle: ch.title, title: `${k.tool}: ${k.keys}`, snippet: k.action });
      }
    }
    res.json({ results: results.slice(0, 50) });
  });

  r.get('/:id', async (req, res) => {
    const ch = content.chapterById.get(req.params.id);
    if (!ch) throw httpError(404, 'Capítulo no encontrado');
    const [read, summaries] = await Promise.all([
      repo.sectionsRead(req.user.id, ch.id),
      progress.chapterSummaries(req.user.id),
    ]);
    const idx = content.chapters.indexOf(ch);
    res.json({
      chapter: {
        ...summaries.find((c) => c.id === ch.id),
        objectives: ch.objectives ?? [],
        sections: ch.sections,
        cards: ch.cards.map((c) => publicCard(`${ch.id}.${c.id}`, c, ch.id)),
        questions: ch.questions.map((q) => publicQuestion(`${ch.id}.${q.id}`, q, ch.id)),
        drills: ch.drills.map((d) => publicDrill(`${ch.id}.${d.id}`, d, ch.id)),
        snippets: ch.snippets,
        shortcuts: ch.shortcuts,
        readSections: read.map((x) => x.sectionId),
        prev: content.chapters[idx - 1]?.id ?? null,
        next: content.chapters[idx + 1]?.id ?? null,
      },
    });
  });

  r.post('/:id/sections/:sid/read', async (req, res) => {
    const ch = content.chapterById.get(req.params.id);
    if (!ch || !ch.sections.some((s) => s.id === req.params.sid)) throw httpError(404, 'Sección no encontrada');
    const read = req.body?.read !== false;
    await repo.setSectionRead(req.user.id, ch.id, req.params.sid, read);
    res.json({ ok: true, read });
  });

  return r;
}
