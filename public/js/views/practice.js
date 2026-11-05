import { api } from '../api.js';
import { loading, chapterCheckboxes, $, toast } from '../ui.js';
import { runSession } from '../session.js';

export async function practiceView(main) {
  const { chapters } = await api.chapters();
  let cleanup = () => {};

  function setup() {
    cleanup();
    main.innerHTML = `
      <header class="page-head"><div><h1>Práctica libre</h1>
      <p class="muted">Preguntas priorizadas por debilidad: primero lo que fallaste, luego lo no visto y lo que te cuesta.</p></div></header>
      <form class="card" id="setup">
        <h2>Capítulos</h2>
        <p class="muted small">Deja todos sin marcar para practicar todo el temario.</p>
        ${chapterCheckboxes(chapters)}
        <div class="row">
          <label>Preguntas <select name="count">${[5, 10, 15, 20, 30].map((n) => `<option ${n === 10 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <button class="btn" type="submit">Empezar práctica</button>
        </div>
      </form>`;
    $('#setup', main).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const sel = f.getAll('chapter');
      main.innerHTML = loading();
      try {
        const { items } = await api.practice({ chapter: sel.join(','), count: f.get('count') });
        cleanup = runSession(main, { items, mode: 'practice', title: 'Práctica', onExit: setup, onRestart: () => { setup(); } });
      } catch (err) { toast(err.message, 'error'); setup(); }
    });
  }
  setup();
  return () => cleanup();
}
