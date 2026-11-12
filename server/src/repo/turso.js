import { SCHEMA } from './sqlite-schema.js';
import { schedule } from '../srs.js';

/**
 * Repositorio Turso/libSQL: SQLite alojado, accesible por HTTP (apto para serverless).
 * Reutiliza el esquema de SQLite e implementa el mismo contrato que repo/sqlite.js y repo/oracle.js.
 * Fechas: siempre ISO-8601 en UTC.
 */
export async function createTursoRepo({ url, authToken }) {
  if (!url) throw new Error('Falta TURSO_DATABASE_URL');
  // El cliente "web" (solo HTTP, sin binarios nativos) es el adecuado en serverless; el completo admite file: para tests.
  const { createClient } = url.startsWith('file:') ? await import('@libsql/client') : await import('@libsql/client/web');
  const db = createClient({ url, authToken });
  await db.executeMultiple(SCHEMA);

  const all = async (sql, ...args) => (await db.execute({ sql, args })).rows;
  const get = async (sql, ...args) => (await all(sql, ...args))[0];
  const run = async (sql, ...args) => {
    const r = await db.execute({ sql, args });
    return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid) };
  };
  /** Varias sentencias en una transacción (un solo viaje de red). */
  const tx = (stmts) => db.batch(stmts.map(([sql, ...args]) => ({ sql, args })), 'write');
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
    kind: 'turso',
    async close() { db.close(); },

    // ---------- Usuarios ----------
    async findUserByEmail(email) {
      return userDto(await get('SELECT * FROM users WHERE email = ?', email));
    },
    async getUser(id) {
      return userDto(await get('SELECT * FROM users WHERE id = ?', id));
    },
    async createUser({ email, name, passwordHash }) {
      const r = await run('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)', email, name, passwordHash, nowIso());
      return r.lastInsertRowid;
    },
    async updateUser(id, { name, dailyGoal }) {
      if (name !== undefined) await run('UPDATE users SET name = ? WHERE id = ?', name, id);
      if (dailyGoal !== undefined) await run('UPDATE users SET daily_goal = ? WHERE id = ?', dailyGoal, id);
      return userDto(await get('SELECT * FROM users WHERE id = ?', id));
    },

    // ---------- Sesiones / tokens ----------
    async createSession({ tokenHash, userId, kind = 'web', label = null, expiresAt }) {
      const r = await run('INSERT INTO sessions (token_hash, user_id, kind, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        tokenHash, userId, kind, label, nowIso(), iso(expiresAt));
      return r.lastInsertRowid;
    },
    async userByTokenHash(tokenHash, now = new Date()) {
      const r = await get(`SELECT u.*, s.id AS session_id, s.kind AS session_kind FROM sessions s JOIN users u ON u.id = s.user_id
                           WHERE s.token_hash = ? AND s.expires_at > ?`, tokenHash, iso(now));
      return r ? { ...userDto(r), sessionId: r.session_id, sessionKind: r.session_kind } : null;
    },
    async deleteSessionByHash(tokenHash) {
      await run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    },
    async listSessions(userId, kind) {
      return (await all('SELECT id, kind, label, created_at, expires_at FROM sessions WHERE user_id = ? AND kind = ? ORDER BY id DESC', userId, kind))
        .map((r) => ({ id: r.id, kind: r.kind, label: r.label, createdAt: r.created_at, expiresAt: r.expires_at }));
    },
    async deleteSession(userId, id) {
      return (await run('DELETE FROM sessions WHERE user_id = ? AND id = ?', userId, id)).changes > 0;
    },
    async purgeExpiredSessions(now = new Date()) {
      await run('DELETE FROM sessions WHERE expires_at < ?', iso(now));
    },

    // ---------- Repetición espaciada ----------
    async getReviews(userId) {
      return (await all('SELECT * FROM reviews WHERE user_id = ?', userId)).map(reviewDto);
    },
    /** Calcula SM-2, guarda el estado y el intento en una transacción. */
    async recordReview({ userId, itemId, chapterId, grade, mode, correct, now = new Date() }) {
      const prev = reviewDto(await get('SELECT * FROM reviews WHERE user_id = ? AND item_id = ?', userId, itemId));
      const next = schedule(prev, grade, now);
      const at = iso(now);
      await tx([
        [`INSERT INTO reviews (user_id, item_id, chapter_id, ease, interval, reps, lapses, due_at, last_grade, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, item_id) DO UPDATE SET
            chapter_id = excluded.chapter_id, ease = excluded.ease, interval = excluded.interval, reps = excluded.reps,
            lapses = excluded.lapses, due_at = excluded.due_at, last_grade = excluded.last_grade, updated_at = excluded.updated_at`,
          userId, itemId, chapterId, next.ease, next.interval, next.reps, next.lapses, next.dueAt, grade, at],
        ['INSERT INTO attempts (user_id, item_id, chapter_id, mode, correct, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          userId, itemId, chapterId, mode, correct ? 1 : 0, at],
      ]);
      return next;
    },
    async countDue(userId, from, to) {
      if (from) return (await get('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND due_at > ? AND due_at <= ?', userId, iso(from), iso(to))).n;
      return (await get('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND due_at <= ?', userId, iso(to))).n;
    },
    async weakItems(userId, limit = 8) {
      return (await all(`SELECT * FROM reviews WHERE user_id = ? AND (last_grade = 0 OR lapses > 0)
                         ORDER BY last_grade ASC, lapses DESC, ease ASC LIMIT ?`, userId, limit)).map(reviewDto);
    },
    async resetProgress(userId, chapterId = null) {
      await tx(chapterId
        ? [['DELETE FROM reviews WHERE user_id = ? AND chapter_id = ?', userId, chapterId],
           ['DELETE FROM sections_read WHERE user_id = ? AND chapter_id = ?', userId, chapterId]]
        : [['DELETE FROM reviews WHERE user_id = ?', userId],
           ['DELETE FROM sections_read WHERE user_id = ?', userId]]);
    },

    // ---------- Intentos / estadísticas ----------
    /** tzMinutes desplaza las fechas UTC a la hora local del usuario antes de agrupar por día. */
    async activity(userId, sinceDay, tzMinutes = 0) {
      return (await all(`SELECT substr(datetime(created_at, ?), 1, 10) AS day, COUNT(*) AS n, SUM(correct) AS ok
                         FROM attempts WHERE user_id = ? GROUP BY day HAVING day >= ? ORDER BY day`, `${tzMinutes} minutes`, userId, sinceDay))
        .map((r) => ({ day: r.day, count: r.n, correct: r.ok }));
    },
    async activeDays(userId, tzMinutes = 0) {
      return (await all('SELECT DISTINCT substr(datetime(created_at, ?), 1, 10) AS day FROM attempts WHERE user_id = ?', `${tzMinutes} minutes`, userId)).map((r) => r.day);
    },
    async totals(userId) {
      const r = await get('SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS ok FROM attempts WHERE user_id = ?', userId);
      return { attempts: r.n, correct: r.ok };
    },
    async accuracyBy(userId, field) {
      const col = field === 'mode' ? 'mode' : 'chapter_id';
      return (await all(`SELECT ${col} AS k, COUNT(*) AS n, SUM(correct) AS ok FROM attempts WHERE user_id = ? GROUP BY ${col}`, userId))
        .map((r) => ({ key: r.k, count: r.n, correct: r.ok }));
    },

    // ---------- Lectura ----------
    async sectionsRead(userId, chapterId = null) {
      const rows = chapterId
        ? await all('SELECT chapter_id, section_id FROM sections_read WHERE user_id = ? AND chapter_id = ?', userId, chapterId)
        : await all('SELECT chapter_id, section_id FROM sections_read WHERE user_id = ?', userId);
      return rows.map((r) => ({ chapterId: r.chapter_id, sectionId: r.section_id }));
    },
    async setSectionRead(userId, chapterId, sectionId, read) {
      if (read) await run('INSERT OR IGNORE INTO sections_read (user_id, chapter_id, section_id, read_at) VALUES (?, ?, ?, ?)',
        userId, chapterId, sectionId, nowIso());
      else await run('DELETE FROM sections_read WHERE user_id = ? AND chapter_id = ? AND section_id = ?', userId, chapterId, sectionId);
    },

    // ---------- Tarjetas propias ----------
    async listCustomCards(userId, chapterId = null) {
      const rows = chapterId
        ? await all('SELECT * FROM custom_cards WHERE user_id = ? AND chapter_id = ? ORDER BY id DESC', userId, chapterId)
        : await all('SELECT * FROM custom_cards WHERE user_id = ? ORDER BY id DESC', userId);
      return rows.map(cardDto);
    },
    async getCustomCard(userId, id) {
      return cardDto(await get('SELECT * FROM custom_cards WHERE id = ? AND user_id = ?', id, userId));
    },
    async createCustomCard(userId, { chapterId, front, back }) {
      const r = await run('INSERT INTO custom_cards (user_id, chapter_id, front, back, created_at) VALUES (?, ?, ?, ?, ?)',
        userId, chapterId, front, back, nowIso());
      return cardDto(await get('SELECT * FROM custom_cards WHERE id = ?', r.lastInsertRowid));
    },
    async updateCustomCard(userId, id, { chapterId, front, back }) {
      await tx([
        ['UPDATE custom_cards SET chapter_id = ?, front = ?, back = ? WHERE id = ? AND user_id = ?', chapterId, front, back, id, userId],
        ['UPDATE reviews SET chapter_id = ? WHERE user_id = ? AND item_id = ?', chapterId, userId, `u.${id}`],
      ]);
      return cardDto(await get('SELECT * FROM custom_cards WHERE id = ?', id));
    },
    async deleteCustomCard(userId, id) {
      await tx([
        ['DELETE FROM custom_cards WHERE id = ? AND user_id = ?', id, userId],
        ['DELETE FROM reviews WHERE user_id = ? AND item_id = ?', userId, `u.${id}`],
      ]);
    },

    // ---------- Exámenes ----------
    async createExam({ userId, itemIds, chapters, timeLimit, startedAt, total }) {
      const r = await run('INSERT INTO exams (user_id, item_ids, chapters, time_limit, started_at, total) VALUES (?, ?, ?, ?, ?, ?)',
        userId, JSON.stringify(itemIds), JSON.stringify(chapters), timeLimit, iso(startedAt), total);
      return r.lastInsertRowid;
    },
    async getExam(userId, id) {
      return examDto(await get('SELECT * FROM exams WHERE id = ? AND user_id = ?', id, userId));
    },
    /** Marca el examen como entregado; devuelve false si ya lo estaba (evita doble entrega concurrente). */
    async finishExam(userId, id, score, finishedAt = new Date()) {
      return (await run('UPDATE exams SET finished_at = ?, score = ? WHERE id = ? AND user_id = ? AND finished_at IS NULL',
        iso(finishedAt), score, id, userId)).changes > 0;
    },
    async listExams(userId, limit = 20) {
      return (await all('SELECT * FROM exams WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT ?', userId, limit)).map(examDto);
    },

    // ---------- Drills ----------
    async saveDrillSubmission(s) {
      await run(`INSERT INTO drill_submissions (user_id, item_id, chapter_id, code, passed, total, elapsed_ms, time_limit, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.userId, s.itemId, s.chapterId, s.code, s.passed, s.total, s.elapsedMs, s.timeLimit, nowIso());
    },
    async drillHistory(userId, limit = 30) {
      return (await all(`SELECT item_id, chapter_id, passed, total, elapsed_ms, time_limit, created_at FROM drill_submissions
                         WHERE user_id = ? ORDER BY id DESC LIMIT ?`, userId, limit)).map((r) => ({
        itemId: r.item_id, chapterId: r.chapter_id, passed: r.passed, total: r.total,
        elapsedMs: r.elapsed_ms, timeLimit: r.time_limit, createdAt: r.created_at,
      }));
    },
    async bestDrillTimes(userId) {
      return (await all(`SELECT item_id, MIN(elapsed_ms) AS best FROM drill_submissions
                         WHERE user_id = ? AND passed = total GROUP BY item_id`, userId)).map((r) => ({ itemId: r.item_id, bestMs: r.best }));
    },
  };
}
