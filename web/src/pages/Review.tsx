import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, Loading } from '../components/ui';
import { StudySession } from '../session/StudySession';

const MODES = [
  { id: 'mixed', label: 'Mixto (tarjetas + preguntas)' },
  { id: 'cards', label: 'Solo flashcards' },
  { id: 'questions', label: 'Solo preguntas' },
  { id: 'mistakes', label: 'Mis fallos' },
];

export function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('modo') ?? 'mixed';
  const cap = params.get('cap') ?? '';
  const track = params.get('track') ?? '';
  const n = Number(params.get('n') ?? 20);
  const chapters = useAsync(() => api.chapters(), []);
  const queue = useAsync(() => api.queue({ mode, chapter: cap, track, limit: n, newLimit: Math.ceil(n / 2) }), [mode, cap, track, n]);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k === 'track') p.delete('cap');
    setParams(p);
  };

  return (
    <>
      <header className="page-head">
        <h1>Repaso activo</h1>
        <p className="muted">Primero lo que toca hoy según la repetición espaciada (SM-2); después, elementos nuevos.</p>
      </header>
      <form className="card filters" onSubmit={(e) => e.preventDefault()}>
        <label>Modo <select value={mode} onChange={(e) => set('modo', e.target.value)}>{MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label>Ruta <select value={track} onChange={(e) => set('track', e.target.value)}>
          <option value="">Todas</option>
          {chapters.data?.tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select></label>
        <label>Capítulo <select value={cap} onChange={(e) => set('cap', e.target.value)}>
          <option value="">Todos</option>
          {chapters.data?.chapters.filter((c) => !track || c.track === track).map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}
        </select></label>
        <label>Tamaño <select value={n} onChange={(e) => set('n', e.target.value)}>{[10, 20, 30, 50].map((x) => <option key={x}>{x}</option>)}</select></label>
        {queue.data && <span className="muted small counts">{mode === 'mistakes' ? `${queue.data.counts.due} fallos` : `${queue.data.counts.due} pendientes · ${queue.data.counts.new} nuevos`}</span>}
      </form>
      {queue.loading ? <Loading /> : queue.error ? <ErrorBox error={queue.error} onRetry={queue.reload} /> : (
        <StudySession key={`${mode}-${cap}-${track}-${n}-${queue.data!.items.map((i) => i.id).join()}`} items={queue.data!.items}
          mode="review" title="Repaso" onRestart={queue.reload} />
      )}
    </>
  );
}
