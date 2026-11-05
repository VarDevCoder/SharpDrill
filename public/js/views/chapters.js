import { api } from '../api.js';
import { esc } from '../markdown.js';
import { progressBar, loading } from '../ui.js';

export async function chaptersView(main) {
  main.innerHTML = loading();
  const { chapters } = await api.chapters();
  main.innerHTML = `
    <header class="page-head"><div><h1>Temario</h1>
    <p class="muted">${chapters.length} capítulos de C# avanzado. Lee la teoría, repasa las tarjetas y ponte a prueba.</p></div></header>
    <div class="chapter-grid">${chapters.map((c) => `
      <a class="card chapter-card" href="#/capitulo/${c.id}">
        <div class="chapter-num">${String(c.number).padStart(2, '0')}</div>
        <div class="chapter-body">
          <h2>${esc(c.title)}</h2>
          <p class="muted">${esc(c.summary)}</p>
          ${progressBar(c.mastery, 'Dominio del capítulo')}
          <div class="chapter-meta small muted">
            <span>${c.mastery}% dominio</span>
            <span>📖 ${c.sectionsRead}/${c.sections}</span>
            <span>🃏 ${c.cards}</span>
            <span>❓ ${c.questions}</span>
            ${c.due ? `<span class="tag tag-due">${c.due} pendientes</span>` : ''}
          </div>
        </div>
      </a>`).join('')}</div>`;
}
