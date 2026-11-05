import { api } from '../api.js';
import { esc, inline } from '../markdown.js';
import { ring, progressBar, loading } from '../ui.js';

export function heatmap(activity) {
  const max = Math.max(1, ...activity.map((a) => a.count));
  const level = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  return `<div class="heatmap" role="img" aria-label="Actividad de las últimas 12 semanas">${activity.map((a) =>
    `<span class="hm l${level(a.count)}" title="${esc(a.day)}: ${a.count} repasos"></span>`).join('')}</div>
    <div class="hm-legend muted small">Menos ${[0, 1, 2, 3, 4].map((l) => `<span class="hm l${l}"></span>`).join('')} Más</div>`;
}

export async function dashboardView(main, _p, { user }) {
  main.innerHTML = loading();
  const s = await api.stats();
  const goalPct = Math.min(1, s.today / (s.dailyGoal || 1));
  const next = s.chapters.find((c) => c.sectionsRead < c.sections || c.mastery < 60) ?? s.chapters[0];
  const hour = new Date().getHours();
  const hi = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  main.innerHTML = `
    <header class="page-head">
      <div><h1>${hi}, ${esc(user.name.split(' ')[0])}</h1>
      <p class="muted">El repaso espaciado funciona mejor con sesiones cortas y diarias.</p></div>
    </header>

    <section class="grid-3">
      <div class="card hero-review">
        <div>
          <h2>Repaso de hoy</h2>
          <p class="big">${s.dueNow}</p>
          <p class="muted">${s.dueNow === 1 ? 'elemento pendiente' : 'elementos pendientes'}</p>
        </div>
        <div class="col">
          <a class="btn" href="#/repaso">${s.dueNow ? 'Empezar repaso' : 'Aprender nuevos'}</a>
          <a class="btn ghost small" href="#/repaso?modo=mistakes">Repasar fallos</a>
        </div>
      </div>
      <div class="card goal">
        <div class="ring-wrap">${ring(goalPct, 112, 'Meta diaria')}<div class="ring-label"><strong>${s.today}</strong><span>/ ${s.dailyGoal}</span></div></div>
        <div><h2>Meta diaria</h2><p class="muted">${s.today >= s.dailyGoal ? '¡Meta cumplida! 🎯' : `Te faltan ${s.dailyGoal - s.today} repasos`}</p></div>
      </div>
      <div class="card">
        <h2>Racha</h2>
        <p class="big">🔥 ${s.streak} <span class="muted">${s.streak === 1 ? 'día' : 'días'}</span></p>
        <p class="muted">Precisión global: <strong>${s.totals.accuracy}%</strong> en ${s.totals.attempts} intentos</p>
      </div>
    </section>

    ${next ? `<section class="card continue">
      <div><span class="eyebrow">Continuar</span><h2>Capítulo ${next.number}: ${esc(next.title)}</h2>
      <p class="muted">${esc(next.summary)}</p>${progressBar(next.mastery, 'Dominio')}<p class="small muted">${next.mastery}% dominio · ${next.sectionsRead}/${next.sections} secciones leídas</p></div>
      <div class="col"><a class="btn" href="#/capitulo/${next.id}">Abrir capítulo</a><a class="btn ghost small" href="#/repaso?cap=${next.id}">Repasar este capítulo</a></div>
    </section>` : ''}

    <section class="grid-2">
      <div class="card">
        <h2>Actividad</h2>
        ${heatmap(s.activity)}
      </div>
      <div class="card">
        <h2>Puntos débiles</h2>
        ${s.weak.length ? `<ul class="list">${s.weak.slice(0, 5).map((w) => `<li><a href="#/capitulo/${w.chapterId}">${inline(w.text)}</a>
          <span class="tag tag-ko">${w.lapses ? `${w.lapses} ${w.lapses === 1 ? 'olvido' : 'olvidos'}` : 'Fallada'}</span></li>`).join('')}</ul>
          <a class="btn ghost small" href="#/repaso?modo=mistakes">Repasar fallos</a>`
          : '<p class="muted">Aún no hay fallos registrados. Cuando falles algo aparecerá aquí para reforzarlo.</p>'}
      </div>
    </section>`;
}
