import { loadContent } from './content.js';

try {
  const { chapters, items, tracks } = loadContent();
  let tot = { s: 0, c: 0, q: 0, d: 0, n: 0, k: 0 };
  for (const t of Object.values(tracks)) {
    console.log(`\n▸ ${t.title}`);
    for (const ch of chapters.filter((c) => c.track === t.id)) {
      console.log(`  ✔ ${String(ch.number).padStart(2, '0')} ${ch.title} — ${ch.sections.length} secc · ${ch.cards.length} tarj · ` +
        `${ch.questions.length} preg · ${ch.drills.length} drills · ${ch.snippets.length} snippets · ${ch.shortcuts.length} atajos`);
      tot = { s: tot.s + ch.sections.length, c: tot.c + ch.cards.length, q: tot.q + ch.questions.length,
        d: tot.d + ch.drills.length, n: tot.n + ch.snippets.length, k: tot.k + ch.shortcuts.length };
    }
  }
  console.log(`\nTotal: ${chapters.length} capítulos · ${tot.s} secciones · ${tot.c} tarjetas · ${tot.q} preguntas · ` +
    `${tot.d} drills · ${tot.n} snippets · ${tot.k} atajos · ${items.size} elementos repasables`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
