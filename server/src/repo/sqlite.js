import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA } from './sqlite-schema.js';
import { schedule } from '../srs.js';

/**
 * Repositorio SQLite: implementa el mismo contrato que el repositorio Oracle (repo/oracle.js).
 * Todos los métodos son async para que las rutas no dependan del motor.
 * Fechas: siempre ISO-8601 en UTC.
 */
export function createSqliteRepo(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const cache = new Map();
  const st = (sql) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  const tx = (fn) => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const iso = (d) => (d instanceof Date ? d.toISOString() : d);
  const nowIso = () => new Date().toISOString();

  const userDto = (r) => r && { id: r.id, email: r.email, name: r.name, dailyGoal: r.daily_goal, passwordHash: r.password_hash };
  const reviewDto = (r) => r && {
    itemId: r.item_id, chapterId: r.chapter_id, ease: r.ease, interval: r.interval, reps: r.reps,
    lapses: r.lapses, dueAt: r.due_at, lastGrade: r.last_grade, updatedAt: r.updated_at,
  };
  const cardDto = (r) => r && { id: `u.${r.id}`, numericId: r.id, chapterId: r.chapter_id, front: r.front, back: r.back, createdAt: r.created_at };
  const examDto = (r) => r && {
    id: r.id, itemIds: JSON.parse(r.item_ids), chapters: JSON.parse(r.chapters), timeLimit: r.time_limit,
    startedAt: r.started_at, finishedAt: r.finished_at, score: r.score, total: r.total,
  };

  return {
    kind: 'sqlite',
    async close() { db.close(); },

    // ---------- Usuarios ----------
    async findUserByEmail(email) {
      return userDto(st('SELECT * FROM users WHERE email = ?').get(email));
    },
    async getUser(id) {
      return userDto(st('SELECT * FROM users WHERE id = ?').get(id));
    },
    async createUser({ email, name, passwordHash }) {
      const r = st('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(email, name, passwordHash, nowIso());
      return Number(r.lastInsertRowid);
    },
    async updateUser(id, { name, dailyGoal }) {
      if (name !== undefined) st('UPDATE users SET name = ? WHERE id = ?').run(name, id);
      if (dailyGoal !== undefined) st('UPDATE users SET daily_goal = ? WHERE id = ?').run(dailyGoal, id);
      return userDto(st('SELECT * FROM users WHERE id = ?').get(id));
    },

    // ---------- Sesiones / tokens ----------
    async createSession({ tokenHash, userId, kind = 'web', label = null, expiresAt }) {
      const r = st('INSERT INTO sessions (token_hash, user_id, kind, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(tokenHash, userId, kind, label, nowIso(), iso(expiresAt));
      return Number(r.lastInsertRowid);
    },
    async userByTokenHash(tokenHash, now = new Date()) {
      const r = st(`SELECT u.*, s.id AS session_id, s.kind AS session_kind FROM sessions s JOIN users u ON u.id = s.user_id
                    WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash, iso(now));
      return r ? { ...userDto(r), sessionId: r.session_id, sessionKind: r.session_kind } : null;
    },
    async deleteSessionByHash(tokenHash) {
      st('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },
    async listSessions(userId, kind) {
      return st('SELECT id, kind, label, created_at, expires_at FROM sessions WHERE user_id = ? AND kind = ? ORDER BY id DESC')
        .all(userId, kind).map((r) => ({ id: r.id, kind: r.kind, label: r.label, createdAt: r.created_at, expiresAt: r.expires_at }));
    },
    async deleteSession(userId, id) {
      return st('DELETE FROM sessions WHERE user_id = ? AND id = ?').run(userId, id).changes > 0;
    },
    async purgeExpiredSessions(now = new Date()) {
      st('DELETE FROM sessions WHERE expires_at < ?').run(iso(now));
    },

    // ---------- Repetición espaciada ----------
    async getReviews(userId) {
      return st('SELECT * FROM reviews WHERE user_id = ?').all(userId).map(reviewDto);
    },
    /** Calcula SM-2, guarda el estado y el intento en una transacción. */
    async recordReview({ userId, itemId, chapterId, grade, mode, correct, now = new Date() }) {
      const prev = reviewDto(st('SELECT * FROM reviews WHERE user_id = ? AND item_id = ?').get(userId, itemId));
      const next = schedule(prev, grade, now);
      const at = iso(now);
      tx(() => {
        st(`INSERT INTO reviews (user_id, item_id, chapter_id, ease, interval, reps, lapses, due_at, last_grade, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id, item_id) DO UPDATE SET
              chapter_id = excluded.chapter_id, ease = excluded.ease, interval = excluded.interval, reps = excluded.reps,
              lapses = excluded.lapses, due_at = excluded.due_at, last_grade = excluded.last_grade, updated_at = excluded.updated_at`)
          .run(userId, itemId, chapterId, next.ease, next.interval, next.reps, next.lapses, next.dueAt, grade, at);
        st('INSERT INTO attempts (user_id, item_id, chapter_id, mode, correct, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(userId, itemId, chapterId, mode, correct ? 1 : 0, at);
      });
      return next;
    },
    async countDue(userId, from, to) {
      if (from) return st('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND due_at > ? AND due_at <= ?').get(userId, iso(from), iso(to)).n;
      return st('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND due_at <= ?').get(userId, iso(to)).n;
    },
    async weakItems(userId, limit = 8) {
      return st(`SELECT * FROM reviews WHERE user_id = ? AND (last_grade = 0 OR lapses > 0)
                 ORDER BY last_grade ASC, lapses DESC, ease ASC LIMIT ?`).all(userId, limit).map(reviewDto);
    },
    async resetProgress(userId, chapterId = null) {
      tx(() => {
        if (chapterId) {
          st('DELETE FROM reviews WHERE user_id = ? AND chapter_id = ?').run(userId, chapterId);
          st('DELETE FROM sections_read WHERE user_id = ? AND chapter_id = ?').run(userId, chapterId);
        } else {
          st('DELETE FROM reviews WHERE user_id = ?').run(userId);
          st('DELETE FROM sections_read WHERE user_id = ?').run(userId);
        }
      });
    },

    // ---------- Intentos / estadísticas ----------
    async activity(userId, sinceDay) {
      return st(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n, SUM(correct) AS ok
                 FROM attempts WHERE user_id = ? AND created_at >= ? GROUP BY day ORDER BY day`)
        .all(userId, sinceDay).map((r) => ({ day: r.day, count: r.n, correct: r.ok }));
    },
    async activeDays(userId) {
      return st('SELECT DISTINCT substr(created_at, 1, 10) AS day FROM attempts WHERE user_id = ?').all(userId).map((r) => r.day);
    },
    async totals(userId) {
      const r = st('SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS ok FROM attempts WHERE user_id = ?').get(userId);
      return { attempts: r.n, correct: r.ok };
    },
    async accuracyBy(userId, field) {
      const col = field === 'mode' ? 'mode' : 'chapter_id';
      return st(`SELECT ${col} AS k, COUNT(*) AS n, SUM(correct) AS ok FROM attempts WHERE user_id = ? GROUP BY ${col}`)
        .all(userId).map((r) => ({ key: r.k, count: r.n, correct: r.ok }));
    },

    // ---------- Lectura ----------
    async sectionsRead(userId, chapterId = null) {
      const rows = chapterId
        ? st('SELECT chapter_id, section_id FROM sections_read WHERE user_id = ? AND chapter_id = ?').all(userId, chapterId)
        : st('SELECT chapter_id, section_id FROM sections_read WHERE user_id = ?').all(userId);
      return rows.map((r) => ({ chapterId: r.chapter_id, sectionId: r.section_id }));
    },
    async setSectionRead(userId, chapterId, sectionId, read) {
      if (read) st('INSERT OR IGNORE INTO sections_read (user_id, chapter_id, section_id, read_at) VALUES (?, ?, ?, ?)')
        .run(userId, chapterId, sectionId, nowIso());
      else st('DELETE FROM sections_read WHERE user_id = ? AND chapter_id = ? AND section_id = ?').run(userId, chapterId, sectionId);
    },

    // ---------- Tarjetas propias ----------
    async listCustomCards(userId, chapterId = null) {
      const rows = chapterId
        ? st('SELECT * FROM custom_cards WHERE user_id = ? AND chapter_id = ? ORDER BY id DESC').all(userId, chapterId)
        : st('SELECT * FROM custom_cards WHERE user_id = ? ORDER BY id DESC').all(userId);
      return rows.map(cardDto);
    },
    async getCustomCard(userId, id) {
      return cardDto(st('SELECT * FROM custom_cards WHERE id = ? AND user_id = ?').get(id, userId));
    },
    async createCustomCard(userId, { chapterId, front, back }) {
      const r = st('INSERT INTO custom_cards (user_id, chapter_id, front, back, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(userId, chapterId, front, back, nowIso());
      return cardDto(st('SELECT * FROM custom_cards WHERE id = ?').get(r.lastInsertRowid));
    },
    async updateCustomCard(userId, id, { chapterId, front, back }) {
      tx(() => {
        st('UPDATE custom_cards SET chapter_id = ?, front = ?, back = ? WHERE id = ? AND user_id = ?').run(chapterId, front, back, id, userId);
        st('UPDATE reviews SET chapter_id = ? WHERE user_id = ? AND item_id = ?').run(chapterId, userId, `u.${id}`);
      });
      return cardDto(st('SELECT * FROM custom_cards WHERE id = ?').get(id));
    },
    async deleteCustomCard(userId, id) {
      tx(() => {
        st('DELETE FROM custom_cards WHERE id = ? AND user_id = ?').run(id, userId);
        st('DELETE FROM reviews WHERE user_id = ? AND item_id = ?').run(userId, `u.${id}`);
      });
    },

    // ---------- Exámenes ----------
    async createExam({ userId, itemIds, chapters, timeLimit, startedAt, total }) {
      const r = st('INSERT INTO exams (user_id, item_ids, chapters, time_limit, started_at, total) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, JSON.stringify(itemIds), JSON.stringify(chapters), timeLimit, iso(startedAt), total);
      return Number(r.lastInsertRowid);
    },
    async getExam(userId, id) {
      return examDto(st('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(id, userId));
    },
    /** Marca el examen como entregado; devuelve false si ya lo estaba (evita doble entrega concurrente). */
    async finishExam(userId, id, score, finishedAt = new Date()) {
      return st('UPDATE exams SET finished_at = ?, score = ? WHERE id = ? AND user_id = ? AND finished_at IS NULL')
        .run(iso(finishedAt), score, id, userId).changes > 0;
    },
    async listExams(userId, limit = 20) {
      return st('SELECT * FROM exams WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT ?').all(userId, limit).map(examDto);
    },

    // ---------- Drills ----------
    async saveDrillSubmission(s) {
      st(`INSERT INTO drill_submissions (user_id, item_id, chapter_id, code, passed, total, elapsed_ms, time_limit, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(s.userId, s.itemId, s.chapterId, s.code, s.passed, s.total, s.elapsedMs, s.timeLimit, nowIso());
    },
    async drillHistory(userId, limit = 30) {
      return st(`SELECT item_id, chapter_id, passed, total, elapsed_ms, time_limit, created_at FROM drill_submissions
                 WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(userId, limit).map((r) => ({
        itemId: r.item_id, chapterId: r.chapter_id, passed: r.passed, total: r.total,
        elapsedMs: r.elapsed_ms, timeLimit: r.time_limit, createdAt: r.created_at,
      }));
    },
    async bestDrillTimes(userId) {
      return st(`SELECT item_id, MIN(elapsed_ms) AS best FROM drill_submissions
                 WHERE user_id = ? AND passed = total GROUP BY item_id`).all(userId).map((r) => ({ itemId: r.item_id, bestMs: r.best }));
    },
  };
}
