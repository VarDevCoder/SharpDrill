import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ORACLE_DIR = join(__dirname, '..', '..', '..', 'db', 'oracle');
export const MIGRATION_FILES = ['01_schema.sql', '02_sd_srs.sql', '03_sd_api.sql'];

/**
 * Divide un script SQL*Plus en sentencias ejecutables por node-oracledb:
 * - Bloques PL/SQL (CREATE PACKAGE/PROCEDURE/FUNCTION/TRIGGER/TYPE, BEGIN/DECLARE) terminan en una línea con "/".
 * - Sentencias SQL normales terminan en ";" (que se elimina: el driver no lo acepta).
 * Se ignoran comentarios de línea completos y comandos de SQL*Plus (PROMPT, SET, @@...).
 */
export function splitSqlScript(text) {
  const out = [];
  let buf = [];
  let plsql = false;
  const isPlsqlStart = (l) => /^\s*(CREATE\s+(OR\s+REPLACE\s+)?(EDITIONABLE\s+)?(PACKAGE|PROCEDURE|FUNCTION|TRIGGER|TYPE)\b|DECLARE\b|BEGIN\b)/i.test(l);
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (buf.length === 0) {
      if (/^\s*$/.test(line) || /^\s*--/.test(line)) continue;
      if (/^\s*(PROMPT|SET|WHENEVER|SHOW|SPOOL|EXIT|@)/i.test(line)) continue;
      plsql = isPlsqlStart(line);
    }
    if (plsql) {
      if (/^\s*\/\s*$/.test(line)) { out.push(buf.join('\n').trim()); buf = []; continue; }
      buf.push(line);
    } else {
      buf.push(line);
      if (/;\s*(--.*)?$/.test(line)) {
        out.push(buf.join('\n').trim().replace(/;\s*(--.*)?$/, ''));
        buf = [];
      }
    }
  }
  if (buf.join('').trim()) out.push(buf.join('\n').trim().replace(/;\s*$/, ''));
  return out;
}

/** Instala el esquema si no existe (idempotente). Pensado para el primer arranque en Vercel / Autonomous DB. */
export async function migrateIfNeeded(conn, { log = console.log } = {}) {
  const r = await conn.execute(`SELECT COUNT(*) AS n FROM user_tables WHERE table_name = 'SD_USERS'`);
  if (r.rows[0].N > 0) return { installed: false };

  log('[oracle] Esquema no encontrado: instalando tablas y paquetes PL/SQL…');
  let count = 0;
  for (const f of MIGRATION_FILES) {
    for (const stmt of splitSqlScript(readFileSync(join(ORACLE_DIR, f), 'utf8'))) {
      try {
        await conn.execute(stmt);
        count++;
      } catch (e) {
        // ORA-00955: el objeto ya existe (otra instancia está migrando a la vez)
        if (e.errorNum !== 955) throw new Error(`Migración Oracle falló en ${f}: ${e.message}\n${stmt.slice(0, 200)}`);
      }
    }
  }
  // CREATE PACKAGE con errores no lanza excepción: hay que consultar USER_ERRORS
  const errs = await conn.execute(`SELECT name, type, line, text FROM user_errors ORDER BY name, sequence`);
  if (errs.rows.length) {
    const detail = errs.rows.map((e) => `${e.TYPE} ${e.NAME} línea ${e.LINE}: ${e.TEXT.trim()}`).join('\n');
    throw new Error(`Paquetes PL/SQL con errores de compilación:\n${detail}`);
  }
  log(`[oracle] Esquema instalado (${count} sentencias).`);
  return { installed: true, statements: count };
}
