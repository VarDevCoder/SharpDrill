import { Icon, TRACK_ICON } from '../components/Icon';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, Loading, ProgressBar } from '../components/ui';

export function ChaptersPage() {
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useAsync(() => api.chapters(), []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? new Error('Sin datos')} onRetry={reload} />;
  const allTracks = [...data.tracks].sort((a, b) => a.order - b.order);
  const selected = allTracks.find((t) => t.id === params.get('track'));
  const tracks = selected ? [selected] : allTracks;
  const chapters = data.chapters.filter((c) => !selected || c.track === selected.id);
  const basics = data.chapters.filter((c) => c.track === 'csharp-basics');
  const nextBasic = basics.find((c) => c.sectionsRead < c.sections) ?? basics[basics.length - 1];

  return (
    <>
      <header className="page-head">
        <h1>{selected?.title ?? 'Temario'}</h1>
        <p className="muted">{chapters.length} capítulos{selected ? ' en esta ruta' : ` en ${tracks.length} rutas`}. Lee, ejecuta los ejemplos y practica a tu ritmo.</p>
        <nav className="chips" aria-label="Rutas de aprendizaje">
          <Link className="chip" to="/temario" aria-current={!selected ? 'page' : undefined}>Todas</Link>
          {allTracks.map((t) => <Link key={t.id} className="chip" to={`/temario?track=${t.id}`} aria-current={selected?.id === t.id ? 'page' : undefined}><Icon name={TRACK_ICON[t.id] ?? 'book'} /> {t.title}</Link>)}
        </nav>
      </header>
      {(!selected || selected.id === 'csharp-basics') && nextBasic && <section className="card learning-start">
        <span className="eyebrow">Sin conocimientos previos</span>
        <h2>Empieza aquí: C# desde cero</h2>
        <p>Avanza en orden: primer programa, variables, decisiones y bucles, funciones y listas, objetos y un inventario completo.</p>
        <p className="muted">Lee una sección, prueba el código en tu equipo y responde las preguntas sin límite de tiempo. Marca tus lecturas para retomar después; tus respuestas y repasos se guardan en tu cuenta.</p>
        <Link className="btn" to={`/capitulo/${nextBasic.id}`}>{basics.some((c) => c.sectionsRead > 0) ? 'Continuar la ruta' : 'Abrir el primer capítulo'} <Icon name="arrowRight" /></Link>
      </section>}
      {tracks.map((t) => (
        <section key={t.id} id={t.id} className="track-section">
          <h2 className="track-title"><span className={`track-icon track-${t.id}`}><Icon name={TRACK_ICON[t.id] ?? 'book'} /></span> {t.title}</h2>
          <div className="chapter-grid">
            {data.chapters.filter((c) => c.track === t.id).map((c) => (
              <Link key={c.id} className="card chapter-card" to={`/capitulo/${c.id}`}>
                <div className="chapter-num">{String(c.number).padStart(2, '0')}</div>
                <div className="chapter-body">
                  <h3>{c.title}</h3>
                  <span className="tag">{c.level}</span>
                  <p className="muted">{c.summary}</p>
                  <ProgressBar value={c.mastery} label="Dominio del capítulo" />
                  <div className="chapter-meta small muted">
                    <span>{c.mastery}%</span>
                    <span title="Secciones leídas"><span className="sr-only">Secciones leídas: </span><Icon name="book" /> {c.sectionsRead}/{c.sections}</span>
                    <span title="Flashcards"><span className="sr-only">Flashcards: </span><Icon name="cards" /> {c.cards}</span>
                    <span title="Preguntas"><span className="sr-only">Preguntas: </span><Icon name="question" /> {c.questions}</span>
                    {c.drills > 0 && <span title="Drills de código"><span className="sr-only">Drills de código: </span><Icon name="timer" /> {c.drills}</span>}
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
