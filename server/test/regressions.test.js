import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepo } from '../src/repo/sqlite.js';
import { createTursoRepo } from '../src/repo/turso.js';
import { loadContent, grade, gradeDrill } from '../src/content.js';
import { createApp } from '../src/app.js';
import { createProgress } from '../src/progress.js';

test('Una respuesta vacía o de tipo inesperado nunca cuenta como acierto', () => {
  const mcq = { type: 'mcq', answer: 0 };
  for (const empty of [null, undefined, '', '  ', [], false, {}, 'abc']) assert.equal(grade(mcq, empty).correct, false, String(empty));
  assert.equal(grade(mcq, 0).correct, true);
  assert.equal(grade(mcq, '0').correct, true);

  const tf = { type: 'tf', answer: false };
  for (const empty of [null, undefined, '', 0, 'x']) assert.equal(grade(tf, empty).correct, false, String(empty));
  assert.equal(grade(tf, false).correct, true);
  assert.equal(grade(tf, 'false').correct, true);
});

test('Drill: el margen de red no penaliza la entrega automática al llegar a 0', () => {
  const d = { lang: 'sql', timeLimit: 60, checks: [{ pattern: 'SELECT', hint: 'select' }] };
  assert.equal(gradeDrill(d, 'SELECT 1', 61_000).inTime, false);
  assert.equal(gradeDrill(d, 'SELECT 1', 61_000, 5000).inTime, true);
  assert.equal(gradeDrill(d, 'SELECT 1', 66_000, 5000).inTime, false);
});

test('Los ids de tarjetas propias solo se aceptan en su forma canónica', async () => {
  const repo = createSqliteRepo(':memory:');
  const content = loadContent();
  const userId = await repo.createUser({ email: 'a@b.c', name: 'A', passwordHash: 'h' });
  const card = await repo.createCustomCard(userId, { chapterId: content.chapters[0].id, front: 'f', back: 'b' });
  const { resolveItem } = createProgress(repo, content);
  assert.equal((await resolveItem(userId, card.id)).custom, true);
  for (const alias of ['u.01', 'u.1e0', 'u.1.0', 'u. 1', 'u.']) assert.equal(await resolveItem(userId, alias), null, alias);
});

test('La actividad se agrupa por día en la zona horaria del usuario (SQLite y Turso)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sharpdrill-'));
  const repos = [createSqliteRepo(':memory:'), await createTursoRepo({ url: `file:${join(dir, 'tz.db').replaceAll('\\', '/')}` })];
  try {
    for (const repo of repos) {
      const id = await repo.createUser({ email: 'a@b.c', name: 'A', passwordHash: 'h' });
      // 01:30 UTC del día 11 = 22:30 del día 10 en UTC-3
      await repo.recordReview({ userId: id, itemId: 'ch01.q1', chapterId: 'ch01', grade: 2, mode: 'practice', correct: true, now: new Date('2026-03-11T01:30:00.000Z') });
      assert.deepEqual((await repo.activity(id, '2026-01-01')).map((a) => a.day), ['2026-03-11'], repo.kind);
      assert.deepEqual((await repo.activity(id, '2026-01-01', -180)).map((a) => a.day), ['2026-03-10'], repo.kind);
      assert.deepEqual(await repo.activeDays(id, -180), ['2026-03-10'], repo.kind);
      assert.deepEqual(await repo.activeDays(id, 600), ['2026-03-11'], repo.kind);
      assert.deepEqual(await repo.activity(id, '2026-03-11', -180), [], repo.kind);
    }
  } finally {
    for (const repo of repos) await repo.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows puede retener el archivo */ }
  }
});

test('API: /review/answer exige respuesta y /stats acepta tz', async () => {
  const app = createApp({ repo: createSqliteRepo(':memory:'), content: loadContent(), staticDir: '/nonexistent' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const reg = await fetch(`${base}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'tz@test.io', name: 'Tz', password: 'supersecreto' }),
    });
    const headers = { 'content-type': 'application/json', cookie: reg.headers.get('set-cookie').split(';')[0] };
    const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });

    assert.equal((await post('/api/review/answer', { itemId: 'ch01.q1' })).status, 400);
    assert.equal((await post('/api/review/answer', { itemId: 'ch01.q1', answer: null })).status, 400);
    assert.equal((await post('/api/review/answer', { itemId: 'ch01.q1', answer: 0 })).status, 200);

    for (const tz of ['-180', '840', 'abc', '']) {
      const stats = await (await fetch(`${base}/api/stats?tz=${tz}`, { headers })).json();
      assert.equal(stats.today, 1, `tz=${tz}`);
      assert.equal(stats.streak, 1, `tz=${tz}`);
      assert.equal(stats.activity.length, 84);
      assert.equal(stats.activity.at(-1).count, 1, `tz=${tz}`);
    }
  } finally {
    server.close();
  }
});
