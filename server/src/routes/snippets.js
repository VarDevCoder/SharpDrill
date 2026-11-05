import { Router } from 'express';
import { requireUser } from '../auth.js';

/** Chuleta global: snippets de código y atajos de teclado de todos los capítulos, filtrables. */
export default function snippetRoutes({ content }) {
  const r = Router();
  r.use(requireUser);

  r.get('/', (req, res) => {
    const track = req.query.track ? String(req.query.track) : null;
    const lang = req.query.lang ? String(req.query.lang) : null;
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const snippets = [];
    const shortcuts = [];
    for (const ch of content.chapters) {
      if (track && ch.track !== track) continue;
      const base = { chapterId: ch.id, chapterTitle: ch.title, track: ch.track };
      for (const s of ch.snippets) {
        if (lang && s.lang !== lang) continue;
        if (q && !`${s.title} ${s.note ?? ''} ${s.code}`.toLowerCase().includes(q)) continue;
        snippets.push({ ...base, id: `${ch.id}.${s.id}`, title: s.title, lang: s.lang, code: s.code, note: s.note ?? null });
      }
      for (const k of ch.shortcuts) {
        if (q && !`${k.keys} ${k.action} ${k.tool}`.toLowerCase().includes(q)) continue;
        shortcuts.push({ ...base, ...k });
      }
    }
    const langs = [...new Set(content.chapters.flatMap((c) => c.snippets.map((s) => s.lang)))].sort();
    const tools = [...new Set(content.chapters.flatMap((c) => c.shortcuts.map((s) => s.tool)))].sort();
    res.json({ snippets, shortcuts, langs, tools });
  });

  return r;
}
