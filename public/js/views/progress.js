import { api } from '../api.js';
import { esc, inline } from '../markdown.js';
import { progressBar, loading } from '../ui.js';
import { heatmap } from './dashboard.js';

const MODE_LABEL = { review: 'Repaso', study: 'Estudio', practice: 'Práctica', exam: 'Examen' };

export async function progressView(main) {
  main.innerHTML = loading();
  const s = await api.stats();
  const maxF = Math.max(1, ...s.forecast.map((f) => f.count));
  const seen = s.chapters.reduce((a, c) => a + c.seen, 0);
  const total = s.chapters.reduce((a, c) => a + c.total, 0);
  const overall = Math.round(s.chapters.reduce((a, c) => a + c.mastery, 0) / (s.chapters.length || 1));

  main.innerHTML = `
    <header class="page-head"><div><h1>Progreso</h1><p class="muted">Tu memoria, medida.</p></div></header>
    <section class="stats-row cards-row">
      <div class="card stat"><span class="stat-n">${overall}%</span><span class="stat-l">dominio del curso</span></div>
      <div class="card stat"><span class="stat-n">${seen}/${total}</span><span class="stat-l">elementos vistos</span></div>
      <div class="card stat"><span class="stat-n">${s.totals.accuracy}%</span><span class="stat-l">precisión</span></div>
      <div class="card stat"><span class="stat-n">🔥 ${s.streak}</span><span class="stat-l">racha (días)</span></div>
    </section>
    <section class="grid-2">
      <div class="card"><h2>Actividad (12 semanas)</h2>${heatmap(s.activity)}</div>
      <div class="card"><h2>Próximos 7 días</h2>
        <div class="forecast" role="img" aria-label="Repasos previstos para los próximos 7 días">${s.forecast.map((f) => `
          <div class="fc"><span class="fc-n">${f.count}</span><span class="fc-bar" style="height:${Math.round((f.count / maxF) * 100)}%"></span>
          <span class="fc-d">${new Date(f.day + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })}</span></div>`).join('')}
        </div>
      </div>
    </section>
    <section class="card">
      <h2>Por capítulo</h2>
      <div class="table-wrap"><table class="chapters-table"><thead><tr><th>Capítulo</th><th>Dominio</th><th>Vistos</th><th>Precisión</th><th>Pendientes</th></tr></thead><tbody>
      ${s.chapters.map((c) => `<tr>
        <td><a href="#/capitulo/${c.id}">${c.number}. ${esc(c.title)}</a></td>
        <td class="w-bar">${progressBar(c.mastery, 'Dominio')}<span class="small muted">${c.mastery}%</span></td>
        <td>${c.seen}/${c.total}</td>
        <td>${c.accuracy === null ? '—' : c.accuracy + '%'}</td>
        <td>${c.due ? `<a class="tag tag-due" href="#/repaso?cap=${c.id}">${c.due}</a>` : '—'}</td></tr>`).join('')}
      </tbody></table></div>
    </section>
    <section class="grid-2">
      <div class="card"><h2>Por modo</h2>${s.byMode.length ? `<ul class="list">${s.byMode.map((m) =>
        `<li><span>${MODE_LABEL[m.mode] ?? esc(m.mode)}</span><span>${m.count} intentos · <strong>${m.accuracy}%</strong></span></li>`).join('')}</ul>` : '<p class="muted">Sin datos todavía.</p>'}</div>
      <div class="card"><h2>Puntos débiles</h2>${s.weak.length ? `<ul class="list">${s.weak.map((w) =>
        `<li><a href="#/capitulo/${w.chapterId}">${inline(w.text)}</a><span class="tag tag-ko">${w.lapses ? `${w.lapses}×` : 'Fallada'}</span></li>`).join('')}</ul>` : '<p class="muted">Nada que reforzar aún.</p>'}</div>
    </section>`;
}
