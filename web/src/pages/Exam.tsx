import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync, useNow } from '../hooks';
import { ErrorBox, Loading } from '../components/ui';
import { CodeBlock, Inline, Markdown } from '../components/Markdown';
import { useToast } from '../components/Toast';
import { formatMs, TRACK_ICON } from '../lib/format';
import type { ChapterSummary, Exam, ExamResult, QuestionItem, Track } from '../types';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function ChapterPicker({ chapters, tracks, selected, onChange }: {
  chapters: ChapterSummary[]; tracks: Track[]; selected: string[]; onChange: (s: string[]) => void;
}) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const toggleTrack = (t: string) => {
    const ids = chapters.filter((c) => c.track === t).map((c) => c.id);
    const all = ids.every((id) => selected.includes(id));
    onChange(all ? selected.filter((x) => !ids.includes(x)) : [...new Set([...selected, ...ids])]);
  };
  return (
    <div className="picker">
      {tracks.map((t) => (
        <div key={t.id} className="picker-track">
          <button type="button" className="chip chip-track" onClick={() => toggleTrack(t.id)}>{TRACK_ICON[t.id]} {t.title}</button>
          <div className="chips">
            {chapters.filter((c) => c.track === t.id).map((c) => (
              <label key={c.id} className="chip">
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                <span>{String(c.number).padStart(2, '0')} · {c.title}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExamPage() {
  const toast = useToast();
  const chapters = useAsync(() => api.chapters(), []);
  const exams = useAsync(() => api.exams(), []);
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(20);
  const [minutes, setMinutes] = useState(20);
  const [exam, setExam] = useState<Exam | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);

  async function start() {
    try {
      const { exam: e } = await api.startExam({ chapters: selected, count, minutes });
      setResult(null);
      setExam(e);
    } catch (err) { toast((err as Error).message, 'error'); }
  }

  if (exam && !result) return <ExamRunner exam={exam} onDone={(r) => { setResult(r); exams.reload(); }} />;
  if (result) return <ExamResults r={result} onAgain={() => { setExam(null); setResult(null); }} />;
  if (chapters.loading) return <Loading />;
  if (chapters.error) return <ErrorBox error={chapters.error} onRetry={chapters.reload} />;

  return (
    <>
      <header className="page-head">
        <h1>Modo examen</h1>
        <p className="muted">Simula una entrevista técnica: tiempo limitado y sin feedback hasta entregar. Los resultados alimentan tu repaso espaciado.</p>
      </header>
      <section className="card">
        <h2>Configura tu examen</h2>
        <ChapterPicker chapters={chapters.data!.chapters} tracks={chapters.data!.tracks} selected={selected} onChange={setSelected} />
        <div className="row">
          <label>Preguntas <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[10, 20, 30, 40].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>Minutos <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{[5, 10, 20, 30, 45].map((n) => <option key={n}>{n}</option>)}</select></label>
          <button className="btn" type="button" onClick={start}>Comenzar examen</button>
        </div>
      </section>
      <section className="card">
        <h2>Historial</h2>
        {exams.data?.exams.length ? (
          <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Capítulos</th><th>Resultado</th></tr></thead><tbody>
            {exams.data.exams.map((x) => (
              <tr key={x.id}>
                <td>{new Date(x.finishedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{x.chapters.length === chapters.data!.chapters.length ? 'Todos' : x.chapters.map((c) => c.replace('ch', '')).join(', ')}</td>
                <td><strong>{x.score}/{x.total}</strong> ({Math.round((x.score / x.total) * 100)}%)</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <p className="muted">Todavía no has hecho ningún examen.</p>}
      </section>
    </>
  );
}

function ExamRunner({ exam, onDone }: { exam: Exam; onDone: (r: ExamResult) => void }) {
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const sent = useRef(false);
  const deadline = Date.parse(exam.startedAt) + exam.timeLimit * 1000;
  const now = useNow(500);
  const left = deadline - now;
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const submit = useCallback(async (force = false) => {
    if (sent.current) return;
    const missing = exam.total - Object.keys(answersRef.current).length;
    if (!force && missing > 0 && !confirm(`Te faltan ${missing} preguntas. ¿Entregar igualmente?`)) return;
    sent.current = true;
    try { onDone((await api.submitExam(exam.id, answersRef.current)).result); }
    catch (e) { sent.current = false; toast((e as Error).message, 'error'); }
  }, [exam, onDone, toast]);

  useEffect(() => { if (left <= 0) { toast('¡Tiempo! Entregando examen…', 'warn'); submit(true); } }, [left, submit, toast]);

  const set = (id: string, v: unknown) => setAnswers((a) => {
    const n = { ...a };
    if (v === '' || v === null) delete n[id]; else n[id] = v;
    return n;
  });

  return (
    <>
      <div className="exam-bar card">
        <strong>Examen</strong>
        <span>{Object.keys(answers).length} / {exam.total} respondidas</span>
        <span className={`timer ${left < 60_000 ? 'urgent' : ''}`}>{formatMs(left)}</span>
        <button className="btn small" type="button" onClick={() => submit()}>Entregar</button>
      </div>
      {exam.items.map((q, i) => <ExamQuestion key={q.id} q={q} n={i + 1} value={answers[q.id]} onChange={(v) => set(q.id, v)} />)}
      <div className="row center"><button className="btn" type="button" onClick={() => submit()}>Entregar examen</button></div>
    </>
  );
}

function ExamQuestion({ q, n, value, onChange }: { q: QuestionItem; n: number; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <article className="card item exam-q">
      <div className="tags"><span className="tag">Pregunta {n}</span>{q.tag && <span className="tag tag-q">{q.tag}</span>}</div>
      <div className="prompt"><Markdown source={q.prompt} /></div>
      {q.code && <CodeBlock code={q.code} lang={q.lang ?? 'csharp'} />}
      <div className="options">
        {q.type === 'mcq' && q.options!.map((o, k) => (
          <label key={k} className="option radio">
            <input type="radio" name={q.id} checked={value === k} onChange={() => onChange(k)} />
            <kbd>{LETTERS[k]}</kbd><span><Inline text={o} /></span>
          </label>
        ))}
        {q.type === 'tf' && [true, false].map((v) => (
          <label key={String(v)} className="option radio">
            <input type="radio" name={q.id} checked={value === v} onChange={() => onChange(v)} />
            <span>{v ? 'Verdadero' : 'Falso'}</span>
          </label>
        ))}
        {q.type === 'fill' && <input className="fill-input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder="Tu respuesta" spellCheck={false} />}
      </div>
    </article>
  );
}

function ExamResults({ r, onAgain }: { r: ExamResult; onAgain: () => void }) {
  const score = Math.round((r.score / r.total) * 100);
  const show = (q: QuestionItem, v: unknown) => {
    if (v === null || v === undefined) return <em>Sin responder</em>;
    if (q.type === 'mcq') return <>{LETTERS[v as number]}. <Inline text={q.options![v as number]} /></>;
    if (q.type === 'tf') return v ? 'Verdadero' : 'Falso';
    return <code>{String(v)}</code>;
  };
  return (
    <>
      <div className="card summary wide">
        <h2>Resultado del examen</h2>
        <div className="stats-row">
          <div className="stat"><span className="stat-n">{r.score}/{r.total}</span><span className="stat-l">aciertos</span></div>
          <div className="stat"><span className="stat-n">{score}%</span><span className="stat-l">{score >= 80 ? 'nivel senior 💪' : score >= 60 ? 'aprobado' : 'a reforzar'}</span></div>
          <div className="stat"><span className="stat-n">{Math.ceil(r.elapsed / 60)}</span><span className="stat-l">min</span></div>
        </div>
        {r.late && <p className="center warn">Entregado fuera de tiempo: las respuestas no puntúan.</p>}
        <div className="row center"><button className="btn" type="button" onClick={onAgain}>Nuevo examen</button><Link className="btn ghost" to="/repaso?modo=mistakes">Repasar fallos</Link></div>
      </div>
      {r.results.map((q, i) => (
        <article key={q.id} className={`card item ${q.correct ? 'res-ok' : 'res-ko'}`}>
          <div className="tags"><span className="tag">Pregunta {i + 1}</span><span className={`tag ${q.correct ? 'tag-ok' : 'tag-ko'}`}>{q.correct ? '✓ Correcta' : '✗ Incorrecta'}</span></div>
          <div className="prompt"><Markdown source={q.prompt} /></div>
          {q.code && <CodeBlock code={q.code} lang={q.lang ?? 'csharp'} />}
          <p><strong>Tu respuesta:</strong> {show(q, q.answer)}</p>
          {!q.correct && <p><strong>Correcta:</strong> {show(q, Array.isArray(q.expected) ? q.expected[0] : q.expected)}</p>}
          <div className={`feedback ${q.correct ? 'ok' : 'ko'}`}><Markdown source={q.explanation} /></div>
        </article>
      ))}
    </>
  );
}
