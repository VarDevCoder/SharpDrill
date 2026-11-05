import { useState } from 'react';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, LangBadge, Loading } from '../components/ui';
import { useToast } from '../components/Toast';
import { DrillRunner } from '../session/DrillRunner';
import { formatMs } from '../lib/format';
import type { DrillItem } from '../types';

const LANGS = [
  { id: '', label: 'Todos los lenguajes' },
  { id: 'csharp', label: 'C#' },
  { id: 'plsql', label: 'PL/SQL' },
  { id: 'sql', label: 'SQL' },
  { id: 'tsx', label: 'React TSX' },
  { id: 'ts', label: 'TypeScript' },
  { id: 'bash', label: 'Bash / curl' },
  { id: 'js', label: 'Postman (JS)' },
  { id: 'xml', label: 'APIM (XML)' },
];

export function DrillsPage() {
  const toast = useToast();
  const [lang, setLang] = useState('');
  const [track, setTrack] = useState('');
  const [count, setCount] = useState(5);
  const [session, setSession] = useState<{ items: DrillItem[]; n: number } | null>(null);
  const list = useAsync(() => api.drills({ lang, track }), [lang, track]);
  const tracks = useAsync(() => api.chapters(), []);
  const history = useAsync(() => api.drillHistory(), [session === null]);

  async function startSession(ids?: string[]) {
    try {
      const items = ids
        ? list.data!.items.filter((d) => ids.includes(d.id))
        : (await api.drillSession({ lang, track, count })).items;
      setSession({ items, n: Date.now() });
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  if (session) return <DrillRunner key={session.n} items={session.items} onRestart={() => { setSession(null); list.reload(); }} />;

  return (
    <>
      <header className="page-head">
        <h1>Drills de código ⏱</h1>
        <p className="muted">Escribe código real contra el reloj: PL/SQL, C#, React/TSX, curl, Postman y políticas de APIM.
          El servidor mide el tiempo y verifica los puntos clave; después comparas con la solución de referencia.</p>
      </header>
      <form className="card filters" onSubmit={(e) => { e.preventDefault(); startSession(); }}>
        <label>Lenguaje <select value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
        <label>Ruta <select value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value="">Todas</option>
          {tracks.data?.tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select></label>
        <label>Drills <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3, 5, 8, 10].map((n) => <option key={n}>{n}</option>)}</select></label>
        <button className="btn" type="submit">Empezar sesión</button>
      </form>

      {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : (
        <div className="drill-list">
          {list.data!.items.map((d) => (
            <article key={d.id} className="card drill-card">
              <div className="tags">
                <LangBadge lang={d.lang} />
                <span className="tag">⏱ {formatMs(d.timeLimit * 1000)}</span>
                {d.bestMs != null && <span className="tag tag-ok">Mejor: {formatMs(d.bestMs)}</span>}
                {d.due && <span className="tag tag-due">Toca repasar</span>}
                {d.isNew && <span className="tag tag-new">Nuevo</span>}
              </div>
              <h3>{d.title}</h3>
              <p className="small muted">{d.chapterTitle}</p>
              <button className="btn ghost small" type="button" onClick={() => startSession([d.id])}>Hacer este drill</button>
            </article>
          ))}
        </div>
      )}

      {history.data && history.data.history.length > 0 && (
        <section className="card">
          <h2>Historial reciente</h2>
          <div className="table-wrap"><table><thead><tr><th>Drill</th><th>Checks</th><th>Tiempo</th><th>Fecha</th></tr></thead><tbody>
            {history.data.history.map((h, i) => (
              <tr key={i}>
                <td>{h.title}</td>
                <td><span className={`tag ${h.passed === h.total ? 'tag-ok' : 'tag-ko'}`}>{h.passed}/{h.total}</span></td>
                <td className={h.elapsedMs > h.timeLimit * 1000 ? 'warn' : ''}>{formatMs(h.elapsedMs)} / {formatMs(h.timeLimit * 1000)}</td>
                <td>{new Date(h.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
              </tr>
            ))}
          </tbody></table></div>
        </section>
      )}
    </>
  );
}
