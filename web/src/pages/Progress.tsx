import { Icon, TRACK_ICON } from '../components/Icon';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, Heatmap, Loading, ProgressBar } from '../components/ui';
import { Inline } from '../components/Markdown';

const MODE_LABEL: Record<string, string> = { review: 'Repaso', study: 'Estudio', practice: 'Práctica', exam: 'Examen', drill: 'Drills de código' };

export function ProgressPage() {
  const { data: s, error, loading, reload } = useAsync(() => api.stats(), []);
  if (loading && !s) return <Loading />;
  if (error || !s) return <ErrorBox error={error ?? new Error('Sin datos')} onRetry={reload} />;
  const maxF = Math.max(1, ...s.forecast.map((f) => f.count));
  const seen = s.chapters.reduce((a, c) => a + c.seen, 0);
  const total = s.chapters.reduce((a, c) => a + c.total, 0);
  const overall = Math.round(s.chapters.reduce((a, c) => a + c.mastery, 0) / (s.chapters.length || 1));

  return (
    <>
      <header className="page-head"><h1>Progreso</h1><p className="muted">Tu memoria, medida.</p></header>
      <section className="stats-row cards-row">
        <div className="card stat"><span className="stat-n">{overall}%</span><span className="stat-l">dominio del curso</span></div>
        <div className="card stat"><span className="stat-n">{seen}/{total}</span><span className="stat-l">elementos vistos</span></div>
        <div className="card stat"><span className="stat-n">{s.totals.accuracy}%</span><span className="stat-l">precisión</span></div>
        <div className="card stat"><span className="stat-n"><Icon name="activity" className="metric-icon" /> {s.streak}</span><span className="stat-l">racha (días)</span></div>
      </section>
      <section className="tracks">
        {s.tracks.map((t) => (
          <div key={t.id} className={`card track track-${t.id}`}>
            <span className="track-icon" aria-hidden="true"><Icon name={TRACK_ICON[t.id] ?? 'book'} /></span>
            <div><strong>{t.title}</strong><ProgressBar value={t.mastery} label={t.title} /><span className="small muted">{t.mastery}%</span></div>
          </div>
        ))}
      </section>
      <section className="grid-2">
        <div className="card"><h2>Actividad (12 semanas)</h2><Heatmap activity={s.activity} /></div>
        <div className="card">
          <h2>Próximos 7 días</h2>
          <div className="forecast" role="img" aria-label="Repasos previstos para los próximos 7 días">
            {s.forecast.map((f) => (
              <div className="fc" key={f.day}>
                <span className="fc-n">{f.count}</span>
                <span className="fc-bar" style={{ height: `${Math.round((f.count / maxF) * 100)}%` }} />
                <span className="fc-d">{new Date(f.day + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="card">
        <h2>Por capítulo</h2>
        <div className="table-wrap"><table className="chapters-table"><thead><tr><th>Capítulo</th><th>Dominio</th><th>Vistos</th><th>Precisión</th><th>Pendientes</th></tr></thead><tbody>
          {s.chapters.map((c) => (
            <tr key={c.id}>
              <td><Link to={`/capitulo/${c.id}`}>{c.number}. {c.title}</Link></td>
              <td className="w-bar"><ProgressBar value={c.mastery} label="Dominio" /><span className="small muted">{c.mastery}%</span></td>
              <td>{c.seen}/{c.total}</td>
              <td>{c.accuracy === null ? '—' : `${c.accuracy}%`}</td>
              <td>{c.due ? <Link className="tag tag-due" to={`/repaso?cap=${c.id}`}>{c.due}</Link> : '—'}</td>
            </tr>
          ))}
        </tbody></table></div>
      </section>
      <section className="grid-2">
        <div className="card"><h2>Por modo</h2>
          {s.byMode.length ? <ul className="list">{s.byMode.map((m) => <li key={m.mode}><span>{MODE_LABEL[m.mode] ?? m.mode}</span><span>{m.count} intentos · <strong>{m.accuracy}%</strong></span></li>)}</ul>
            : <p className="muted">Sin datos todavía.</p>}
        </div>
        <div className="card"><h2>Puntos débiles</h2>
          {s.weak.length ? <ul className="list">{s.weak.map((w) => <li key={w.id}><Link to={`/capitulo/${w.chapterId}`}><Inline text={w.text} /></Link>
            <span className="tag tag-ko">{w.lapses ? `${w.lapses}×` : 'Fallada'}</span></li>)}</ul> : <p className="muted">Nada que reforzar aún.</p>}
        </div>
      </section>
    </>
  );
}
