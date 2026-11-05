import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteRepo } from '../src/repo/sqlite.js';
import { loadContent, grade, gradeDrill, stripComments } from '../src/content.js';
import { createApp } from '../src/app.js';
import { schedule, initialState } from '../src/srs.js';
import { computeStreak } from '../src/routes/stats.js';
import { createTicketSigner } from '../src/routes/drills.js';

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
  assert.throws(() => schedule(null, 5), RangeError);
});

test('Corrección de respuestas por tipo', () => {
  assert.equal(grade({ type: 'mcq', answer: 1 }, 1).correct, true);
  assert.equal(grade({ type: 'mcq', answer: 1 }, '0').correct, false);
  assert.equal(grade({ type: 'tf', answer: false }, false).correct, true);
  assert.equal(grade({ type: 'fill', answer: ['readonly'] }, '  ReadOnly ').correct, true);
  assert.equal(grade({ type: 'fill', answer: 'static' }, 'const').correct, false);
});

test('Drills: checks, prohibidos, comentarios y tiempo', () => {
  const d = {
    lang: 'plsql', timeLimit: 60,
    checks: [
      { pattern: 'BULK\\s+COLLECT', hint: 'bulk' },
      { pattern: 'FORALL', hint: 'forall' },
      { pattern: 'COMMIT', hint: 'sin commit', forbid: true },
    ],
  };
  const good = 'SELECT id BULK COLLECT INTO t FROM x; FORALL i IN 1..t.COUNT DELETE y WHERE id = t(i);';
  assert.deepEqual(
    [gradeDrill(d, good, 20_000).srsGrade, gradeDrill(d, good, 40_000).srsGrade, gradeDrill(d, good, 90_000).srsGrade],
    [3, 2, 1],
  );
  assert.equal(gradeDrill(d, good + ' COMMIT;', 10_000).passed, 2);
  // Escribir la palabra en un comentario no cuenta
  assert.equal(gradeDrill(d, '-- BULK COLLECT\n/* FORALL */', 1000).passed, 1);
  assert.equal(stripComments('var u = "https://x"; // nota', 'csharp').includes('https://x'), true);
});

test('Ticket de drill: firmado, ligado a usuario e item', () => {
  const s = createTicketSigner('secreto');
  const t = s.issue(7, 'ch01.d1', 1000);
  assert.equal(s.verify(t, 7, 'ch01.d1'), 1000);
  assert.equal(s.verify(t, 8, 'ch01.d1'), null);
  assert.equal(s.verify(t.slice(0, -2) + 'xx', 7, 'ch01.d1'), null);
});

test('Racha de días consecutivos', () => {
  const today = new Date('2026-03-10T12:00:00Z');
  assert.equal(computeStreak(['2026-03-10', '2026-03-09', '2026-03-08'], today), 3);
  assert.equal(computeStreak(['2026-03-09', '2026-03-08'], today), 2);
  assert.equal(computeStreak(['2026-03-07'], today), 0);
});

test('El contenido del curso es válido y cubre todos los tracks', () => {
  const c = loadContent();
  assert.ok(c.chapters.length >= 12);
  for (const t of Object.keys(c.tracks)) assert.ok(c.chapters.some((ch) => ch.track === t), `sin capítulos en ${t}`);
});

// ---------- Integración HTTP ----------

let server, base, cookie, bearer;
const content = loadContent();
const api = async (method, path, body, auth = 'cookie') => {
  const headers = { 'content-type': 'application/json' };
  if (auth === 'cookie' && cookie) headers.cookie = cookie;
  if (auth === 'bearer') headers.authorization = `Bearer ${bearer}`;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json(), res };
};
const firstDrill = () => [...content.items].find(([, it]) => it.kind === 'drill');

before(async () => {
  const app = createApp({ repo: createSqliteRepo(':memory:'), content, staticDir: '/nonexistent' });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('Registro, login, cookie y Bearer', async () => {
  const anon = await api('GET', '/api/chapters', null, 'none');
  assert.equal(anon.status, 401);
  assert.match(anon.res.headers.get('www-authenticate'), /^Bearer/);
  assert.equal((await api('GET', '/api/auth/me', null, 'none')).data.user, null);

  assert.equal((await api('POST', '/api/auth/register', { email: 'x', name: 'A', password: '1' }, 'none')).status, 400);
  const reg = await api('POST', '/api/auth/register', { email: 'dev@test.io', name: 'Dev', password: 'supersecreto' }, 'none');
  assert.equal(reg.status, 201);
  assert.equal(reg.data.tokenType, 'Bearer');
  cookie = reg.res.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('POST', '/api/auth/register', { email: 'DEV@test.io', name: 'Dev', password: 'supersecreto' }, 'none')).status, 409);
  assert.equal((await api('POST', '/api/auth/login', { email: 'dev@test.io', password: 'nope' }, 'none')).status, 401);

  const login = await api('POST', '/api/auth/login', { email: 'dev@test.io', password: 'supersecreto' }, 'none');
  bearer = login.data.token;
  const me = await api('GET', '/api/auth/me', null, 'bearer');
  assert.equal(me.data.user.email, 'dev@test.io');
  assert.equal(me.data.authVia, 'bearer');

  bearer = 'sd_invalido';
  const bad = await api('GET', '/api/stats', null, 'bearer');
  assert.equal(bad.status, 401);
  assert.match(bad.res.headers.get('www-authenticate'), /invalid_token/);
});

test('Tokens de API personales: crear, usar, listar y revocar', async () => {
  const t = await api('POST', '/api/auth/tokens', { label: 'Postman', days: 7 });
  assert.equal(t.status, 201);
  assert.match(t.data.token, /^sdapi_/);
  bearer = t.data.token;
  assert.equal((await api('GET', '/api/chapters', null, 'bearer')).status, 200);
  const list = await api('GET', '/api/auth/tokens');
  assert.equal(list.data.tokens.length, 1);
  assert.equal(list.data.tokens[0].token, undefined, 'nunca se devuelve el token de nuevo');
  assert.equal((await api('DELETE', `/api/auth/tokens/${t.data.id}`)).status, 200);
  assert.equal((await api('GET', '/api/chapters', null, 'bearer')).status, 401);
});

test('Capítulos: tracks y preguntas/drills sin respuesta', async () => {
  const list = await api('GET', '/api/chapters');
  assert.equal(list.data.chapters.length, content.chapters.length);
  assert.equal(list.data.tracks.length, 4);
  const [drillId, drill] = firstDrill();
  const ch = await api('GET', `/api/chapters/${drill.chapterId}`);
  for (const q of ch.data.chapter.questions) assert.equal(q.answer, undefined);
  const d = ch.data.chapter.drills.find((x) => x.id === drillId);
  assert.equal(d.solution, undefined);
  assert.equal(d.checks, undefined);
  assert.ok(ch.data.chapter.snippets.length > 0);
  await api('POST', `/api/chapters/${drill.chapterId}/sections/s1/read`, {});
  assert.deepEqual((await api('GET', `/api/chapters/${drill.chapterId}`)).data.chapter.readSections, ['s1']);
});

test('Responder preguntas y calificar tarjetas actualiza SM-2 y estadísticas', async () => {
  const ok = await api('POST', '/api/review/answer', { itemId: 'ch01.q1', answer: 0 });
  assert.equal(ok.data.correct, true);
  assert.equal(ok.data.next.interval, 1);
  const ko = await api('POST', '/api/review/answer', { itemId: 'ch01.q2', answer: 0 });
  assert.equal(ko.data.correct, false);
  const card = await api('POST', '/api/review/card', { itemId: 'ch01.c1', grade: 3 });
  assert.equal(card.data.next.interval, 3);
  assert.equal((await api('POST', '/api/review/card', { itemId: 'ch01.q1', grade: 2 })).status, 404);
  assert.equal((await api('POST', '/api/review/card', { itemId: 'ch01.c1', grade: 9 })).status, 400);

  const mistakes = await api('GET', '/api/review/queue?mode=mistakes');
  assert.deepEqual(mistakes.data.items.map((i) => i.id), ['ch01.q2']);
  const stats = await api('GET', '/api/stats');
  assert.equal(stats.data.totals.attempts, 3);
  assert.equal(stats.data.streak, 1);
  assert.equal(stats.data.weak[0].id, 'ch01.q2');
  assert.equal(stats.data.tracks.length, 4);
});

test('Cola filtrada por track y por tipo', async () => {
  const q = await api('GET', '/api/review/queue?track=csharp&limit=5&newLimit=5');
  assert.equal(q.data.items.length, 5);
  assert.ok(q.data.items.every((i) => content.chapterById.get(i.chapterId).track === 'csharp'));
  const d = await api('GET', '/api/review/queue?mode=drills&limit=50&newLimit=50');
  assert.ok(d.data.items.length > 0 && d.data.items.every((i) => i.kind === 'drill'));
});

test('Drill cronometrado: start → submit con la solución de referencia', async () => {
  const [drillId, drill] = firstDrill();
  assert.equal((await api('POST', `/api/drills/${drillId}/submit`, { ticket: 'falso', code: 'x' })).status, 400);
  const start = await api('POST', `/api/drills/${drillId}/start`, {});
  assert.equal(start.data.timeLimit, drill.data.timeLimit);
  const sub = await api('POST', `/api/drills/${drillId}/submit`, { ticket: start.data.ticket, code: drill.data.solution });
  assert.equal(sub.status, 200);
  assert.equal(sub.data.passed, sub.data.total);
  assert.equal(sub.data.correct, true);
  assert.equal(sub.data.srsGrade, 3);
  assert.equal(sub.data.solution, drill.data.solution);

  const start2 = await api('POST', `/api/drills/${drillId}/start`, {});
  const fail = await api('POST', `/api/drills/${drillId}/submit`, { ticket: start2.data.ticket, code: '' });
  assert.equal(fail.data.correct, false);
  assert.equal(fail.data.srsGrade, 0);

  const list = await api('GET', '/api/drills?track=' + content.chapterById.get(drill.chapterId).track);
  assert.ok(list.data.items.find((x) => x.id === drillId).bestMs !== null);
  const hist = await api('GET', '/api/drills/history');
  assert.equal(hist.data.history.length, 2);
  const session = await api('GET', '/api/drills/session?count=3');
  assert.equal(session.data.items.length, 3);
});

test('Snippets y atajos filtrables', async () => {
  const all = await api('GET', '/api/snippets');
  assert.ok(all.data.snippets.length > 0 && all.data.shortcuts.length > 0);
  const bash = await api('GET', '/api/snippets?lang=bash');
  assert.ok(bash.data.snippets.every((s) => s.lang === 'bash'));
  const q = await api('GET', '/api/snippets?q=F12');
  assert.ok(q.data.shortcuts.some((k) => k.keys.includes('F12')));
});

test('Tarjetas propias entran en la cola de repaso', async () => {
  const c = await api('POST', '/api/custom-cards', { chapterId: 'ch04', front: '¿Qué es un closure?', back: 'Una función con estado capturado' });
  assert.equal(c.status, 201);
  const q = await api('GET', '/api/review/queue?mode=cards&chapter=ch04&limit=50&newLimit=50');
  assert.ok(q.data.items.some((i) => i.id === c.data.card.id && i.custom));
  assert.equal((await api('POST', '/api/review/card', { itemId: c.data.card.id, grade: 2 })).status, 200);
  const upd = await api('PUT', `/api/custom-cards/${c.data.card.id}`, { chapterId: 'ch05', front: 'Nuevo anverso', back: 'x' });
  assert.equal(upd.data.card.chapterId, 'ch05');
  assert.equal((await api('DELETE', `/api/custom-cards/${c.data.card.id}`)).status, 200);
  assert.equal((await api('DELETE', `/api/custom-cards/${c.data.card.id}`)).status, 404);
});

test('Examen cronometrado: crear, entregar y no repetir entrega', async () => {
  const ex = await api('POST', '/api/exams', { chapters: ['ch05'], count: 5, minutes: 5 });
  assert.equal(ex.status, 201);
  const answers = Object.fromEntries(ex.data.exam.items.map((i) => [i.id, i.type === 'tf' ? true : i.type === 'fill' ? 'x' : 0]));
  const sub = await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers });
  assert.equal(sub.data.result.total, 5);
  assert.equal((await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers })).status, 409);
  assert.equal((await api('GET', '/api/exams')).data.exams.length, 1);
  assert.equal((await api('POST', '/api/exams', { track: 'csharp', count: 5 })).status, 201);
});

test('Búsqueda incluye teoría, snippets y atajos', async () => {
  const r = await api('GET', '/api/chapters/search?q=ConfigureAwait');
  assert.ok(r.data.results.some((x) => x.chapterId === 'ch06'));
  const k = await api('GET', '/api/chapters/search?q=Shift%2BF12');
  assert.ok(k.data.results.some((x) => x.type === 'shortcut'));
});

test('Reiniciar progreso de un capítulo', async () => {
  await api('DELETE', '/api/stats/progress?chapter=ch01');
  const ch = await api('GET', '/api/chapters/ch01');
  assert.equal(ch.data.chapter.seen, 0);
  assert.equal((await api('DELETE', '/api/stats/progress?chapter=nope')).status, 404);
});
