import { api } from '../api.js';
import { esc } from '../markdown.js';
import { loading, $, $$ } from '../ui.js';
import { runSession } from '../session.js';

const MODES = [
  { id: 'mixed', label: 'Mixto' },
  { id: 'cards', label: 'Solo flashcards' },
  { id: 'questions', label: 'Solo preguntas' },
  { id: 'mistakes', label: 'Mis fallos' },
];

export async function reviewView(main, _p, { query }) {
  const { chapters } = await api.chapters();
  const mode = MODES.some((m) => m.id === query.get('modo')) ? query.get('modo') : 'mixed';
  const cap = query.get('cap') ?? '';
  const limit = query.get('n') ?? '20';
  let cleanup = () => {};

  main.innerHTML = `
    <header class="page-head"><div><h1>Repaso activo</h1>
    <p class="muted">Primero lo que toca repasar hoy según la repetición espaciada (SM-2); después, elementos nuevos.</p></div></header>
    <form class="card filters" id="filters">
      <label>Modo <select name="modo">${MODES.map((m) => `<option value="${m.id}" ${m.id === mode ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
      <label>Capítulo <select name="cap"><option value="">Todos</option>${chapters.map((c) =>
        `<option value="${c.id}" ${c.id === cap ? 'selected' : ''}>${c.number}. ${esc(c.title)}</option>`).join('')}</select></label>
      <label>Tamaño <select name="n">${[10, 20, 30, 50].map((n) => `<option ${String(n) === limit ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <span class="muted small" id="counts"></span>
    </form>
    <div id="session"></div>`;

  const form = $('#filters', main);
  const host = $('#session', main);

  async function start() {
    cleanup();
    host.innerHTML = loading();
    const f = new FormData(form);
    const n = Number(f.get('n'));
    const { items, counts } = await api.queue({ mode: f.get('modo'), chapter: f.get('cap'), limit: n, newLimit: Math.ceil(n / 2) });
    $('#counts', main).textContent = f.get('modo') === 'mistakes'
      ? `${counts.due} fallos registrados`
      : `${counts.due} pendientes · ${counts.new} nuevos disponibles`;
    cleanup = runSession(host, { items, mode: 'review', title: 'Repaso', onExit: () => (location.hash = '#/'), onRestart: start });
    return cleanup;
  }
  $$('select', form).forEach((s) => s.addEventListener('change', start));
  await start();
  return () => cleanup();
}
