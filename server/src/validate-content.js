import { loadContent } from './content.js';

try {
  const { chapters, items } = loadContent();
  for (const ch of chapters) {
    console.log(`✔ ${String(ch.number).padStart(2, '0')} ${ch.title} — ${ch.sections.length} secciones, ${ch.cards.length} tarjetas, ${ch.questions.length} preguntas`);
  }
  console.log(`\nTotal: ${chapters.length} capítulos, ${items.size} elementos`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
