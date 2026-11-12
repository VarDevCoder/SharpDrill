import { Icon } from '../components/Icon';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { DrillItem, DrillResult } from '../types';
import { CodeBlock, Markdown } from '../components/Markdown';
import { LangBadge, Loading, ProgressBar, useTheme } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatInterval, formatMs } from '../lib/format';
import { useNow } from '../hooks';

const CodeEditor = lazy(() => import('../components/CodeEditor'));

const GRADE_LABEL = ['Otra vez', 'Difícil', 'Bien', 'Fácil'];

type Phase = 'ready' | 'running' | 'done';
type Props = { items: DrillItem[]; title?: string; onRestart?: () => void };

/**
 * Drill de código cronometrado: el servidor emite un ticket al empezar y mide el tiempo al entregar.
 * Al agotarse el tiempo se entrega automáticamente.
 */
export function DrillRunner({ items, title = 'Drills de código', onRestart }: Props) {
  const toast = useToast();
  const { theme } = useTheme();
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [history, setHistory] = useState<{ d: DrillItem; r: DrillResult }[]>([]);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const autoSent = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const codeRef = useRef('');
  codeRef.current = code;

  const d = items[i];
  const now = useNow(250, phase === 'running');
  const left = deadline - now;

  const start = async () => {
    if (!d || busy) return;
    setBusy(true);
    try {
      const s = await api.startDrill(d.id);
      setTicket(s.ticket);
      setStartedAt(Date.now());
      setDeadline(Date.now() + s.timeLimit * 1000);
      setCode(d.starter ?? '');
      autoSent.current = false;
      setPhase('running');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  const submit = useCallback(async () => {
    // Solo durante el drill: Ctrl+Enter en el editor ya entregado no debe volver a entregar
    if (!d || !ticket || submitting.current || phaseRef.current !== 'running') return;
    submitting.current = true;
    setBusy(true);
    try {
      const r = await api.submitDrill(d.id, ticket, codeRef.current);
      setResult(r);
      setHistory((h) => [...h, { d, r }]);
      setPhase('done');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); submitting.current = false; }
  }, [d, ticket, toast]);

  // Entrega automática al agotar el tiempo
  useEffect(() => {
    // Una sola vez: si la entrega falla, se reintenta a mano con el botón (sin bucle de peticiones ni de avisos)
    if (phase === 'running' && left <= 0 && !autoSent.current) {
      autoSent.current = true;
      toast('¡Tiempo! Entregando tu código…', 'warn');
      submit();
    }
  }, [phase, left, submit, toast]);

  const next = () => { setI((x) => x + 1); setPhase('ready'); setResult(null); setTicket(null); setCode(''); };

  if (items.length === 0) {
    return <div className="empty card"><p>No hay drills con estos filtros.</p><Link className="btn ghost" to="/drills">Ver todos los drills</Link></div>;
  }

  if (i >= items.length) {
    const ok = history.filter((h) => h.r.correct).length;
    return (
      <div className="card summary">
        <h2>Sesión de drills completada</h2>
        <div className="stats-row">
          <div className="stat"><span className="stat-n">{ok}/{history.length}</span><span className="stat-l">perfectos y a tiempo</span></div>
          <div className="stat"><span className="stat-n">{formatMs(history.reduce((s, h) => s + h.r.elapsedMs, 0))}</span><span className="stat-l">tiempo total</span></div>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Drill</th><th>Checks</th><th>Tiempo</th><th>Resultado</th></tr></thead><tbody>
          {history.map(({ d: x, r }) => (
            <tr key={x.id}><td>{x.title}</td><td>{r.passed}/{r.total}</td><td>{formatMs(r.elapsedMs)} / {formatMs(r.timeLimit * 1000)}</td>
              <td><span className={`tag ${r.correct ? 'tag-ok' : 'tag-ko'}`}>{GRADE_LABEL[r.srsGrade]}</span></td></tr>
          ))}
        </tbody></table></div>
        <div className="row center">
          {onRestart && <button className="btn" type="button" onClick={onRestart}>Otra sesión</button>}
          <Link className="btn ghost" to="/drills">Volver a drills</Link>
        </div>
      </div>
    );
  }

  const timeCls = left < 30_000 ? 'urgent' : left < d.timeLimit * 500 ? 'warn' : '';

  return (
    <div>
      <div className="session-top">
        <div className="session-title"><strong>{title}</strong><span className="muted">{i + 1} / {items.length}</span></div>
        <ProgressBar value={(i / items.length) * 100} label="Progreso" />
        {phase === 'running'
          ? <span className={`timer ${timeCls}`} aria-live="off">{formatMs(left)}</span>
          : <span className="muted small"><Icon name="timer" /> {formatMs(d.timeLimit * 1000)}</span>}
      </div>

      <article className="item drill" key={d.id}>
        <div className="tags">
          <LangBadge lang={d.lang} />
          {d.chapterTitle && <span className="tag">{d.chapterTitle}</span>}
          {d.isNew && <span className="tag tag-new">Nuevo</span>}
          <span className="tag">{d.checkCount} verificaciones</span>
        </div>
        <h2>{d.title}</h2>
        <Markdown source={d.prompt} />

        {phase === 'ready' && (
          <div className="drill-start">
            <p className="muted">Tienes <strong>{formatMs(d.timeLimit * 1000)}</strong>. El cronómetro empieza al pulsar el botón y la entrega es automática al llegar a 0.
              Entrega con <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.</p>
            <button className="btn wide" type="button" onClick={start} disabled={busy}>Empezar drill <Icon name="timer" /></button>
          </div>
        )}

        {phase !== 'ready' && (
          <Suspense fallback={<Loading />}>
            <CodeEditor value={code} onChange={setCode} lang={d.lang} onSubmit={submit} readOnly={phase === 'done'} dark={theme === 'dark'} />
          </Suspense>
        )}

        {phase === 'running' && (
          <div className="row">
            <button className="btn" type="button" onClick={submit} disabled={busy}>Entregar <kbd>Ctrl+Enter</kbd></button>
            <span className="muted small">Tiempo usado: {formatMs(now - startedAt)}</span>
          </div>
        )}

        {phase === 'done' && result && (
          <>
            <div className={`feedback ${result.correct ? 'ok' : 'ko'}`} role="status">
              <strong>
                <Icon name={result.passed === result.total ? 'check' : 'close'} /> {result.passed === result.total ? (result.inTime ? 'Todas las verificaciones superadas' : 'Correcto, pero fuera de tiempo') : `${result.passed}/${result.total} verificaciones`}
              </strong>
              <ul className="checks">
                {result.results.map((c) => <li key={c.hint} className={c.ok ? 'ok' : 'ko'}><span><span className="sr-only">{c.ok ? 'Superada: ' : 'No superada: '}</span><Icon name={c.ok ? 'check' : 'close'} /></span> <Markdown className="inline-md" source={c.hint} /></li>)}
              </ul>
              <p className="small">Tiempo: <strong>{formatMs(result.elapsedMs)}</strong> de {formatMs(result.timeLimit * 1000)} ·
                Calificación: <strong>{GRADE_LABEL[result.srsGrade]}</strong> · Próximo repaso en {formatInterval(result.next.interval)}</p>
            </div>
            <h3>Solución de referencia</h3>
            <CodeBlock code={result.solution} lang={d.lang} />
            {result.explanation && <Markdown source={result.explanation} />}
            <button className="btn wide" type="button" onClick={next}>{i + 1 < items.length ? 'Siguiente drill' : 'Ver resumen'}</button>
          </>
        )}
      </article>
    </div>
  );
}
