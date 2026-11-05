import { test } from 'node:test';
import assert from 'node:assert/strict';
import oracledb from 'oracledb';
import { createSqliteRepo } from '../src/repo/sqlite.js';
import { createOracleRepo } from '../src/repo/oracle.js';

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
