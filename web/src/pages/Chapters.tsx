import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, Loading, ProgressBar } from '../components/ui';
import { TRACK_ICON } from '../lib/format';

export function ChaptersPage() {
  const { data, error, loading, reload } = useAsync(() => api.chapters(), []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? new Error('Sin datos')} onRetry={reload} />;
  const tracks = [...data.tracks].sort((a, b) => a.order - b.order);

  return (
    <>
      <header className="page-head">
        <h1>Temario</h1>
        <p className="muted">{data.chapters.length} capítulos en {tracks.length} rutas. Lee, recuerda sin mirar, practica y escribe código contra el reloj.</p>
        <nav className="chips">{tracks.map((t) => <a key={t.id} className="chip" href={`#${t.id}`}>{TRACK_ICON[t.id]} {t.title}</a>)}</nav>
      </header>
      {tracks.map((t) => (
        <section key={t.id} id={t.id} className="track-section">
          <h2 className="track-title"><span className={`track-icon track-${t.id}`}>{TRACK_ICON[t.id]}</span> {t.title}</h2>
          <div className="chapter-grid">
            {data.chapters.filter((c) => c.track === t.id).map((c) => (
              <Link key={c.id} className="card chapter-card" to={`/capitulo/${c.id}`}>
                <div className="chapter-num">{String(c.number).padStart(2, '0')}</div>
                <div className="chapter-body">
                  <h3>{c.title}</h3>
                  <p className="muted">{c.summary}</p>
                  <ProgressBar value={c.mastery} label="Dominio del capítulo" />
                  <div className="chapter-meta small muted">
                    <span>{c.mastery}%</span>
                    <span title="Secciones leídas">📖 {c.sectionsRead}/{c.sections}</span>
                    <span title="Flashcards">🃏 {c.cards}</span>
                    <span title="Preguntas">❓ {c.questions}</span>
                    {c.drills > 0 && <span title="Drills de código">⏱ {c.drills}</span>}
                    {c.due > 0 && <span className="tag tag-due">{c.due} pendientes</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
