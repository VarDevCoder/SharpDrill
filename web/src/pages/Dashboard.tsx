import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useAsync } from '../hooks';
import { ErrorBox, Heatmap, Loading, ProgressBar, Ring } from '../components/ui';
import { Inline } from '../components/Markdown';
import { TRACK_ICON, plural } from '../lib/format';

export function DashboardPage() {
  const { user } = useAuth();
  const { data: s, error, loading, reload } = useAsync(() => api.stats(), []);
  if (loading && !s) return <Loading />;
  if (error || !s) return <ErrorBox error={error ?? new Error('Sin datos')} onRetry={reload} />;

  const goal = Math.min(1, s.today / (s.dailyGoal || 1));
  const next = s.chapters.find((c) => c.sectionsRead < c.sections || c.mastery < 60) ?? s.chapters[0];
  const h = new Date().getHours();
  const hi = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <>
      <header className="page-head">
        <h1>{hi}, {user?.name.split(' ')[0]}</h1>
        <p className="muted">Sesiones cortas y diarias: recuerda sin mirar y escribe código contra el reloj.</p>
      </header>

      <section className="grid-3">
        <div className="card hero-review">
          <div>
            <h2>Repaso de hoy</h2>
            <p className="big">{s.dueNow}</p>
            <p className="muted">{s.dueNow === 1 ? 'elemento pendiente' : 'elementos pendientes'}</p>
          </div>
          <div className="col">
            <Link className="btn" to="/repaso">{s.dueNow ? 'Empezar repaso' : 'Aprender nuevos'}</Link>
            <Link className="btn ghost small" to="/drills">Drill de código ⏱</Link>
          </div>
        </div>
        <div className="card goal">
          <div className="ring-wrap"><Ring value={goal} label="Meta diaria" /><div className="ring-label"><strong>{s.today}</strong><span>/ {s.dailyGoal}</span></div></div>
          <div><h2>Meta diaria</h2><p className="muted">{s.today >= s.dailyGoal ? '¡Meta cumplida! 🎯' : `Te faltan ${s.dailyGoal - s.today}`}</p></div>
        </div>
        <div className="card">
          <h2>Racha</h2>
          <p className="big">🔥 {s.streak} <span className="muted">{s.streak === 1 ? 'día' : 'días'}</span></p>
          <p className="muted">Precisión: <strong>{s.totals.accuracy}%</strong> en {plural(s.totals.attempts, 'intento', 'intentos')}</p>
        </div>
      </section>

      <section className="tracks">
        {s.tracks.map((t) => (
          <Link key={t.id} className={`card track track-${t.id}`} to={`/temario#${t.id}`}>
            <span className="track-icon" aria-hidden="true">{TRACK_ICON[t.id]}</span>
            <div><strong>{t.title}</strong><ProgressBar value={t.mastery} label={`Dominio ${t.title}`} />
              <span className="small muted">{t.mastery}% · {plural(t.chapters, 'capítulo', 'capítulos')}</span></div>
          </Link>
        ))}
      </section>

      {next && (
        <section className="card continue">
          <div>
            <span className="eyebrow">Continuar</span>
            <h2>Capítulo {next.number}: {next.title}</h2>
            <p className="muted">{next.summary}</p>
            <ProgressBar value={next.mastery} label="Dominio" />
            <p className="small muted">{next.mastery}% dominio · {next.sectionsRead}/{next.sections} secciones leídas</p>
          </div>
          <div className="col">
            <Link className="btn" to={`/capitulo/${next.id}`}>Abrir capítulo</Link>
            <Link className="btn ghost small" to={`/repaso?cap=${next.id}`}>Repasar este capítulo</Link>
          </div>
        </section>
      )}

      <section className="grid-2">
        <div className="card"><h2>Actividad</h2><Heatmap activity={s.activity} /></div>
        <div className="card">
          <h2>Puntos débiles</h2>
          {s.weak.length ? (
            <>
              <ul className="list">
                {s.weak.slice(0, 5).map((w) => (
                  <li key={w.id}><Link to={`/capitulo/${w.chapterId}`}><Inline text={w.text} /></Link>
                    <span className="tag tag-ko">{w.lapses ? plural(w.lapses, 'olvido', 'olvidos') : 'Fallada'}</span></li>
                ))}
              </ul>
              <Link className="btn ghost small" to="/repaso?modo=mistakes">Repasar fallos</Link>
            </>
          ) : <p className="muted">Aún no hay fallos registrados. Cuando falles algo aparecerá aquí para reforzarlo.</p>}
        </div>
      </section>
    </>
  );
}
