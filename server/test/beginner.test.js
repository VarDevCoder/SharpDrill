import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent, grade } from '../src/content.js';
import { createSqliteRepo } from '../src/repo/sqlite.js';
import { createApp } from '../src/app.js';

const content = loadContent();
const basics = content.chapters.filter((ch) => ch.track === 'csharp-basics');

test('C# inicial: secuencia independiente, práctica sin drills y respuestas corregibles', () => {
  assert.deepEqual(basics.map((ch) => ch.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(content.chapters[0].id, 'cs-start-01');
  assert.equal(content.chapterById.get('ch01').title, 'CLR y sistema de tipos');
  for (const ch of basics) {
    assert.equal(ch.level, 'Inicial');
    assert.equal(ch.drills.length, 0);
    assert.ok(ch.sections.length >= 4 && ch.cards.length >= 5 && ch.questions.length >= 6);
    for (const q of ch.questions) assert.equal(grade(q, q.answer).correct, true, `${ch.id}.${q.id}`);
  }
});

test('C# inicial: API aislada, progreso persistente entre reinicios y por cuenta', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sharpdrill-beginner-'));
  const dbFile = join(dir, 'progress.db');
  let repo, server, base;
  const start = async () => {
    repo = createSqliteRepo(dbFile);
    const app = createApp({ repo, content, staticDir: '/nonexistent' });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  };
  const stop = async () => {
    if (server) { await new Promise((resolve) => server.close(resolve)); server = null; }
    if (repo) { await repo.close(); repo = null; }
  };
  t.after(async () => {
    await stop();
    // Solo archivos del directorio temporal creado por esta prueba; sin borrado recursivo.
    for (const file of readdirSync(dir)) unlinkSync(join(dir, file));
    rmdirSync(dir);
  });
  const request = async (method, path, token, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(res.ok, `${method} ${path}: ${res.status}`);
    return res.json();
  };
  await start();
  const register = (email) => request('POST', '/auth/register', null, { email, name: 'Estudiante', password: 'local-test-password' });
  const first = await register('first@example.test');
  for (const [i, ch] of basics.entries()) {
    const { chapter } = await request('GET', `/chapters/${ch.id}`, first.token);
    assert.equal(chapter.prev, basics[i - 1]?.id ?? null);
    assert.equal(chapter.next, basics[i + 1]?.id ?? null);
    assert.equal(chapter.drills.length, 0);
    assert.ok(chapter.questions.every((q) => !('answer' in q) && !('explanation' in q)));
  }
  assert.equal((await request('GET', '/chapters/ch01', first.token)).chapter.prev, null);
  const practice = await request('GET', '/review/practice?track=csharp-basics&count=50', first.token);
  assert.equal(practice.items.length, 36);
  assert.ok(practice.items.every((q) => q.chapterId.startsWith('cs-start-') && !('timeLimit' in q)));
  const queue = await request('GET', '/review/queue?track=csharp-basics', first.token);
  assert.ok(queue.items.length > 0 && queue.items.every((q) => q.chapterId.startsWith('cs-start-')));

  await request('POST', '/chapters/cs-start-01/sections/s1/read', first.token, { read: true });
  const answer = await request('POST', '/review/answer', first.token, { itemId: 'cs-start-01.q1', answer: 1 });
  assert.equal(answer.correct, true);
  assert.ok(answer.explanation && answer.next);
  await request('POST', '/review/card', first.token, { itemId: 'cs-start-01.c1', grade: 2 });
  await stop();
  await start();

  const saved = await request('GET', '/chapters/cs-start-01', first.token);
  assert.deepEqual(saved.chapter.readSections, ['s1']);
  assert.equal(saved.chapter.seen, 2);
  assert.ok(saved.chapter.mastery > 0);
  const stats = await request('GET', '/stats', first.token);
  assert.equal(stats.totals.attempts, 2);
  assert.equal(stats.tracks.find((track) => track.id === 'csharp-basics').chapters, 6);

  const second = await register('second@example.test');
  const isolated = await request('GET', '/chapters/cs-start-01', second.token);
  assert.deepEqual(isolated.chapter.readSections, []);
  assert.equal(isolated.chapter.seen, 0);
  assert.equal(isolated.chapter.mastery, 0);
});
