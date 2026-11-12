import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CONTENT_DIR = join(__dirname, '..', 'content', 'chapters');

export const TRACKS = {
  csharp: { id: 'csharp', title: 'C# y .NET', order: 1 },
  db: { id: 'db', title: 'Bases de datos y PL/SQL', order: 2 },
  react: { id: 'react', title: 'React y Next.js', order: 3 },
  api: { id: 'api', title: 'APIs: HTTP, curl, Postman y APIM', order: 4 },
};
export const LANGS = new Set(['csharp', 'plsql', 'sql', 'tsx', 'ts', 'js', 'bash', 'json', 'xml', 'http', 'dockerfile', 'text']);
const QUESTION_TYPES = new Set(['mcq', 'tf', 'fill']);
const MAX_CODE = 20_000;

/** Valida un capítulo y devuelve la lista de errores (vacía si es válido). */
export function validateChapter(ch, file = '?') {
  const errs = [];
  const at = (m) => errs.push(`${file}: ${m}`);
  for (const k of ['id', 'number', 'title', 'summary', 'level', 'track']) if (ch[k] === undefined) at(`falta "${k}"`);
  if (ch.track && !TRACKS[ch.track]) at(`track inválido "${ch.track}"`);
  if (!Array.isArray(ch.sections) || ch.sections.length === 0) at('sections vacío');
  if (!Array.isArray(ch.cards) || ch.cards.length === 0) at('cards vacío');
  if (!Array.isArray(ch.questions) || ch.questions.length === 0) at('questions vacío');

  const ids = new Set();
  const uniq = (id, where) => {
    if (!id) return at(`${where} sin id`);
    if (ids.has(id)) at(`id duplicado "${id}"`);
    ids.add(id);
  };
  for (const s of ch.sections ?? []) {
    uniq(s.id, 'sección');
    if (!s.title || !s.body) at(`sección ${s.id} sin title/body`);
  }
  for (const c of ch.cards ?? []) {
    uniq(c.id, 'tarjeta');
    if (!c.front || !c.back) at(`tarjeta ${c.id} sin front/back`);
  }
  for (const q of ch.questions ?? []) {
    uniq(q.id, 'pregunta');
    if (!QUESTION_TYPES.has(q.type)) at(`pregunta ${q.id}: tipo inválido "${q.type}"`);
    if (!q.prompt) at(`pregunta ${q.id} sin prompt`);
    if (!q.explanation) at(`pregunta ${q.id} sin explanation`);
    if (q.lang && !LANGS.has(q.lang)) at(`pregunta ${q.id}: lang inválido`);
    if (q.type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length < 2) at(`pregunta ${q.id}: mcq necesita >= 2 options`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options?.length ?? 0))
        at(`pregunta ${q.id}: answer fuera de rango`);
    }
    if (q.type === 'tf' && typeof q.answer !== 'boolean') at(`pregunta ${q.id}: tf necesita answer booleano`);
    if (q.type === 'fill') {
      const a = Array.isArray(q.answer) ? q.answer : [q.answer];
      if (a.length === 0 || a.some((x) => typeof x !== 'string' && typeof x !== 'number'))
        at(`pregunta ${q.id}: fill necesita answer string o lista de strings`);
    }
  }
  for (const d of ch.drills ?? []) {
    uniq(d.id, 'drill');
    if (!d.title || !d.prompt || !d.solution) at(`drill ${d.id} sin title/prompt/solution`);
    if (!LANGS.has(d.lang)) at(`drill ${d.id}: lang inválido "${d.lang}"`);
    if (!Number.isInteger(d.timeLimit) || d.timeLimit < 30 || d.timeLimit > 1800) at(`drill ${d.id}: timeLimit 30..1800 s`);
    if (!Array.isArray(d.checks) || d.checks.length === 0) at(`drill ${d.id} sin checks`);
    for (const c of d.checks ?? []) {
      if (!c.pattern || !c.hint) { at(`drill ${d.id}: check sin pattern/hint`); continue; }
      let re;
      try { re = compileCheck(c); } catch (e) { at(`drill ${d.id}: regex inválida ${c.pattern} (${e.message})`); continue; }
      // La solución de referencia debe superar sus propias verificaciones
      const ok = re.test(stripComments(d.solution, d.lang));
      if (c.forbid ? ok : !ok) at(`drill ${d.id}: la solución no cumple el check "${c.hint}"`);
    }
  }
  for (const s of ch.snippets ?? []) {
    uniq(s.id, 'snippet');
    if (!s.title || !s.code) at(`snippet ${s.id} sin title/code`);
    if (!LANGS.has(s.lang)) at(`snippet ${s.id}: lang inválido "${s.lang}"`);
  }
  for (const [i, k] of (ch.shortcuts ?? []).entries()) {
    if (!k.keys || !k.action || !k.tool) at(`atajo #${i + 1} sin keys/action/tool`);
  }
  return errs;
}

export function compileCheck(c) {
  return new RegExp(c.pattern, c.flags ?? 'im');
}

/** Quita comentarios para que escribir la palabra clave en un comentario no cuente. */
export function stripComments(code, lang) {
  const s = String(code);
  if (lang === 'plsql' || lang === 'sql') return s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (lang === 'bash') return s.replace(/(^|\s)#[^\n]*/g, '$1');
  if (lang === 'xml') return s.replace(/<!--[\s\S]*?-->/g, '');
  if (['csharp', 'tsx', 'ts', 'js'].includes(lang)) return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return s;
}

/** Carga todos los capítulos YAML y construye índices para acceso rápido. */
export function loadContent(dir = CONTENT_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort();
  const chapters = [];
  const errors = [];
  for (const f of files) {
    let ch;
    try { ch = yaml.load(readFileSync(join(dir, f), 'utf8')); } catch (e) { errors.push(`${f}: YAML inválido: ${e.message}`); continue; }
    errors.push(...validateChapter(ch, f));
    ch.drills ??= [];
    ch.snippets ??= [];
    ch.shortcuts ??= [];
    chapters.push(ch);
  }
  if (errors.length) throw new Error('Contenido inválido:\n' + errors.join('\n'));
  chapters.sort((a, b) => a.number - b.number);

  const chapterById = new Map();
  const items = new Map(); // itemId global -> { kind, chapterId, data }
  for (const ch of chapters) {
    if (chapterById.has(ch.id)) throw new Error(`Capítulo duplicado ${ch.id}`);
    chapterById.set(ch.id, ch);
    for (const c of ch.cards) items.set(`${ch.id}.${c.id}`, { kind: 'card', chapterId: ch.id, data: c });
    for (const q of ch.questions) items.set(`${ch.id}.${q.id}`, { kind: 'question', chapterId: ch.id, data: q });
    for (const d of ch.drills) items.set(`${ch.id}.${d.id}`, { kind: 'drill', chapterId: ch.id, data: d });
  }
  return { chapters, chapterById, items, tracks: TRACKS };
}

/** Versión pública de una pregunta: nunca se envía la respuesta antes de contestar. */
export function publicQuestion(itemId, q, chapterId) {
  const out = { id: itemId, kind: 'question', chapterId, type: q.type, prompt: q.prompt };
  if (q.code) out.code = q.code;
  if (q.lang) out.lang = q.lang;
  if (q.options) out.options = q.options;
  if (q.tag) out.tag = q.tag;
  return out;
}

export function publicCard(itemId, c, chapterId) {
  return { id: itemId, kind: 'card', chapterId, front: c.front, back: c.back, code: c.code, lang: c.lang };
}

/** Drill público: enunciado, código inicial y pistas de lo que se verificará, sin la solución. */
export function publicDrill(itemId, d, chapterId) {
  return {
    id: itemId, kind: 'drill', chapterId, lang: d.lang, title: d.title, prompt: d.prompt,
    starter: d.starter ?? '', timeLimit: d.timeLimit, checkCount: d.checks.length,
  };
}

const normalize = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/;$/, '');

/** Corrige una respuesta. Devuelve { correct, expected } */
export function grade(q, answer) {
  switch (q.type) {
    case 'mcq': {
      // Number(null), Number('') y Number([]) valen 0: sin esta comprobación, una respuesta vacía acertaría la opción A
      const n = typeof answer === 'number' ? answer : typeof answer === 'string' && /^\d+$/.test(answer.trim()) ? Number(answer) : NaN;
      return { correct: n === q.answer, expected: q.answer };
    }
    case 'tf': {
      const b = answer === true || answer === 'true' ? true : answer === false || answer === 'false' ? false : null;
      return { correct: b !== null && b === q.answer, expected: q.answer };
    }
    case 'fill': {
      const accepted = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(normalize);
      return { correct: accepted.includes(normalize(answer ?? '')), expected: q.answer };
    }
    default:
      throw new Error('tipo desconocido');
  }
}

/**
 * Corrige un drill de código cronometrado con verificaciones estáticas (regex sobre el código sin comentarios).
 * Calificación SM-2: todo correcto y en menos de la mitad del tiempo → 3 (Fácil); todo correcto a tiempo → 2;
 * todo correcto fuera de tiempo o ≥ 70 % de checks → 1; resto → 0.
 */
export function gradeDrill(d, code, elapsedMs, graceMs = 0) {
  const src = stripComments(String(code ?? '').slice(0, MAX_CODE), d.lang);
  const results = d.checks.map((c) => {
    const hit = compileCheck(c).test(src);
    return { hint: c.hint, ok: c.forbid ? !hit : hit };
  });
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  const limitMs = d.timeLimit * 1000;
  // graceMs absorbe la latencia de red: el cliente entrega al llegar a 0, pero el servidor lo recibe algo después
  const inTime = elapsedMs <= limitMs + graceMs;
  let srsGrade = 0;
  if (passed === total) srsGrade = !inTime ? 1 : elapsedMs <= limitMs / 2 ? 3 : 2;
  else if (passed / total >= 0.7) srsGrade = 1;
  return { results, passed, total, inTime, srsGrade, correct: passed === total && inTime };
}
