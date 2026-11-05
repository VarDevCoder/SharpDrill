import { api } from '../api.js';
import { esc, markdown, codeBlock, inline } from '../markdown.js';
import { loading, chapterCheckboxes, $, toast } from '../ui.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

export async function examView(main) {
  const [{ chapters }, { exams }] = await Promise.all([api.chapters(), api.exams()]);
  let timer = null;
  const stop = () => { if (timer) clearInterval(timer); timer = null; };

  function setup() {
    stop();
    main.innerHTML = `
      <header class="page-head"><div><h1>Modo examen</h1>
      <p class="muted">Simula una entrevista técnica: tiempo limitado, sin feedback hasta entregar. Los resultados también alimentan tu repaso espaciado.</p></div></header>
      <form class="card" id="setup">
        <h2>Configura tu examen</h2>
        ${chapterCheckboxes(chapters)}
        <div class="row">
          <label>Preguntas <select name="count">${[10, 20, 30, 40].map((n) => `<option ${n === 20 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Minutos <select name="minutes">${[5, 10, 20, 30, 45].map((n) => `<option ${n === 20 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <button class="btn" type="submit">Comenzar examen</button>
        </div>
      </form>
      <section class="card">
        <h2>Historial</h2>
        ${exams.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Capítulos</th><th>Resultado</th></tr></thead><tbody>
          ${exams.map((x) => `<tr><td>${new Date(x.finishedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</td><td>${x.chapters.length === chapters.length ? 'Todos' : x.chapters.map((c) => c.replace('ch', '')).join(', ')}</td>
          <td><strong>${x.score}/${x.total}</strong> (${Math.round((x.score / x.total) * 100)}%)</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Todavía no has hecho ningún examen.</p>'}
      </section>`;
    $('#setup', main).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      main.innerHTML = loading();
      try {
        const { exam } = await api.startExam(f.getAll('chapter'), Number(f.get('count')), Number(f.get('minutes')));
        run(exam);
      } catch (err) { toast(err.message, 'error'); setup(); }
    });
  }

  function questionHtml(q, i) {
    let input;
    if (q.type === 'mcq') input = q.options.map((o, k) => `<label class="option radio"><input type="radio" name="${esc(q.id)}" value="${k}">
      <kbd>${LETTERS[k]}</kbd><span>${inline(o)}</span></label>`).join('');
    else if (q.type === 'tf') input = ['true', 'false'].map((v) => `<label class="option radio"><input type="radio" name="${esc(q.id)}" value="${v}">
      <span>${v === 'true' ? 'Verdadero' : 'Falso'}</span></label>`).join('');
    else input = `<input class="fill-input" name="${esc(q.id)}" autocomplete="off" spellcheck="false" placeholder="Tu respuesta">`;
    return `<article class="card item exam-q" id="q-${i}"><div class="tags"><span class="tag">Pregunta ${i + 1}</span>${q.tag ? `<span class="tag tag-q">${esc(q.tag)}</span>` : ''}</div>
      <div class="prompt">${markdown(q.prompt)}</div>${q.code ? codeBlock(q.code) : ''}<div class="options">${input}</div></article>`;
  }

  function run(exam) {
    const deadline = Date.parse(exam.startedAt) + exam.timeLimit * 1000;
    main.innerHTML = `
      <div class="exam-bar card"><strong>Examen</strong><span id="answered">0 / ${exam.total} respondidas</span>
        <span class="timer" id="timer">${fmt(exam.timeLimit)}</span>
        <button class="btn small" id="submit" type="button">Entregar</button></div>
      <form id="exam">${exam.items.map(questionHtml).join('')}
        <div class="row center"><button class="btn" type="submit">Entregar examen</button></div></form>`;
    const form = $('#exam', main);
    const collect = () => {
      const answers = {};
      for (const q of exam.items) {
        const v = new FormData(form).get(q.id);
        if (v === null || v === '') continue;
        answers[q.id] = q.type === 'mcq' ? Number(v) : q.type === 'tf' ? v === 'true' : String(v);
      }
      return answers;
    };
    form.addEventListener('input', () => { $('#answered', main).textContent = `${Object.keys(collect()).length} / ${exam.total} respondidas`; });
    let sent = false;
    const submit = async () => {
      if (sent) return;
      const answers = collect();
      const missing = exam.total - Object.keys(answers).length;
      if (missing && Date.now() < deadline && !confirm(`Te faltan ${missing} preguntas. ¿Entregar igualmente?`)) return;
      sent = true;
      stop();
      main.innerHTML = loading();
      try { results((await api.submitExam(exam.id, answers)).result); } catch (err) { toast(err.message, 'error'); setup(); }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    $('#submit', main).addEventListener('click', submit);
    timer = setInterval(() => {
      const left = Math.round((deadline - Date.now()) / 1000);
      const el = $('#timer', main);
      if (el) { el.textContent = fmt(Math.max(0, left)); el.classList.toggle('urgent', left < 60); }
      if (left <= 0) { toast('¡Tiempo! Entregando examen…', 'warn'); submit(); }
    }, 500);
  }

  function results(r) {
    const pctScore = Math.round((r.score / r.total) * 100);
    const show = (q, v) => {
      if (v === null || v === undefined) return '<em>Sin responder</em>';
      if (q.type === 'mcq') return `${LETTERS[v]}. ${inline(q.options[v])}`;
      if (q.type === 'tf') return v ? 'Verdadero' : 'Falso';
      return `<code>${esc(v)}</code>`;
    };
    main.innerHTML = `
      <div class="card summary wide">
        <h2>Resultado del examen</h2>
        <div class="stats-row">
          <div class="stat"><span class="stat-n">${r.score}/${r.total}</span><span class="stat-l">aciertos</span></div>
          <div class="stat"><span class="stat-n">${pctScore}%</span><span class="stat-l">${pctScore >= 80 ? 'nivel senior 💪' : pctScore >= 60 ? 'aprobado' : 'a reforzar'}</span></div>
          <div class="stat"><span class="stat-n">${Math.ceil(r.elapsed / 60)}</span><span class="stat-l">min</span></div>
        </div>
        ${r.late ? '<p class="center warn">Entregado fuera de tiempo: las respuestas no puntúan.</p>' : ''}
        <div class="row center"><button class="btn" id="again" type="button">Nuevo examen</button><a class="btn ghost" href="#/repaso?modo=mistakes">Repasar fallos</a></div>
      </div>
      ${r.results.map((q, i) => `<article class="card item ${q.correct ? 'res-ok' : 'res-ko'}">
        <div class="tags"><span class="tag">Pregunta ${i + 1}</span><span class="tag ${q.correct ? 'tag-ok' : 'tag-ko'}">${q.correct ? '✓ Correcta' : '✗ Incorrecta'}</span></div>
        <div class="prompt">${markdown(q.prompt)}</div>${q.code ? codeBlock(q.code) : ''}
        <p><strong>Tu respuesta:</strong> ${show(q, q.answer)}</p>
        ${q.correct ? '' : `<p><strong>Correcta:</strong> ${show(q, Array.isArray(q.expected) ? q.expected[0] : q.expected)}</p>`}
        <div class="feedback ${q.correct ? 'ok' : 'ko'}">${markdown(q.explanation)}</div>
      </article>`).join('')}`;
    $('#again', main).addEventListener('click', async () => {
      const { exams: list } = await api.exams();
      exams.splice(0, exams.length, ...list);
      setup();
    });
  }

  setup();
  return stop;
}
