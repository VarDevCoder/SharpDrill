import oracledb from 'oracledb';
import { migrateIfNeeded } from './oracle-migrate.js';

/**
 * Repositorio Oracle (node-oracledb en modo thin: sin Instant Client).
 * - Escrituras y lógica (SM-2 incluido) en los paquetes PL/SQL SD_API / SD_SRS (db/oracle/).
 * - Lecturas con SQL parametrizado (bind variables → sin inyección y con cursores compartidos).
 * - Fechas intercambiadas como ISO-8601 UTC (sd_api.iso / sd_api.to_ts) para no depender de zonas horarias.
 */
export async function createOracleRepo({ user, password, connectString, poolMin = 0, poolMax = 10, autoMigrate = true }) {
  if (!user || !password) throw new Error('ORACLE_USER y ORACLE_PASSWORD son obligatorios con DB_CLIENT=oracle');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];
  oracledb.autoCommit = true;

  // poolMin 0: en serverless (Vercel) no se mantienen conexiones ociosas entre invocaciones
  const pool = await oracledb.createPool({ user, password, connectString, poolMin, poolMax, poolIncrement: 1, poolTimeout: 60 });

  async function withConn(fn) {
    const conn = await pool.getConnection();
    try { return await fn(conn); } finally { await conn.close(); }
  }
  const rows = (sql, binds = {}) => withConn(async (c) => (await c.execute(sql, binds)).rows);
  const one = async (sql, binds) => (await rows(sql, binds))[0] ?? null;
  const exec = (sql, binds = {}) => withConn((c) => c.execute(sql, binds));
  /** Ejecuta un bloque PL/SQL que asigna un SYS_REFCURSOR a :rc y lo lee completo. */
  const cursor = (plsql, binds = {}) => withConn(async (c) => {
    const r = await c.execute(plsql, { ...binds, rc: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } });
    const rs = r.outBinds.rc;
    try { return await rs.getRows(); } finally { await rs.close(); }
  });

  const iso = (d) => (d instanceof Date ? d.toISOString() : d);
  const OUT_NUM = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
  const OUT_STR = { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 };
  const clob = (v) => ({ val: v, type: oracledb.CLOB });

  const userDto = (r) => r && { id: r.ID, email: r.EMAIL, name: r.NAME, dailyGoal: r.DAILY_GOAL, passwordHash: r.PASSWORD_HASH };
  const reviewDto = (r) => r && {
    itemId: r.ITEM_ID, chapterId: r.CHAPTER_ID, ease: r.EASE, interval: r.INTERVAL_DAYS, reps: r.REPS,
    lapses: r.LAPSES, dueAt: r.DUE_AT, lastGrade: r.LAST_GRADE, updatedAt: r.UPDATED_AT,
  };
  const cardDto = (r) => r && { id: `u.${r.ID}`, numericId: r.ID, chapterId: r.CHAPTER_ID, front: r.FRONT, back: r.BACK, createdAt: r.CREATED_AT };
  const examDto = (r) => r && {
    id: r.ID, itemIds: JSON.parse(r.ITEM_IDS), chapters: JSON.parse(r.CHAPTERS), timeLimit: r.TIME_LIMIT,
    startedAt: r.STARTED_AT, finishedAt: r.FINISHED_AT, score: r.SCORE, total: r.TOTAL,
  };
  const REVIEW_COLS = `item_id, chapter_id, ease, interval_days, reps, lapses, sd_api.iso(due_at) AS due_at,
                       last_grade, sd_api.iso(updated_at) AS updated_at`;

  /** Traduce errores de negocio de PL/SQL (ORA-20xxx) a errores HTTP. */
  const mapError = (e) => {
    if (e.errorNum === 20001) return Object.assign(new Error('Ese email ya está registrado'), { status: 409 });
    if (e.errorNum === 20004) return Object.assign(new Error('No encontrado'), { status: 404 });
    return e;
  };
  const guard = async (p) => { try { return await p; } catch (e) { throw mapError(e); } };

  if (autoMigrate) await withConn((c) => migrateIfNeeded(c));

  return {
    kind: 'oracle',
    async close() { await pool.close(10); },

    // ---------- Usuarios ----------
    async findUserByEmail(email) {
      return userDto(await one('SELECT * FROM sd_users WHERE LOWER(email) = LOWER(:email)', { email }));
    },
    async getUser(id) {
      return userDto(await one('SELECT * FROM sd_users WHERE id = :id', { id }));
    },
    async createUser({ email, name, passwordHash }) {
      const r = await guard(exec('BEGIN :id := sd_api.create_user(:email, :name, :hash); END;',
        { id: OUT_NUM, email, name, hash: passwordHash }));
      return r.outBinds.id;
    },
    async updateUser(id, { name = null, dailyGoal = null }) {
      await guard(exec('BEGIN sd_api.update_user(:id, :name, :goal); END;', { id, name, goal: dailyGoal }));
      return this.getUser(id);
    },

    // ---------- Sesiones / tokens ----------
    async createSession({ tokenHash, userId, kind = 'web', label = null, expiresAt }) {
      const r = await exec('BEGIN :id := sd_api.create_session(:h, :u, :k, :l, :e); END;',
        { id: OUT_NUM, h: tokenHash, u: userId, k: kind, l: label, e: iso(expiresAt) });
      return r.outBinds.id;
    },
    async userByTokenHash(tokenHash) {
      const r = await one(`SELECT u.*, s.id AS session_id, s.kind AS session_kind
                             FROM sd_sessions s JOIN sd_users u ON u.id = s.user_id
                            WHERE s.token_hash = :h AND s.expires_at > sd_api.utc_now`, { h: tokenHash });
      return r ? { ...userDto(r), sessionId: r.SESSION_ID, sessionKind: r.SESSION_KIND } : null;
    },
    async deleteSessionByHash(tokenHash) {
      await exec('DELETE FROM sd_sessions WHERE token_hash = :h', { h: tokenHash });
    },
    async listSessions(userId, kind) {
      return (await rows(`SELECT id, kind, label, sd_api.iso(created_at) AS created_at, sd_api.iso(expires_at) AS expires_at
                            FROM sd_sessions WHERE user_id = :u AND kind = :k ORDER BY id DESC`, { u: userId, k: kind }))
        .map((r) => ({ id: r.ID, kind: r.KIND, label: r.LABEL, createdAt: r.CREATED_AT, expiresAt: r.EXPIRES_AT }));
    },
    async deleteSession(userId, id) {
      const r = await exec('BEGIN :n := sd_api.delete_session(:u, :id); END;', { n: OUT_NUM, u: userId, id });
      return r.outBinds.n > 0;
    },
    async purgeExpiredSessions() {
      await exec('BEGIN sd_api.purge_expired_sessions; END;');
    },

    // ---------- Repetición espaciada ----------
    async getReviews(userId) {
      return (await rows(`SELECT ${REVIEW_COLS} FROM sd_reviews WHERE user_id = :u`, { u: userId })).map(reviewDto);
    },
    /** SM-2 calculado en PL/SQL (sd_srs.schedule) dentro de sd_api.record_review. */
    async recordReview({ userId, itemId, chapterId, grade, mode, correct }) {
      const r = await exec(`BEGIN sd_api.record_review(:u, :item, :ch, :g, :mode, :ok,
                                                     :ease, :intv, :reps, :lapses, :due); END;`, {
        u: userId, item: itemId, ch: chapterId, g: grade, mode, ok: correct ? 1 : 0,
        ease: OUT_NUM, intv: OUT_NUM, reps: OUT_NUM, lapses: OUT_NUM, due: OUT_STR,
      });
      const o = r.outBinds;
      return { ease: o.ease, interval: o.intv, reps: o.reps, lapses: o.lapses, dueAt: o.due, grade };
    },
    async countDue(userId, from, to) {
      const r = from
        ? await one(`SELECT COUNT(*) AS n FROM sd_reviews WHERE user_id = :u
                       AND due_at > sd_api.to_ts(:f) AND due_at <= sd_api.to_ts(:t)`, { u: userId, f: iso(from), t: iso(to) })
        : await one('SELECT COUNT(*) AS n FROM sd_reviews WHERE user_id = :u AND due_at <= sd_api.to_ts(:t)', { u: userId, t: iso(to) });
      return r.N;
    },
    async weakItems(userId, limit = 8) {
      return (await cursor('BEGIN :rc := sd_api.get_weak_items(:u, :n); END;', { u: userId, n: limit })).map(reviewDto);
    },
    async resetProgress(userId, chapterId = null) {
      await exec('BEGIN sd_api.reset_progress(:u, :ch); END;', { u: userId, ch: chapterId });
    },

    // ---------- Intentos / estadísticas ----------
    async activity(userId, sinceDay) {
      return (await cursor('BEGIN :rc := sd_api.get_activity(:u, :d); END;', { u: userId, d: sinceDay }))
        .map((r) => ({ day: r.ACTIVITY_DAY, count: r.N, correct: r.OK }));
    },
    async activeDays(userId) {
      return (await rows(`SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM-DD') AS d FROM sd_attempts WHERE user_id = :u`, { u: userId }))
        .map((r) => r.D);
    },
    async totals(userId) {
      const r = await one('SELECT COUNT(*) AS n, NVL(SUM(correct), 0) AS ok FROM sd_attempts WHERE user_id = :u', { u: userId });
      return { attempts: r.N, correct: r.OK };
    },
    async accuracyBy(userId, field) {
      const col = field === 'mode' ? 'attempt_mode' : 'chapter_id'; // lista blanca: nunca concatenar entrada del usuario
      return (await rows(`SELECT ${col} AS k, COUNT(*) AS n, SUM(correct) AS ok FROM sd_attempts WHERE user_id = :u GROUP BY ${col}`, { u: userId }))
        .map((r) => ({ key: r.K, count: r.N, correct: r.OK }));
    },

    // ---------- Lectura ----------
    async sectionsRead(userId, chapterId = null) {
      return (await rows(`SELECT chapter_id, section_id FROM sd_sections_read
                           WHERE user_id = :u AND (:ch IS NULL OR chapter_id = :ch)`, { u: userId, ch: chapterId }))
        .map((r) => ({ chapterId: r.CHAPTER_ID, sectionId: r.SECTION_ID }));
    },
    async setSectionRead(userId, chapterId, sectionId, read) {
      await exec('BEGIN sd_api.set_section_read(:u, :ch, :s, :r); END;', { u: userId, ch: chapterId, s: sectionId, r: read ? 1 : 0 });
    },

    // ---------- Tarjetas propias ----------
    async listCustomCards(userId, chapterId = null) {
      return (await rows(`SELECT id, chapter_id, front, back, sd_api.iso(created_at) AS created_at FROM sd_custom_cards
                           WHERE user_id = :u AND (:ch IS NULL OR chapter_id = :ch) ORDER BY id DESC`, { u: userId, ch: chapterId }))
        .map(cardDto);
    },
    async getCustomCard(userId, id) {
      return cardDto(await one(`SELECT id, chapter_id, front, back, sd_api.iso(created_at) AS created_at
                                  FROM sd_custom_cards WHERE id = :id AND user_id = :u`, { id, u: userId }));
    },
    async createCustomCard(userId, { chapterId, front, back }) {
      const r = await exec('BEGIN :id := sd_api.create_custom_card(:u, :ch, :f, :b); END;',
        { id: OUT_NUM, u: userId, ch: chapterId, f: clob(front), b: clob(back) });
      return this.getCustomCard(userId, r.outBinds.id);
    },
    async updateCustomCard(userId, id, { chapterId, front, back }) {
      await guard(exec('BEGIN sd_api.update_custom_card(:u, :id, :ch, :f, :b); END;',
        { u: userId, id, ch: chapterId, f: clob(front), b: clob(back) }));
      return this.getCustomCard(userId, id);
    },
    async deleteCustomCard(userId, id) {
      await exec('BEGIN sd_api.delete_custom_card(:u, :id); END;', { u: userId, id });
    },

    // ---------- Exámenes ----------
    async createExam({ userId, itemIds, chapters, timeLimit, startedAt, total }) {
      const r = await exec('BEGIN :id := sd_api.create_exam(:u, :items, :chs, :tl, :st, :tot); END;', {
        id: OUT_NUM, u: userId, items: clob(JSON.stringify(itemIds)), chs: JSON.stringify(chapters),
        tl: timeLimit, st: iso(startedAt), tot: total,
      });
      return r.outBinds.id;
    },
    async getExam(userId, id) {
      return examDto(await one(`SELECT id, item_ids, chapters, time_limit, sd_api.iso(started_at) AS started_at,
                                       sd_api.iso(finished_at) AS finished_at, score, total
                                  FROM sd_exams WHERE id = :id AND user_id = :u`, { id, u: userId }));
    },
    async finishExam(userId, id, score) {
      const r = await exec('BEGIN :n := sd_api.finish_exam(:u, :id, :s); END;', { n: OUT_NUM, u: userId, id, s: score });
      return r.outBinds.n > 0;
    },
    async listExams(userId, limit = 20) {
      return (await rows(`SELECT id, item_ids, chapters, time_limit, sd_api.iso(started_at) AS started_at,
                                 sd_api.iso(finished_at) AS finished_at, score, total
                            FROM sd_exams WHERE user_id = :u AND finished_at IS NOT NULL
                           ORDER BY id DESC FETCH FIRST :n ROWS ONLY`, { u: userId, n: limit })).map(examDto);
    },

    // ---------- Drills ----------
    async saveDrillSubmission(s) {
      await exec('BEGIN sd_api.save_drill_submission(:u, :item, :ch, :code, :p, :t, :ms, :tl); END;', {
        u: s.userId, item: s.itemId, ch: s.chapterId, code: clob(s.code), p: s.passed, t: s.total, ms: s.elapsedMs, tl: s.timeLimit,
      });
    },
    async drillHistory(userId, limit = 30) {
      return (await rows(`SELECT item_id, chapter_id, passed, total, elapsed_ms, time_limit, sd_api.iso(created_at) AS created_at
                            FROM sd_drill_submissions WHERE user_id = :u ORDER BY id DESC FETCH FIRST :n ROWS ONLY`, { u: userId, n: limit }))
        .map((r) => ({ itemId: r.ITEM_ID, chapterId: r.CHAPTER_ID, passed: r.PASSED, total: r.TOTAL,
          elapsedMs: r.ELAPSED_MS, timeLimit: r.TIME_LIMIT, createdAt: r.CREATED_AT }));
    },
    async bestDrillTimes(userId) {
      return (await rows(`SELECT item_id, MIN(elapsed_ms) AS best FROM sd_drill_submissions
                           WHERE user_id = :u AND passed = total GROUP BY item_id`, { u: userId }))
        .map((r) => ({ itemId: r.ITEM_ID, bestMs: r.BEST }));
    },
  };
}
