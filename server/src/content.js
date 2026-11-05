import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CONTENT_DIR = join(__dirname, '..', 'content', 'chapters');

const QUESTION_TYPES = new Set(['mcq', 'tf', 'fill']);

/** Valida un capítulo y devuelve la lista de errores (vacía si es válido). */
export function validateChapter(ch, file = '?') {
  const errs = [];
  const at = (m) => errs.push(`${file}: ${m}`);
  for (const k of ['id', 'number', 'title', 'summary', 'level']) if (ch[k] === undefined) at(`falta "${k}"`);
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
  return errs;
}

/** Carga todos los capítulos YAML y construye índices para acceso rápido. */
export function loadContent(dir = CONTENT_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort();
  const chapters = [];
  const errors = [];
  for (const f of files) {
    const ch = yaml.load(readFileSync(join(dir, f), 'utf8'));
    errors.push(...validateChapter(ch, f));
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
  }
  return { chapters, chapterById, items };
}

/** Versión pública de una pregunta: nunca se envía la respuesta al cliente antes de contestar. */
export function publicQuestion(itemId, q, chapterId) {
  const out = { id: itemId, kind: 'question', chapterId, type: q.type, prompt: q.prompt };
  if (q.code) out.code = q.code;
  if (q.options) out.options = q.options;
  if (q.tag) out.tag = q.tag;
  return out;
}

export function publicCard(itemId, c, chapterId) {
  return { id: itemId, kind: 'card', chapterId, front: c.front, back: c.back, code: c.code };
}

const normalize = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/;$/, '');

/** Corrige una respuesta. Devuelve { correct, expected } */
export function grade(q, answer) {
  switch (q.type) {
    case 'mcq':
      return { correct: Number(answer) === q.answer, expected: q.answer };
    case 'tf':
      return { correct: (answer === true || answer === 'true') === q.answer, expected: q.answer };
    case 'fill': {
      const accepted = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(normalize);
      return { correct: accepted.includes(normalize(answer ?? '')), expected: q.answer };
    }
    default:
      throw new Error('tipo desconocido');
  }
}
