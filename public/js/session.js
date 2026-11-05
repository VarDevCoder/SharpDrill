// Motor de sesiones de repaso activo: flashcards con autoevaluación y preguntas corregidas en el servidor.
import { api } from './api.js';
import { esc, markdown, codeBlock, inline } from './markdown.js';
import { formatInterval, toast, progressBar } from './ui.js';

const GRADES = [
  { g: 0, label: 'Otra vez', hint: 'No lo recordé', cls: 'again' },
  { g: 1, label: 'Difícil', hint: 'Con mucho esfuerzo', cls: 'hard' },
  { g: 2, label: 'Bien', hint: 'Lo recordé', cls: 'good' },
  { g: 3, label: 'Fácil', hint: 'Sin dudar', cls: 'easy' },
];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Ejecuta una sesión sobre `items` dentro de `root`.
 * Devuelve una función de limpieza (quita los atajos de teclado).
 */
export function runSession(root, { items, mode = 'review', title = 'Repaso', onExit, onRestart }) {
  const state = { i: 0, phase: 'front', results: [], started: Date.now(), busy: false, selected: null };

  if (!items.length) {
    root.innerHTML = `<div class="empty card">
      <div class="empty-icon" aria-hidden="true">✓</div>
      <h2>¡Todo al día!</h2>
      <p>No hay elementos pendientes con estos filtros. Vuelve más tarde o practica capítulos nuevos.</p>
      <div class="row center"><a class="btn" href="#/capitulos">Ver temario</a><a class="btn ghost" href="#/practica">Práctica libre</a></div>
    </div>`;
    return () => {};
  }

  const current = () => items[state.i];

  function header() {
    const done = state.i;
    return `<div class="session-top">
      <div class="session-title"><strong>${esc(title)}</strong><span class="muted">${Math.min(done + 1, items.length)} / ${items.length}</span></div>
      ${progressBar((done / items.length) * 100, 'Progreso de la sesión')}
      <button class="btn ghost small" data-act="exit" type="button">Terminar</button>
    </div>`;
  }

  function meta(it) {
    const tags = [];
    if (it.chapterTitle) tags.push(`<span class="tag">${esc(it.chapterTitle)}</span>`);
    if (it.kind === 'card') tags.push(`<span class="tag tag-card">${it.custom ? 'Tarjeta propia' : 'Flashcard'}</span>`);
    else tags.push(`<span class="tag tag-q">${esc(it.tag ?? ({ mcq: 'Opción múltiple', tf: 'Verdadero / Falso', fill: 'Completar' })[it.type])}</span>`);
    if (it.isNew) tags.push('<span class="tag tag-new">Nuevo</span>');
    return `<div class="tags">${tags.join('')}</div>`;
  }

  function renderCard(it) {
    const back = state.phase === 'back';
    return `<article class="item flash ${back ? 'flipped' : ''}">
      ${meta(it)}
      <div class="prompt">${markdown(it.front)}</div>
      ${back ? `<hr><div class="answer">${markdown(it.back)}</div>${it.code ? codeBlock(it.code) : ''}` : ''}
      <div class="actions">
        ${back
          ? `<p class="muted small center">¿Qué tan bien lo recordaste?</p><div class="grades">${GRADES.map((x, k) => `
              <button class="grade ${x.cls}" data-grade="${x.g}" type="button"><kbd>${k + 1}</kbd><strong>${x.label}</strong><small>${x.hint}</small></button>`).join('')}</div>`
          : `<p class="muted small center">Intenta recordar la respuesta antes de mirar (recuerdo activo).</p>
             <button class="btn wide" data-act="flip" type="button">Mostrar respuesta <kbd>Espacio</kbd></button>`}
      </div>
    </article>`;
  }

  function renderQuestion(it) {
    const r = state.phase === 'answered' ? state.last : null;
    let body = '';
    if (it.type === 'mcq') {
      body = `<div class="options">${it.options.map((o, k) => {
        let cls = '';
        if (r) { if (k === r.expected) cls = 'correct'; else if (k === state.selected) cls = 'wrong'; }
        return `<button class="option ${cls}" data-opt="${k}" type="button" ${r ? 'disabled' : ''}>
          <kbd>${LETTERS[k]}</kbd><span>${/[;{}()=]|=>/.test(o) && o.length > 20 ? `<code>${esc(o)}</code>` : inline(o)}</span></button>`;
      }).join('')}</div>`;
    } else if (it.type === 'tf') {
      body = `<div class="options tf">${[true, false].map((v, k) => {
        let cls = '';
        if (r) { if (v === r.expected) cls = 'correct'; else if (v === state.selected) cls = 'wrong'; }
        return `<button class="option ${cls}" data-tf="${v}" type="button" ${r ? 'disabled' : ''}><kbd>${v ? 'V' : 'F'}</kbd><span>${v ? 'Verdadero' : 'Falso'}</span></button>`;
      }).join('')}</div>`;
    } else {
      body = `<form class="fill" data-fill>
        <input name="answer" autocomplete="off" spellcheck="false" placeholder="Escribe tu respuesta…" ${r ? 'disabled' : ''}
          value="${esc(state.selected ?? '')}" class="${r ? (r.correct ? 'correct' : 'wrong') : ''}" aria-label="Respuesta">
        ${r ? '' : '<button class="btn" type="submit">Comprobar <kbd>Enter</kbd></button>'}
      </form>
      ${r && !r.correct ? `<p class="expected">Respuesta esperada: <code>${esc([].concat(r.expected)[0])}</code></p>` : ''}`;
    }

    const feedback = r ? `<div class="feedback ${r.correct ? 'ok' : 'ko'}" role="status">
        <strong>${r.correct ? '✓ ¡Correcto!' : '✗ Incorrecto'}</strong>
        <div>${markdown(r.explanation)}</div>
        <p class="muted small">Próximo repaso en ${formatInterval(r.next.interval)}</p>
      </div>
      <button class="btn wide" data-act="next" type="button">${state.i + 1 < items.length ? 'Siguiente' : 'Ver resultados'} <kbd>Enter</kbd></button>` : '';

    return `<article class="item">
      ${meta(it)}
      <div class="prompt">${markdown(it.prompt)}</div>
      ${it.code ? codeBlock(it.code) : ''}
      ${body}
      ${feedback}
    </article>`;
  }

  function renderSummary() {
    const total = state.results.length;
    const ok = state.results.filter((x) => x.correct).length;
    const failed = state.results.filter((x) => !x.correct).map((x) => x.item);
    const mins = Math.max(1, Math.round((Date.now() - state.started) / 60000));
    root.innerHTML = `<div class="card summary">
      <h2>Sesión completada</h2>
      <div class="stats-row">
        <div class="stat"><span class="stat-n">${total}</span><span class="stat-l">elementos</span></div>
        <div class="stat"><span class="stat-n">${total ? Math.round((ok / total) * 100) : 0}%</span><span class="stat-l">recordados</span></div>
        <div class="stat"><span class="stat-n">${mins}</span><span class="stat-l">min</span></div>
      </div>
      ${failed.length ? `<h3>Para reforzar</h3><ul class="list">${failed.map((f) =>
        `<li>${inline(f.kind === 'card' ? f.front : f.prompt)}</li>`).join('')}</ul>` : '<p class="center">Sin fallos. ¡Excelente!</p>'}
      <div class="row center">
        ${failed.length ? '<button class="btn" data-act="retry" type="button">Repasar fallos ahora</button>' : ''}
        ${onRestart ? '<button class="btn ghost" data-act="restart" type="button">Otra sesión</button>' : ''}
        <a class="btn ghost" href="#/">Ir al inicio</a>
      </div>
    </div>`;
    state.failed = failed;
    state.phase = 'summary';
  }

  function render() {
    if (state.i >= items.length) return renderSummary();
    const it = current();
    root.innerHTML = header() + (it.kind === 'card' ? renderCard(it) : renderQuestion(it));
    if (it.kind === 'question' && it.type === 'fill' && state.phase !== 'answered') root.querySelector('input[name=answer]')?.focus();
  }

  async function gradeCard(g) {
    if (state.busy) return;
    state.busy = true;
    const it = current();
    try {
      const { next } = await api.gradeCard(it.id, g, mode);
      state.results.push({ item: it, correct: g > 0 });
      toast(`Próximo repaso en ${formatInterval(next.interval)}`, g === 0 ? 'warn' : 'ok', 1400);
      state.i++;
      state.phase = 'front';
      render();
    } catch (e) { toast(e.message, 'error'); } finally { state.busy = false; }
  }

  async function answer(value) {
    if (state.busy || state.phase === 'answered') return;
    state.busy = true;
    state.selected = value;
    const it = current();
    try {
      state.last = await api.answer(it.id, value, mode);
      state.results.push({ item: it, correct: state.last.correct });
      state.phase = 'answered';
      render();
    } catch (e) { toast(e.message, 'error'); } finally { state.busy = false; }
  }

  function next() {
    state.i++;
    state.phase = 'front';
    state.selected = null;
    render();
  }

  function onClick(e) {
    const t = e.target.closest('button, [data-act]');
    if (!t || !root.contains(t)) return;
    const act = t.dataset.act;
    if (act === 'flip') { state.phase = 'back'; render(); }
    else if (act === 'next') next();
    else if (act === 'exit') { if (state.results.length) { state.i = items.length; render(); } else onExit?.(); }
    else if (act === 'retry') { cleanup(); active = runSession(root, { items: state.failed, mode, title: 'Repaso de fallos', onExit, onRestart }); }
    else if (act === 'restart') { cleanup(); Promise.resolve(onRestart?.()).then((c) => { if (typeof c === 'function') active = c; }); }
    else if (t.dataset.grade !== undefined) gradeCard(Number(t.dataset.grade));
    else if (t.dataset.opt !== undefined) answer(Number(t.dataset.opt));
    else if (t.dataset.tf !== undefined) answer(t.dataset.tf === 'true');
  }

  function onSubmit(e) {
    if (!e.target.matches('[data-fill]')) return;
    e.preventDefault();
    const v = e.target.answer.value.trim();
    if (v) answer(v);
  }

  function onKey(e) {
    if (state.phase === 'summary' || e.ctrlKey || e.metaKey || e.altKey) return;
    const it = current();
    const typing = e.target.matches('input, textarea');
    if (it.kind === 'card') {
      if (state.phase === 'front' && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); state.phase = 'back'; render(); }
      else if (state.phase === 'back' && ['1', '2', '3', '4'].includes(e.key)) gradeCard(Number(e.key) - 1);
      return;
    }
    if (state.phase === 'answered') {
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); next(); }
      return;
    }
    if (typing) return;
    if (it.type === 'mcq') {
      const k = LETTERS.indexOf(e.key.toUpperCase());
      const n = Number(e.key) - 1;
      const idx = k >= 0 ? k : n;
      if (idx >= 0 && idx < it.options.length) answer(idx);
    } else if (it.type === 'tf') {
      if (e.key.toLowerCase() === 'v' || e.key === '1') answer(true);
      if (e.key.toLowerCase() === 'f' || e.key === '2') answer(false);
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey);
  function cleanup() {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    document.removeEventListener('keydown', onKey);
  }
  let active = cleanup;
  render();
  return () => active();
}
