import { useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, LangBadge, Loading, ProgressBar } from '../components/ui';
import { CodeBlock, Markdown } from '../components/Markdown';
import { useToast } from '../components/Toast';
import { StudySession } from '../session/StudySession';
import { DrillRunner } from '../session/DrillRunner';
import { formatMs, shuffle } from '../lib/format';
import type { ChapterDetail } from '../types';

const TABS = [
  { id: 'teoria', label: 'Teoría' },
  { id: 'tarjetas', label: 'Flashcards' },
  { id: 'practica', label: 'Práctica' },
  { id: 'drills', label: 'Drills ⏱' },
  { id: 'snippets', label: 'Snippets y atajos' },
] as const;

export function ChapterPage() {
  const { id = '', tab = 'teoria' } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.chapter(id), [id]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? new Error('Sin datos')} onRetry={reload} />;
  const ch = data.chapter;

  const counts: Record<string, number> = { tarjetas: ch.cards.length, practica: ch.questions.length, drills: ch.drills.length, snippets: ch.snippets.length + ch.shortcuts.length };

  return (
    <>
      <nav className="crumbs small"><Link to="/temario">Temario</Link> / Capítulo {ch.number}</nav>
      <header className="page-head">
        <span className="eyebrow">Capítulo {ch.number} · {ch.level}</span>
        <h1>{ch.title}</h1>
        <p className="muted">{ch.summary}</p>
        <div className="head-progress"><ProgressBar value={ch.mastery} label="Dominio" /><span className="small muted">{ch.mastery}% dominio · {ch.seen}/{ch.total} vistos</span></div>
      </header>
      <div className="tabs" role="tablist">
        {TABS.filter((t) => t.id === 'teoria' || counts[t.id] > 0).map((t) => (
          <NavLink key={t.id} role="tab" className={() => `tab ${t.id === tab ? 'active' : ''}`} aria-selected={t.id === tab} to={`/capitulo/${ch.id}/${t.id}`}>
            {t.label}{counts[t.id] ? <span className="count">{counts[t.id]}</span> : null}
          </NavLink>
        ))}
      </div>

      {tab === 'teoria' && <Theory key={ch.id} ch={ch} />}
      {tab === 'tarjetas' && <StudySession key={`c-${ch.id}`} items={shuffle(ch.cards)} mode="study" title="Flashcards del capítulo" />}
      {tab === 'practica' && <StudySession key={`q-${ch.id}`} items={shuffle(ch.questions)} mode="practice" title="Práctica del capítulo" />}
      {tab === 'drills' && <ChapterDrills ch={ch} />}
      {tab === 'snippets' && <ChapterSnippets ch={ch} />}
    </>
  );
}

function Theory({ ch }: { ch: ChapterDetail }) {
  const toast = useToast();
  const [read, setRead] = useState(() => new Set(ch.readSections));

  async function toggle(sid: string, value: boolean) {
    try {
      await api.markRead(ch.id, sid, value);
      setRead((r) => { const n = new Set(r); if (value) n.add(sid); else n.delete(sid); return n; });
      if (value) toast('Sección marcada como leída', 'ok', 1200);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      {ch.objectives.length > 0 && <div className="card objectives"><h2>Objetivos</h2><ul>{ch.objectives.map((o) => <li key={o}>{o}</li>)}</ul></div>}
      <div className="toc card"><h2>Contenido</h2><ol>
        {ch.sections.map((s) => (
          <li key={s.id}>
            <a href={`#sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>{s.title}</a>
            <span className={`check ${read.has(s.id) ? 'on' : ''}`} aria-label={read.has(s.id) ? 'leída' : 'pendiente'}>✓</span>
          </li>
        ))}
      </ol></div>
      {ch.sections.map((s, i) => (
        <section className="card lesson" id={`sec-${s.id}`} key={s.id}>
          <h2><span className="muted">{ch.number}.{i + 1}</span> {s.title}</h2>
          <Markdown source={s.body} lang={ch.track === 'csharp' ? 'csharp' : 'text'} />
          <div className="lesson-foot">
            <label className="toggle"><input type="checkbox" checked={read.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} /> Marcar como leída</label>
          </div>
        </section>
      ))}
      <div className="card cta">
        <div><h2>Ahora, recuerda sin mirar</h2><p className="muted">Leer no es aprender: el recuerdo activo y escribir código bajo tiempo consolidan la memoria.</p></div>
        <div className="row">
          <Link className="btn" to={`/capitulo/${ch.id}/tarjetas`}>Flashcards</Link>
          <Link className="btn ghost" to={`/capitulo/${ch.id}/practica`}>Práctica</Link>
          {ch.drills.length > 0 && <Link className="btn ghost" to={`/capitulo/${ch.id}/drills`}>Drills ⏱</Link>}
        </div>
      </div>
      <nav className="pager">
        {ch.prev ? <Link className="btn ghost" to={`/capitulo/${ch.prev}`}>← Capítulo anterior</Link> : <span />}
        {ch.next && <Link className="btn ghost" to={`/capitulo/${ch.next}`}>Capítulo siguiente →</Link>}
      </nav>
    </>
  );
}

function ChapterDrills({ ch }: { ch: ChapterDetail }) {
  const [run, setRun] = useState<string[] | null>(null);
  if (run) {
    const items = run.map((id) => ch.drills.find((d) => d.id === id)!).map((d) => ({ ...d, chapterTitle: ch.title }));
    return <DrillRunner key={run.join()} items={items} title="Drills del capítulo" onRestart={() => setRun(null)} />;
  }
  return (
    <>
      <div className="card cta">
        <div><h2>Escribe código contra el reloj</h2><p className="muted">Cada drill tiene un tiempo límite y verificaciones automáticas. Después verás la solución de referencia.</p></div>
        <button className="btn" type="button" onClick={() => setRun(ch.drills.map((d) => d.id))}>Hacer todos ({ch.drills.length})</button>
      </div>
      <div className="drill-list">
        {ch.drills.map((d) => (
          <article key={d.id} className="card drill-card">
            <div className="tags"><LangBadge lang={d.lang} /><span className="tag">⏱ {formatMs(d.timeLimit * 1000)}</span><span className="tag">{d.checkCount} checks</span></div>
            <h3>{d.title}</h3>
            <button className="btn ghost small" type="button" onClick={() => setRun([d.id])}>Empezar</button>
          </article>
        ))}
      </div>
    </>
  );
}

function ChapterSnippets({ ch }: { ch: ChapterDetail }) {
  return (
    <>
      {ch.snippets.map((s) => (
        <section key={s.id} className="card snippet">
          <h3>{s.title}</h3>
          <CodeBlock code={s.code} lang={s.lang} />
          {s.note && <Markdown source={s.note} />}
        </section>
      ))}
      {ch.shortcuts.length > 0 && (
        <section className="card">
          <h2>Atajos de teclado</h2>
          <ShortcutTable shortcuts={ch.shortcuts} />
        </section>
      )}
    </>
  );
}

export function ShortcutTable({ shortcuts }: { shortcuts: { tool: string; keys: string; action: string }[] }) {
  return (
    <div className="table-wrap"><table className="shortcuts"><thead><tr><th>Herramienta</th><th>Atajo</th><th>Acción</th></tr></thead><tbody>
      {shortcuts.map((k, i) => (
        <tr key={`${k.tool}-${k.keys}-${i}`}><td>{k.tool}</td><td><Keys keys={k.keys} /></td><td><Markdown className="inline-md" source={k.action} /></td></tr>
      ))}
    </tbody></table></div>
  );
}

/** Pinta "Ctrl+Shift+P / F12" como teclas. */
export function Keys({ keys }: { keys: string }) {
  return (
    <span className="keys">
      {keys.split(' / ').map((alt, i) => (
        <span key={i}>{i > 0 && <span className="muted"> / </span>}
          {alt.split(', ').map((chord, c) => (
            <span key={c}>{c > 0 && ', '}
              {chord.split(/(?<=\S)\+(?=\S)/).map((k, j) => <span key={j}>{j > 0 && '+'}<kbd>{k.trim()}</kbd></span>)}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
