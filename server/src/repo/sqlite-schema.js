// Esquema SQLite (desarrollo local y tests). El equivalente Oracle está en db/oracle/.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  daily_goal    INTEGER NOT NULL DEFAULT 20,
  created_at    TEXT NOT NULL
);

-- Sesiones web y tokens de API. Solo se guarda el hash SHA-256 del token, nunca el token.
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'web',
  label       TEXT,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  chapter_id  TEXT NOT NULL,
  mode        TEXT NOT NULL,
  correct     INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, created_at);

CREATE TABLE IF NOT EXISTS sections_read (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  read_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, chapter_id, section_id)
);

CREATE TABLE IF NOT EXISTS custom_cards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  front      TEXT NOT NULL,
  back       TEXT NOT NULL,
  created_at TEXT NOT NULL
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

-- Envíos de drills de código cronometrados
CREATE TABLE IF NOT EXISTS drill_submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  chapter_id  TEXT NOT NULL,
  code        TEXT NOT NULL,
  passed      INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  elapsed_ms  INTEGER NOT NULL,
  time_limit  INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drills_user ON drill_submissions(user_id, created_at);
`;
