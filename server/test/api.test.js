import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { loadContent, grade } from '../src/content.js';
import { createApp } from '../src/app.js';
import { schedule, initialState } from '../src/srs.js';
import { computeStreak } from '../src/routes/stats.js';

// ---------- Unitarios ----------

test('SM-2: fallo reprograma a 10 minutos y baja la facilidad', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const s = schedule(initialState(), 0, now);
  assert.equal(s.reps, 0);
  assert.equal(s.ease, 2.3);
  assert.equal(new Date(s.dueAt) - now, 10 * 60 * 1000);
});

test('SM-2: aciertos sucesivos aumentan el intervalo', () => {
  let s = schedule(null, 2);
  assert.equal(s.interval, 1);
  s = schedule(s, 2);
  assert.equal(s.interval, 3);
  s = schedule(s, 2);
  assert.ok(s.interval > 3);
  const lapse = schedule(s, 0);
  assert.equal(lapse.lapses, 1);
  assert.equal(lapse.reps, 0);
});

test('SM-2: rechaza calificaciones inválidas', () => {
  assert.throws(() => schedule(null, 5), RangeError);
});

test('Corrección de respuestas por tipo', () => {
  assert.equal(grade({ type: 'mcq', answer: 1 }, 1).correct, true);
  assert.equal(grade({ type: 'mcq', answer: 1 }, '0').correct, false);
  assert.equal(grade({ type: 'tf', answer: false }, false).correct, true);
  assert.equal(grade({ type: 'fill', answer: ['readonly'] }, '  ReadOnly ').correct, true);
  assert.equal(grade({ type: 'fill', answer: 'static' }, 'const').correct, false);
});

test('Racha de días consecutivos', () => {
  const today = new Date('2026-03-10T12:00:00Z');
  assert.equal(computeStreak(['2026-03-10', '2026-03-09', '2026-03-08'], today), 3);
  assert.equal(computeStreak(['2026-03-09', '2026-03-08'], today), 2); // hoy aún sin actividad
  assert.equal(computeStreak(['2026-03-07'], today), 0);
});

test('El contenido del curso es válido', () => {
  const c = loadContent();
  assert.ok(c.chapters.length >= 12);
  assert.ok(c.items.size > 150);
});

// ---------- Integración HTTP ----------

let server, base, cookie;
const api = async (method, path, body, auth = true) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(auth && cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data, res };
};

before(async () => {
  const app = createApp({ db: openDb(':memory:'), content: loadContent() });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('Registro, login y protección de rutas', async () => {
  assert.equal((await api('GET', '/api/chapters', null, false)).status, 401);
  assert.equal((await api('GET', '/api/auth/me', null, false)).data.user, null);

  const bad = await api('POST', '/api/auth/register', { email: 'x', name: 'A', password: '1' }, false);
  assert.equal(bad.status, 400);

  const reg = await api('POST', '/api/auth/register', { email: 'dev@test.io', name: 'Dev', password: 'supersecreto' }, false);
  assert.equal(reg.status, 201);
  cookie = reg.res.headers.get('set-cookie').split(';')[0];

  const dup = await api('POST', '/api/auth/register', { email: 'DEV@test.io', name: 'Dev', password: 'supersecreto' }, false);
  assert.equal(dup.status, 409);

  const wrong = await api('POST', '/api/auth/login', { email: 'dev@test.io', password: 'nope' }, false);
  assert.equal(wrong.status, 401);

  const me = await api('GET', '/api/auth/me');
  assert.equal(me.data.user.email, 'dev@test.io');
});

test('Capítulos: las preguntas no filtran la respuesta', async () => {
  const list = await api('GET', '/api/chapters');
  assert.equal(list.data.chapters.length, 12);
  const ch = await api('GET', '/api/chapters/ch01');
  assert.equal(ch.status, 200);
  for (const q of ch.data.chapter.questions) {
    assert.equal(q.answer, undefined);
    assert.equal(q.explanation, undefined);
  }
  const read = await api('POST', '/api/chapters/ch01/sections/s1/read', {});
  assert.equal(read.data.read, true);
  const again = await api('GET', '/api/chapters/ch01');
  assert.deepEqual(again.data.chapter.readSections, ['s1']);
});

test('Responder preguntas y calificar tarjetas actualiza SM-2 y estadísticas', async () => {
  const ok = await api('POST', '/api/review/answer', { itemId: 'ch01.q1', answer: 0 });
  assert.equal(ok.data.correct, true);
  assert.ok(ok.data.explanation.length > 0);
  assert.equal(ok.data.next.interval, 1);

  const ko = await api('POST', '/api/review/answer', { itemId: 'ch01.q2', answer: 0 });
  assert.equal(ko.data.correct, false);
  assert.equal(ko.data.expected, 1);

  const card = await api('POST', '/api/review/card', { itemId: 'ch01.c1', grade: 3 });
  assert.equal(card.data.next.interval, 3);

  assert.equal((await api('POST', '/api/review/card', { itemId: 'ch01.q1', grade: 2 })).status, 404);
  assert.equal((await api('POST', '/api/review/card', { itemId: 'ch01.c1', grade: 9 })).status, 400);

  const mistakes = await api('GET', '/api/review/queue?mode=mistakes');
  assert.deepEqual(mistakes.data.items.map((i) => i.id), ['ch01.q2']);

  const stats = await api('GET', '/api/stats');
  assert.equal(stats.data.totals.attempts, 3);
  assert.equal(stats.data.today, 3);
  assert.equal(stats.data.streak, 1);
  assert.equal(stats.data.weak[0].id, 'ch01.q2');
});

test('Cola de repaso incluye nuevos y respeta filtros', async () => {
  const q = await api('GET', '/api/review/queue?chapter=ch02&limit=5&newLimit=5');
  assert.equal(q.data.items.length, 5);
  assert.ok(q.data.items.every((i) => i.chapterId === 'ch02' && i.isNew));
  const cards = await api('GET', '/api/review/queue?mode=cards&chapter=ch03&limit=50&newLimit=50');
  assert.ok(cards.data.items.every((i) => i.kind === 'card'));
});

test('Tarjetas propias entran en la cola de repaso', async () => {
  const c = await api('POST', '/api/custom-cards', { chapterId: 'ch04', front: '¿Qué es un closure?', back: 'Una función con estado capturado' });
  assert.equal(c.status, 201);
  const q = await api('GET', '/api/review/queue?mode=cards&chapter=ch04&limit=50&newLimit=50');
  assert.ok(q.data.items.some((i) => i.id === c.data.card.id && i.custom));
  const g = await api('POST', '/api/review/card', { itemId: c.data.card.id, grade: 2 });
  assert.equal(g.status, 200);
  assert.equal((await api('DELETE', `/api/custom-cards/${c.data.card.id}`)).status, 200);
});

test('Examen cronometrado: crear, entregar y no repetir entrega', async () => {
  const ex = await api('POST', '/api/exams', { chapters: ['ch05'], count: 5, minutes: 5 });
  assert.equal(ex.status, 201);
  assert.equal(ex.data.exam.items.length, 5);
  const answers = Object.fromEntries(ex.data.exam.items.map((i) => [i.id, i.type === 'tf' ? true : i.type === 'fill' ? 'x' : 0]));
  const sub = await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers });
  assert.equal(sub.status, 200);
  assert.equal(sub.data.result.total, 5);
  assert.ok(sub.data.result.results.every((r) => 'explanation' in r));
  assert.equal((await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers })).status, 409);
  const hist = await api('GET', '/api/exams');
  assert.equal(hist.data.exams.length, 1);
});

test('Búsqueda en el temario', async () => {
  const r = await api('GET', '/api/chapters/search?q=ConfigureAwait');
  assert.ok(r.data.results.some((x) => x.chapterId === 'ch06'));
});
