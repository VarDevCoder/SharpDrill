import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { splitSqlScript, migrateIfNeeded, ORACLE_DIR, MIGRATION_FILES } from '../src/repo/oracle-migrate.js';

const read = (f) => readFileSync(join(ORACLE_DIR, f), 'utf8');

test('splitSqlScript: separa DDL por ";" y PL/SQL por "/"', () => {
  const schema = splitSqlScript(read('01_schema.sql'));
  assert.equal(schema.filter((s) => /^CREATE TABLE/i.test(s)).length, 8);
  assert.ok(schema.every((s) => !s.trimEnd().endsWith(';')), 'el driver no acepta ";" final en SQL');
  assert.ok(schema.every((s) => !s.startsWith('--')));

  const srs = splitSqlScript(read('02_sd_srs.sql'));
  assert.equal(srs.length, 2);
  assert.match(srs[0], /^CREATE OR REPLACE PACKAGE sd_srs/);
  assert.match(srs[1], /^CREATE OR REPLACE PACKAGE BODY sd_srs/);
  assert.match(srs[1], /END sd_srs;$/, 'los bloques PL/SQL conservan su ";" final');

  const api = splitSqlScript(read('03_sd_api.sql'));
  assert.deepEqual(api.map((s) => s.split('\n')[0].replace(/\s+AUTHID.*| AS$/, '')),
    ['CREATE OR REPLACE PACKAGE sd_api', 'CREATE OR REPLACE PACKAGE BODY sd_api']);
});

test('migrateIfNeeded: instala todo si falta el esquema y comprueba USER_ERRORS', async () => {
  const executed = [];
  const conn = {
    async execute(sql) {
      executed.push(sql);
      if (sql.includes('user_tables')) return { rows: [{ N: 0 }] };
      if (sql.includes('user_errors')) return { rows: [] };
      return { rows: [] };
    },
  };
  const r = await migrateIfNeeded(conn, { log: () => {} });
  const expected = MIGRATION_FILES.reduce((n, f) => n + splitSqlScript(read(f)).length, 0);
  assert.equal(r.statements, expected);
  assert.ok(executed.at(-1).includes('user_errors'));
});

test('migrateIfNeeded: no hace nada si el esquema existe', async () => {
  const conn = { execute: async () => ({ rows: [{ N: 1 }] }) };
  assert.deepEqual(await migrateIfNeeded(conn, { log: () => {} }), { installed: false });
});

test('migrateIfNeeded: falla con detalle si un paquete no compila', async () => {
  const conn = {
    async execute(sql) {
      if (sql.includes('user_tables')) return { rows: [{ N: 0 }] };
      if (sql.includes('user_errors')) return { rows: [{ NAME: 'SD_API', TYPE: 'PACKAGE BODY', LINE: 42, TEXT: 'PLS-00201: identifier X must be declared' }] };
      return { rows: [] };
    },
  };
  await assert.rejects(migrateIfNeeded(conn, { log: () => {} }), /SD_API línea 42: PLS-00201/);
});

test('Función de Vercel sin BD configurada: health 200 y API 503 con instrucciones', async () => {
  delete process.env.DB_CLIENT;
  const { default: handler } = await import('../../api/index.js');
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const h = await (await fetch(`${base}/api/health`)).json();
    assert.equal(h.configured, false);
    assert.equal(h.chapters, 24);
    const r = await fetch(`${base}/api/chapters`);
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /TURSO_DATABASE_URL/);
  } finally {
    server.close();
  }
});
