import { api } from '../api.js';
import { esc } from '../markdown.js';
import { $ } from '../ui.js';

export async function searchView(main, _p, { query }) {
  const q = query.get('q') ?? '';
  main.innerHTML = `
    <header class="page-head"><div><h1>Buscar en el temario</h1></div></header>
    <form class="card search-form" id="sf"><input name="q" value="${esc(q)}" placeholder="Ej.: ConfigureAwait, LOH, captive…" autofocus aria-label="Buscar">
      <button class="btn" type="submit">Buscar</button></form>
    <div id="results"></div>`;
  $('#sf', main).addEventListener('submit', (e) => {
    e.preventDefault();
    location.hash = '#/buscar?q=' + encodeURIComponent(new FormData(e.target).get('q'));
  });
  if (q.trim().length < 2) return;
  const { results } = await api.search(q);
  const hl = (t) => esc(t).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);
  $('#results', main).innerHTML = results.length ? `<p class="muted">${results.length} resultados</p>` + results.map((r) => `
    <a class="card result" href="#/capitulo/${r.chapterId}/${r.type === 'card' ? 'tarjetas' : 'teoria'}">
      <div class="tags"><span class="tag">${esc(r.chapterTitle)}</span><span class="tag ${r.type === 'card' ? 'tag-card' : ''}">${r.type === 'card' ? 'Flashcard' : 'Teoría'}</span></div>
      <strong>${hl(r.title)}</strong><p class="muted small">${hl(r.snippet)}…</p></a>`).join('')
    : '<div class="empty"><p>Sin resultados.</p></div>';
}
