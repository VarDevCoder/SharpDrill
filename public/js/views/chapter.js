import { api } from '../api.js';
import { esc, markdown } from '../markdown.js';
import { progressBar, loading, toast, $ } from '../ui.js';
import { runSession } from '../session.js';

const TABS = [
  { id: 'teoria', label: 'Teoría' },
  { id: 'tarjetas', label: 'Flashcards' },
  { id: 'practica', label: 'Práctica' },
];

export async function chapterView(main, { id, tab = 'teoria' }) {
  main.innerHTML = loading();
  const { chapter: ch } = await api.chapter(id);
  const read = new Set(ch.readSections);
  let cleanup = () => {};

  main.innerHTML = `
    <nav class="crumbs small"><a href="#/capitulos">Temario</a> / Capítulo ${ch.number}</nav>
    <header class="page-head chapter-head">
      <div>
        <span class="eyebrow">Capítulo ${ch.number} · ${esc(ch.level)}</span>
        <h1>${esc(ch.title)}</h1>
        <p class="muted">${esc(ch.summary)}</p>
        <div class="head-progress">${progressBar(ch.mastery, 'Dominio')}<span class="small muted">${ch.mastery}% dominio · ${ch.seen}/${ch.total} vistos</span></div>
      </div>
    </header>
    <div class="tabs" role="tablist">${TABS.map((t) => `<a role="tab" class="tab ${t.id === tab ? 'active' : ''}" aria-selected="${t.id === tab}"
      href="#/capitulo/${ch.id}/${t.id}">${t.label}${t.id === 'tarjetas' ? ` <span class="count">${ch.cards.length}</span>` : t.id === 'practica' ? ` <span class="count">${ch.questions.length}</span>` : ''}</a>`).join('')}</div>
    <div id="tab-body"></div>`;
  const body = $('#tab-body', main);

  if (tab === 'teoria') {
    body.innerHTML = `
      ${ch.objectives.length ? `<div class="card objectives"><h2>Objetivos</h2><ul>${ch.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
      <div class="toc card"><h2>Contenido</h2><ol>${ch.sections.map((s) =>
        `<li><a href="#/capitulo/${ch.id}/teoria" data-jump="${s.id}">${esc(s.title)}</a> <span class="check ${read.has(s.id) ? 'on' : ''}" data-check="${s.id}" aria-hidden="true">✓</span></li>`).join('')}</ol></div>
      ${ch.sections.map((s, i) => `
        <section class="card lesson" id="sec-${s.id}">
          <h2><span class="muted">${ch.number}.${i + 1}</span> ${esc(s.title)}</h2>
          <div class="prose">${markdown(s.body)}</div>
          <div class="lesson-foot">
            <label class="toggle"><input type="checkbox" data-read="${s.id}" ${read.has(s.id) ? 'checked' : ''}> Marcar como leída</label>
          </div>
        </section>`).join('')}
      <div class="card cta">
        <div><h2>Ahora, recuerda sin mirar</h2><p class="muted">Leer no es aprender: el recuerdo activo consolida la memoria. Repasa las tarjetas y responde las preguntas.</p></div>
        <div class="row"><a class="btn" href="#/capitulo/${ch.id}/tarjetas">Flashcards</a><a class="btn ghost" href="#/capitulo/${ch.id}/practica">Práctica</a></div>
      </div>
      <nav class="pager">
        ${ch.prev ? `<a class="btn ghost" href="#/capitulo/${ch.prev}">← Capítulo anterior</a>` : '<span></span>'}
        ${ch.next ? `<a class="btn ghost" href="#/capitulo/${ch.next}">Capítulo siguiente →</a>` : ''}
      </nav>`;

    body.addEventListener('change', async (e) => {
      const sid = e.target.dataset.read;
      if (!sid) return;
      try {
        await api.markRead(ch.id, sid, e.target.checked);
        body.querySelector(`[data-check="${sid}"]`)?.classList.toggle('on', e.target.checked);
        if (e.target.checked) toast('Sección marcada como leída', 'ok', 1200);
      } catch (err) { toast(err.message, 'error'); e.target.checked = !e.target.checked; }
    });
    body.addEventListener('click', (e) => {
      const j = e.target.closest('[data-jump]');
      if (!j) return;
      e.preventDefault();
      document.getElementById(`sec-${j.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  } else if (tab === 'tarjetas') {
    const items = ch.cards.map((c) => ({ ...c, chapterTitle: null }));
    const start = () => (cleanup = runSession(body, {
      items: shuffle(items), mode: 'study', title: 'Flashcards del capítulo',
      onExit: () => (location.hash = `#/capitulo/${ch.id}`), onRestart: start,
    }));
    start();
  } else {
    const start = () => (cleanup = runSession(body, {
      items: shuffle(ch.questions), mode: 'practice', title: 'Práctica del capítulo',
      onExit: () => (location.hash = `#/capitulo/${ch.id}`), onRestart: start,
    }));
    start();
  }
  return () => cleanup();
}

export function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
