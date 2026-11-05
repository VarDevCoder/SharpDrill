import { useState } from 'react';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, Loading } from '../components/ui';
import { useToast } from '../components/Toast';
import { StudySession } from '../session/StudySession';
import { ChapterPicker } from './Exam';
import type { QuestionItem } from '../types';

export function PracticePage() {
  const toast = useToast();
  const chapters = useAsync(() => api.chapters(), []);
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [run, setRun] = useState(0);

  async function start() {
    try {
      const r = await api.practice({ chapter: selected.join(','), count });
      setItems(r.items);
      setRun((x) => x + 1);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  if (items) return <StudySession key={run} items={items} mode="practice" title="Práctica" onExit={() => setItems(null)} onRestart={() => setItems(null)} />;
  if (chapters.loading) return <Loading />;
  if (chapters.error) return <ErrorBox error={chapters.error} onRetry={chapters.reload} />;

  return (
    <>
      <header className="page-head">
        <h1>Práctica libre</h1>
        <p className="muted">Preguntas priorizadas por debilidad: primero lo que fallaste, luego lo no visto y lo que te cuesta.</p>
      </header>
      <section className="card">
        <h2>Capítulos</h2>
        <p className="muted small">Sin selección = todo el temario.</p>
        <ChapterPicker chapters={chapters.data!.chapters} tracks={chapters.data!.tracks} selected={selected} onChange={setSelected} />
        <div className="row">
          <label>Preguntas <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[5, 10, 15, 20, 30].map((n) => <option key={n}>{n}</option>)}</select></label>
          <button className="btn" type="button" onClick={start}>Empezar práctica</button>
        </div>
      </section>
    </>
  );
}
