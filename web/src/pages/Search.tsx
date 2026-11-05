import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../hooks';
import { Loading } from '../components/ui';
import { esc } from '../lib/highlight';

const TYPE_LABEL = { section: 'Teoría', card: 'Flashcard', snippet: 'Snippet', shortcut: 'Atajo' } as const;
const TAB = { section: 'teoria', card: 'tarjetas', snippet: 'snippets', shortcut: 'snippets' } as const;

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const { data, loading } = useAsync(() => (q.trim().length >= 2 ? api.search(q) : Promise.resolve({ results: [] })), [q]);
  const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
  const hl = (t: string) => ({ __html: re ? esc(t).replace(re, (m) => `<mark>${m}</mark>`) : esc(t) });

  return (
    <>
      <header className="page-head"><h1>Buscar</h1></header>
      <form className="card search-form" onSubmit={(e) => { e.preventDefault(); setParams({ q: text }); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ConfigureAwait, BULK COLLECT, useEffect, Ocp-Apim…" autoFocus aria-label="Buscar" />
        <button className="btn" type="submit">Buscar</button>
      </form>
      {loading ? <Loading /> : data && q.trim().length >= 2 && (
        data.results.length ? (
          <>
            <p className="muted">{data.results.length} resultados</p>
            {data.results.map((r, i) => (
              <Link key={i} className="card result" to={`/capitulo/${r.chapterId}/${TAB[r.type]}`}>
                <div className="tags"><span className="tag">{r.chapterTitle}</span><span className="tag tag-card">{TYPE_LABEL[r.type]}</span></div>
                <strong dangerouslySetInnerHTML={hl(r.title)} />
                <p className="muted small" dangerouslySetInnerHTML={hl(r.snippet + '…')} />
              </Link>
            ))}
          </>
        ) : <div className="empty"><p>Sin resultados.</p></div>
      )}
    </>
  );
}
