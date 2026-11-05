import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { AnswerResult, CardItem, QuestionItem, StudyItem } from '../types';
import { CodeBlock, Inline, Markdown } from '../components/Markdown';
import { ProgressBar } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatInterval } from '../lib/format';
import { useKeys } from '../hooks';

const GRADES = [
  { g: 0, label: 'Otra vez', hint: 'No lo recordé', cls: 'again' },
  { g: 1, label: 'Difícil', hint: 'Con esfuerzo', cls: 'hard' },
  { g: 2, label: 'Bien', hint: 'Lo recordé', cls: 'good' },
  { g: 3, label: 'Fácil', hint: 'Sin dudar', cls: 'easy' },
];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TYPE_LABEL = { mcq: 'Opción múltiple', tf: 'Verdadero / Falso', fill: 'Completar' } as const;

type Props = {
  items: StudyItem[];
  mode: 'study' | 'review' | 'practice';
  title: string;
  onExit?: () => void;
  onRestart?: () => void;
};

type Result = { item: StudyItem; correct: boolean };

/** Sesión de repaso activo: flashcards con autoevaluación y preguntas corregidas por el servidor. */
export function StudySession({ items: initial, mode, title, onExit, onRestart }: Props) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<unknown>(null);
  const [answer, setAnswer] = useState<AnswerResult | null>(null);
  const [fill, setFill] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [started] = useState(() => Date.now());

  const done = i >= items.length;
  const it = items[i];

  const restartWith = (list: StudyItem[]) => {
    setItems(list); setI(0); setResults([]); setFlipped(false); setAnswer(null); setSelected(null); setFill('');
  };

  async function gradeCard(g: number) {
    if (busy || !it || it.kind !== 'card') return;
    setBusy(true);
    try {
      const { next } = await api.gradeCard(it.id, g, mode);
      setResults((r) => [...r, { item: it, correct: g > 0 }]);
      toast(`Próximo repaso en ${formatInterval(next.interval)}`, g === 0 ? 'warn' : 'ok', 1300);
      setFlipped(false);
      setI((x) => x + 1);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function submit(value: unknown) {
    if (busy || answer || !it || it.kind !== 'question') return;
    setBusy(true);
    setSelected(value);
    try {
      const r = await api.answer(it.id, value, mode);
      setAnswer(r);
      setResults((x) => [...x, { item: it, correct: r.correct }]);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  function next() {
    setAnswer(null); setSelected(null); setFill(''); setI((x) => x + 1);
  }

  useKeys((e) => {
    if (done || !it) return;
    const typing = (e.target as HTMLElement).matches('input, textarea');
    if (it.kind === 'card') {
      if (!flipped && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); setFlipped(true); }
      else if (flipped && ['1', '2', '3', '4'].includes(e.key)) gradeCard(Number(e.key) - 1);
      return;
    }
    if (answer) { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); next(); } return; }
    if (typing) return;
    if (it.type === 'mcq' && it.options) {
      const k = LETTERS.indexOf(e.key.toUpperCase());
      const idx = k >= 0 ? k : Number(e.key) - 1;
      if (idx >= 0 && idx < it.options.length) submit(idx);
    } else if (it.type === 'tf') {
      if (e.key.toLowerCase() === 'v' || e.key === '1') submit(true);
      if (e.key.toLowerCase() === 'f' || e.key === '2') submit(false);
    }
  }, [it, flipped, answer, done, busy]);

  if (items.length === 0) {
    return (
      <div className="empty card">
        <div className="empty-icon" aria-hidden="true">✓</div>
        <h2>¡Todo al día!</h2>
        <p>No hay elementos pendientes con estos filtros. Vuelve más tarde o aprende algo nuevo.</p>
        <div className="row center"><Link className="btn" to="/temario">Ver temario</Link><Link className="btn ghost" to="/drills">Hacer drills</Link></div>
      </div>
    );
  }

  if (done) {
    const ok = results.filter((r) => r.correct).length;
    const failed = results.filter((r) => !r.correct).map((r) => r.item);
    const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
    return (
      <div className="card summary">
        <h2>Sesión completada</h2>
        <div className="stats-row">
          <div className="stat"><span className="stat-n">{results.length}</span><span className="stat-l">elementos</span></div>
          <div className="stat"><span className="stat-n">{results.length ? Math.round((ok / results.length) * 100) : 0}%</span><span className="stat-l">recordados</span></div>
          <div className="stat"><span className="stat-n">{mins}</span><span className="stat-l">min</span></div>
        </div>
        {failed.length ? (
          <>
            <h3>Para reforzar</h3>
            <ul className="list">{failed.map((f) => <li key={f.id}><Inline text={f.kind === 'card' ? f.front : f.prompt} /></li>)}</ul>
          </>
        ) : <p className="center">Sin fallos. ¡Excelente!</p>}
        <div className="row center">
          {failed.length > 0 && <button className="btn" type="button" onClick={() => restartWith(failed)}>Repasar fallos ahora</button>}
          {onRestart && <button className="btn ghost" type="button" onClick={onRestart}>Otra sesión</button>}
          <Link className="btn ghost" to="/">Ir al inicio</Link>
        </div>
      </div>
    );
  }

  const tags = (
    <div className="tags">
      {it.chapterTitle && <span className="tag">{it.chapterTitle}</span>}
      {it.kind === 'card'
        ? <span className="tag tag-card">{(it as CardItem).custom ? 'Tarjeta propia' : 'Flashcard'}</span>
        : <span className="tag tag-q">{it.tag ?? TYPE_LABEL[it.type]}</span>}
      {it.isNew && <span className="tag tag-new">Nuevo</span>}
    </div>
  );

  return (
    <div>
      <div className="session-top">
        <div className="session-title"><strong>{title}</strong><span className="muted">{i + 1} / {items.length}</span></div>
        <ProgressBar value={(i / items.length) * 100} label="Progreso de la sesión" />
        <button className="btn ghost small" type="button" onClick={() => (results.length ? setI(items.length) : onExit?.())}>Terminar</button>
      </div>

      {it.kind === 'card' ? (
        <article key={it.id} className={`item flash ${flipped ? 'flipped' : ''}`}>
          {tags}
          <div className="prompt"><Markdown source={it.front} /></div>
          {flipped && <><hr /><div className="answer"><Markdown source={it.back} /></div>{it.code && <CodeBlock code={it.code} lang={it.lang ?? 'csharp'} />}</>}
          <div className="actions">
            {flipped ? (
              <>
                <p className="muted small center">¿Qué tan bien lo recordaste?</p>
                <div className="grades">
                  {GRADES.map((x, k) => (
                    <button key={x.g} className={`grade ${x.cls}`} type="button" disabled={busy} onClick={() => gradeCard(x.g)}>
                      <kbd>{k + 1}</kbd><strong>{x.label}</strong><small>{x.hint}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="muted small center">Intenta recordar la respuesta antes de mirar (recuerdo activo).</p>
                <button className="btn wide" type="button" onClick={() => setFlipped(true)}>Mostrar respuesta <kbd>Espacio</kbd></button>
              </>
            )}
          </div>
        </article>
      ) : (
        <QuestionView key={it.id} q={it} tags={tags} answer={answer} selected={selected} fill={fill} setFill={setFill}
          onAnswer={submit} onNext={next} isLast={i + 1 >= items.length} busy={busy} />
      )}
    </div>
  );
}

type QProps = {
  q: QuestionItem; tags: React.ReactNode; answer: AnswerResult | null; selected: unknown; fill: string;
  setFill: (v: string) => void; onAnswer: (v: unknown) => void; onNext: () => void; isLast: boolean; busy: boolean;
};

function QuestionView({ q, tags, answer, selected, fill, setFill, onAnswer, onNext, isLast, busy }: QProps) {
  const looksLikeCode = (o: string) => /[;{}()=]|=>/.test(o) && o.length > 20;
  return (
    <article className="item">
      {tags}
      <div className="prompt"><Markdown source={q.prompt} /></div>
      {q.code && <CodeBlock code={q.code} lang={q.lang ?? 'csharp'} />}

      {q.type === 'mcq' && (
        <div className="options">
          {q.options!.map((o, k) => {
            const cls = answer ? (k === answer.expected ? 'correct' : k === selected ? 'wrong' : '') : '';
            return (
              <button key={k} className={`option ${cls}`} type="button" disabled={!!answer || busy} onClick={() => onAnswer(k)}>
                <kbd>{LETTERS[k]}</kbd><span>{looksLikeCode(o) ? <code>{o}</code> : <Inline text={o} />}</span>
              </button>
            );
          })}
        </div>
      )}
      {q.type === 'tf' && (
        <div className="options tf">
          {[true, false].map((v) => {
            const cls = answer ? (v === answer.expected ? 'correct' : v === selected ? 'wrong' : '') : '';
            return (
              <button key={String(v)} className={`option ${cls}`} type="button" disabled={!!answer || busy} onClick={() => onAnswer(v)}>
                <kbd>{v ? 'V' : 'F'}</kbd><span>{v ? 'Verdadero' : 'Falso'}</span>
              </button>
            );
          })}
        </div>
      )}
      {q.type === 'fill' && (
        <>
          <form className="fill" onSubmit={(e) => { e.preventDefault(); if (fill.trim()) onAnswer(fill.trim()); }}>
            <input autoFocus value={fill} onChange={(e) => setFill(e.target.value)} disabled={!!answer} spellCheck={false}
              placeholder="Escribe tu respuesta…" aria-label="Respuesta" className={answer ? (answer.correct ? 'correct' : 'wrong') : ''} />
            {!answer && <button className="btn" type="submit" disabled={busy}>Comprobar <kbd>Enter</kbd></button>}
          </form>
          {answer && !answer.correct && <p className="expected">Respuesta esperada: <code>{String(([] as unknown[]).concat(answer.expected)[0])}</code></p>}
        </>
      )}

      {answer && (
        <>
          <div className={`feedback ${answer.correct ? 'ok' : 'ko'}`} role="status">
            <strong>{answer.correct ? '✓ ¡Correcto!' : '✗ Incorrecto'}</strong>
            <Markdown source={answer.explanation} />
            <p className="muted small">Próximo repaso en {formatInterval(answer.next.interval)}</p>
          </div>
          <button className="btn wide" type="button" onClick={onNext}>{isLast ? 'Ver resultados' : 'Siguiente'} <kbd>Enter</kbd></button>
        </>
      )}
    </article>
  );
}
