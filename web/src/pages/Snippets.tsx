import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, LangBadge, Loading } from '../components/ui';
import { CodeBlock, Markdown } from '../components/Markdown';
import { ShortcutTable } from './Chapter';

export function SnippetsPage() {
  const [track, setTrack] = useState('');
  const [lang, setLang] = useState('');
  const [tool, setTool] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'snippets' | 'atajos'>('snippets');
  const tracks = useAsync(() => api.chapters(), []);
  const { data, error, loading, reload } = useAsync(() => api.snippets({ track, lang, q }), [track, lang, q]);
  const shortcuts = useMemo(() => (data?.shortcuts ?? []).filter((k) => !tool || k.tool === tool), [data, tool]);
  const tools = useMemo(() => [...new Set((data?.shortcuts ?? []).map((k) => k.tool))].sort(), [data]);

  return (
    <>
      <header className="page-head">
        <h1>Snippets y atajos</h1>
        <p className="muted">Tu chuleta: fragmentos listos para copiar y atajos de teclado de Visual Studio, Rider, VS Code, SQL Developer, Postman, DevTools y terminal.</p>
      </header>
      <form className="card filters" onSubmit={(e) => e.preventDefault()}>
        <div className="tabs small" role="tablist">
          <button type="button" role="tab" className={`tab ${view === 'snippets' ? 'active' : ''}`} onClick={() => setView('snippets')}>Snippets {data && <span className="count">{data.snippets.length}</span>}</button>
          <button type="button" role="tab" className={`tab ${view === 'atajos' ? 'active' : ''}`} onClick={() => setView('atajos')}>Atajos {data && <span className="count">{data.shortcuts.length}</span>}</button>
        </div>
        <label>Ruta <select value={track} onChange={(e) => setTrack(e.target.value)}><option value="">Todas</option>
          {tracks.data?.tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
        {view === 'snippets'
          ? <label>Lenguaje <select value={lang} onChange={(e) => setLang(e.target.value)}><option value="">Todos</option>{data?.langs.map((l) => <option key={l}>{l}</option>)}</select></label>
          : <label>Herramienta <select value={tool} onChange={(e) => setTool(e.target.value)}><option value="">Todas</option>{tools.map((t) => <option key={t}>{t}</option>)}</select></label>}
        <label className="grow">Filtrar <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="BULK COLLECT, useEffect, curl, F12…" /></label>
      </form>

      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : view === 'snippets' ? (
        <div className="snippet-grid">
          {data!.snippets.map((s) => (
            <section key={s.id} className="card snippet">
              <div className="tags"><LangBadge lang={s.lang} /><Link className="tag" to={`/capitulo/${s.chapterId}/snippets`}>{s.chapterTitle}</Link></div>
              <h3>{s.title}</h3>
              <CodeBlock code={s.code} lang={s.lang} />
              {s.note && <Markdown source={s.note} />}
            </section>
          ))}
          {data!.snippets.length === 0 && <p className="muted">Sin resultados.</p>}
        </div>
      ) : (
        <section className="card"><ShortcutTable shortcuts={shortcuts} />{shortcuts.length === 0 && <p className="muted">Sin resultados.</p>}</section>
      )}
    </>
  );
}
