import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  daily_goal    INTEGER NOT NULL DEFAULT 20,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Estado de repetición espaciada (SM-2) por usuario y elemento (tarjeta o pregunta).
CREATE TABLE IF NOT EXISTS reviews (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  chapter_id  TEXT NOT NULL,
  ease        REAL NOT NULL,
  interval    REAL NOT NULL,
  reps        INTEGER NOT NULL,
  lapses      INTEGER NOT NULL,
  due_at      TEXT NOT NULL,
  last_grade  INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_due ON reviews(user_id, due_at);

-- Historial de intentos: alimenta estadísticas, racha y mapa de actividad.
CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  chapter_id  TEXT NOT NULL,
  mode        TEXT NOT NULL,
  correct     INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, created_at);

CREATE TABLE IF NOT EXISTS sections_read (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  read_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chapter_id, section_id)
);

CREATE TABLE IF NOT EXISTS custom_cards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  front      TEXT NOT NULL,
  back       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exams (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_ids     TEXT NOT NULL,
  chapters     TEXT NOT NULL,
  time_limit   INTEGER NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  score        INTEGER,
  total        INTEGER NOT NULL
);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Ejecuta fn dentro de una transacción. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
