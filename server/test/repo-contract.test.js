import { test } from 'node:test';
import assert from 'node:assert/strict';
import oracledb from 'oracledb';
import { createSqliteRepo } from '../src/repo/sqlite.js';
import { createOracleRepo } from '../src/repo/oracle.js';
import { createTursoRepo } from '../src/repo/turso.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Pool falso: registra las sentencias y devuelve respuestas predefinidas. No requiere Oracle. */
function fakePool(responder) {
  const calls = [];
  const conn = {
    async execute(sql, binds) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), binds });
      return responder(sql, binds) ?? { rows: [], outBinds: {} };
    },
    async close() {},
  };
  return { calls, pool: { getConnection: async () => conn, close: async () => {} } };
}

test('El repositorio Oracle implementa el mismo contrato que el de SQLite', async () => {
  const { pool } = fakePool(() => null);
  const original = oracledb.createPool;
  oracledb.createPool = async () => pool;
  try {
    const ora = await createOracleRepo({ user: 'u', password: 'p', connectString: 'x', autoMigrate: false });
    const lite = createSqliteRepo(':memory:');
    const methods = (o) => Object.keys(o).filter((k) => typeof o[k] === 'function').sort();
    assert.deepEqual(methods(ora), methods(lite));
  } finally {
    oracledb.createPool = original;
  }
});

test('recordReview delega en sd_api.record_review con binds OUT y mapea el resultado', async () => {
  const { calls, pool } = fakePool((sql) => sql.includes('record_review')
    ? { outBinds: { ease: 2.5, intv: 1, reps: 1, lapses: 0, due: '2026-01-02T00:00:00.000Z' } } : null);
  const original = oracledb.createPool;
  oracledb.createPool = async () => pool;
  try {
    const ora = await createOracleRepo({ user: 'u', password: 'p', connectString: 'x', autoMigrate: false });
    const next = await ora.recordReview({ userId: 1, itemId: 'ch14.q1', chapterId: 'ch14', grade: 2, mode: 'practice', correct: true });
    assert.deepEqual(next, { ease: 2.5, interval: 1, reps: 1, lapses: 0, dueAt: '2026-01-02T00:00:00.000Z', grade: 2 });
    const call = calls.find((c) => c.sql.includes('sd_api.record_review'));
    assert.equal(call.binds.ok, 1);
    assert.equal(call.binds.ease.dir, oracledb.BIND_OUT);
    // Nunca se concatenan valores en el SQL: todo va por bind variables
    assert.ok(!call.sql.includes('ch14'));
  } finally {
    oracledb.createPool = original;
  }
});

test('Errores ORA-20001 de PL/SQL se traducen a HTTP 409', async () => {
  const { pool } = fakePool((sql) => {
    if (sql.includes('create_user')) throw Object.assign(new Error('ORA-20001: Ese email ya está registrado'), { errorNum: 20001 });
    return null;
  });
  const original = oracledb.createPool;
  oracledb.createPool = async () => pool;
  try {
    const ora = await createOracleRepo({ user: 'u', password: 'p', connectString: 'x', autoMigrate: false });
    await assert.rejects(ora.createUser({ email: 'a@b.c', name: 'A', passwordHash: 'h' }), (e) => e.status === 409);
  } finally {
    oracledb.createPool = original;
  }
});

test('El repositorio Turso cumple el contrato y se comporta igual que SQLite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sharpdrill-'));
  const turso = await createTursoRepo({ url: `file:${join(dir, 't.db').replaceAll('\\', '/')}` });
  const lite = createSqliteRepo(':memory:');
  try {
    const methods = (o) => Object.keys(o).filter((k) => typeof o[k] === 'function').sort();
    assert.deepEqual(methods(turso), methods(lite));

    const now = new Date('2026-01-01T00:00:00.000Z');
    const run = async (repo) => {
      const id = await repo.createUser({ email: 'A@b.c', name: 'A', passwordHash: 'h' });
      const found = await repo.findUserByEmail('a@B.C');
      await repo.createSession({ tokenHash: 'x', userId: id, expiresAt: new Date('2027-01-01') });
      const bySession = await repo.userByTokenHash('x', now);
      const next = await repo.recordReview({ userId: id, itemId: 'ch1.q1', chapterId: 'ch1', grade: 0, mode: 'practice', correct: false, now });
      const card = await repo.createCustomCard(id, { chapterId: 'ch1', front: 'f', back: 'b' });
      await repo.updateCustomCard(id, card.numericId, { chapterId: 'ch2', front: 'f2', back: 'b2' });
      const examId = await repo.createExam({ userId: id, itemIds: ['ch1.q1'], chapters: ['ch1'], timeLimit: 60, startedAt: now, total: 1 });
      const finished = [await repo.finishExam(id, examId, 1, now), await repo.finishExam(id, examId, 1, now)];
      await repo.setSectionRead(id, 'ch1', 's1', true);
      return {
        id, found: { ...found }, session: bySession.sessionKind, next,
        reviews: (await repo.getReviews(id)).map((r) => ({ ...r })), weak: (await repo.weakItems(id)).length,
        due: await repo.countDue(id, null, new Date('2026-06-01')), totals: await repo.totals(id),
        activity: await repo.activity(id, '2025-12-01'), byMode: await repo.accuracyBy(id, 'mode'),
        cards: (await repo.listCustomCards(id)).map(({ createdAt, ...c }) => c),
        exam: await repo.getExam(id, examId), finished, exams: (await repo.listExams(id)).length,
        read: await repo.sectionsRead(id),
        deleted: [await repo.deleteSession(id, bySession.sessionId), await repo.deleteSession(id, bySession.sessionId)],
      };
    };
    assert.deepEqual(await run(turso), await run(lite));
    assert.equal(turso.kind, 'turso');
  } finally {
    await turso.close();
    await lite.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows puede retener el archivo */ }
  }
});
