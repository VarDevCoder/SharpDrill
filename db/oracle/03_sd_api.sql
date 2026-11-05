-- =====================================================================
-- Paquete SD_API: capa de escritura y consultas de la aplicación.
-- Reglas:
--   * El paquete NO hace COMMIT: la transacción la controla el llamador
--     (node-oracledb con autoCommit en cada llamada).
--   * Errores de negocio con RAISE_APPLICATION_ERROR en el rango -20000..-20999.
--   * Fechas de entrada/salida como texto ISO-8601 UTC para no depender
--     de la zona horaria de la sesión ni del cliente.
-- =====================================================================
CREATE OR REPLACE PACKAGE sd_api AUTHID DEFINER AS
  c_iso CONSTANT VARCHAR2(40) := 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';

  e_email_taken   EXCEPTION;
  PRAGMA EXCEPTION_INIT(e_email_taken, -20001);
  e_not_found     EXCEPTION;
  PRAGMA EXCEPTION_INIT(e_not_found, -20004);

  -- Conversión ISO-8601 <-> TIMESTAMP (UTC)
  FUNCTION to_ts (p_iso IN VARCHAR2) RETURN TIMESTAMP DETERMINISTIC;
  FUNCTION iso (p_ts IN TIMESTAMP) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION utc_now RETURN TIMESTAMP;

  -- Usuarios
  FUNCTION create_user (p_email IN VARCHAR2, p_name IN VARCHAR2, p_password_hash IN VARCHAR2) RETURN NUMBER;
  PROCEDURE update_user (p_user_id IN NUMBER, p_name IN VARCHAR2 DEFAULT NULL, p_daily_goal IN NUMBER DEFAULT NULL);

  -- Sesiones / tokens
  FUNCTION create_session (p_token_hash IN VARCHAR2, p_user_id IN NUMBER, p_kind IN VARCHAR2,
                           p_label IN VARCHAR2, p_expires_at IN VARCHAR2) RETURN NUMBER;
  FUNCTION delete_session (p_user_id IN NUMBER, p_session_id IN NUMBER) RETURN NUMBER;
  PROCEDURE purge_expired_sessions;

  -- Repetición espaciada: calcula SM-2, hace MERGE del estado e inserta el intento
  PROCEDURE record_review (
    p_user_id     IN  NUMBER,
    p_item_id     IN  VARCHAR2,
    p_chapter_id  IN  VARCHAR2,
    p_grade       IN  NUMBER,
    p_mode        IN  VARCHAR2,
    p_correct     IN  NUMBER,
    o_ease        OUT NUMBER,
    o_interval    OUT NUMBER,
    o_reps        OUT NUMBER,
    o_lapses      OUT NUMBER,
    o_due_at      OUT VARCHAR2
  );
  PROCEDURE reset_progress (p_user_id IN NUMBER, p_chapter_id IN VARCHAR2 DEFAULT NULL);

  -- Lectura
  PROCEDURE set_section_read (p_user_id IN NUMBER, p_chapter_id IN VARCHAR2, p_section_id IN VARCHAR2, p_read IN NUMBER);

  -- Tarjetas propias
  FUNCTION create_custom_card (p_user_id IN NUMBER, p_chapter_id IN VARCHAR2, p_front IN CLOB, p_back IN CLOB) RETURN NUMBER;
  PROCEDURE update_custom_card (p_user_id IN NUMBER, p_card_id IN NUMBER, p_chapter_id IN VARCHAR2, p_front IN CLOB, p_back IN CLOB);
  PROCEDURE delete_custom_card (p_user_id IN NUMBER, p_card_id IN NUMBER);

  -- Exámenes
  FUNCTION create_exam (p_user_id IN NUMBER, p_item_ids IN CLOB, p_chapters IN VARCHAR2,
                        p_time_limit IN NUMBER, p_started_at IN VARCHAR2, p_total IN NUMBER) RETURN NUMBER;
  FUNCTION finish_exam (p_user_id IN NUMBER, p_exam_id IN NUMBER, p_score IN NUMBER) RETURN NUMBER;

  -- Drills
  PROCEDURE save_drill_submission (p_user_id IN NUMBER, p_item_id IN VARCHAR2, p_chapter_id IN VARCHAR2,
                                   p_code IN CLOB, p_passed IN NUMBER, p_total IN NUMBER,
                                   p_elapsed_ms IN NUMBER, p_time_limit IN NUMBER);

  -- Consultas que devuelven cursores (SYS_REFCURSOR) al cliente
  FUNCTION get_activity (p_user_id IN NUMBER, p_since_day IN VARCHAR2) RETURN SYS_REFCURSOR;
  FUNCTION get_weak_items (p_user_id IN NUMBER, p_limit IN NUMBER DEFAULT 8) RETURN SYS_REFCURSOR;
END sd_api;
/

CREATE OR REPLACE PACKAGE BODY sd_api AS

  FUNCTION to_ts (p_iso IN VARCHAR2) RETURN TIMESTAMP DETERMINISTIC IS
  BEGIN
    RETURN TO_TIMESTAMP(p_iso, c_iso);
  END to_ts;

  FUNCTION iso (p_ts IN TIMESTAMP) RETURN VARCHAR2 DETERMINISTIC IS
  BEGIN
    RETURN TO_CHAR(p_ts, c_iso);
  END iso;

  FUNCTION utc_now RETURN TIMESTAMP IS
  BEGIN
    RETURN SYS_EXTRACT_UTC(SYSTIMESTAMP);
  END utc_now;

  -- ------------------------------------------------------------------
  FUNCTION create_user (p_email IN VARCHAR2, p_name IN VARCHAR2, p_password_hash IN VARCHAR2) RETURN NUMBER IS
    l_id sd_users.id%TYPE;
  BEGIN
    INSERT INTO sd_users (email, name, password_hash, created_at)
    VALUES (TRIM(p_email), TRIM(p_name), p_password_hash, utc_now)
    RETURNING id INTO l_id;
    RETURN l_id;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      RAISE_APPLICATION_ERROR(-20001, 'Ese email ya está registrado');
  END create_user;

  PROCEDURE update_user (p_user_id IN NUMBER, p_name IN VARCHAR2 DEFAULT NULL, p_daily_goal IN NUMBER DEFAULT NULL) IS
  BEGIN
    UPDATE sd_users
       SET name       = NVL(p_name, name),
           daily_goal = NVL(p_daily_goal, daily_goal)
     WHERE id = p_user_id;
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20004, 'Usuario no encontrado');
    END IF;
  END update_user;

  -- ------------------------------------------------------------------
  FUNCTION create_session (p_token_hash IN VARCHAR2, p_user_id IN NUMBER, p_kind IN VARCHAR2,
                           p_label IN VARCHAR2, p_expires_at IN VARCHAR2) RETURN NUMBER IS
    l_id sd_sessions.id%TYPE;
  BEGIN
    INSERT INTO sd_sessions (token_hash, user_id, kind, label, created_at, expires_at)
    VALUES (p_token_hash, p_user_id, p_kind, p_label, utc_now, to_ts(p_expires_at))
    RETURNING id INTO l_id;
    RETURN l_id;
  END create_session;

  FUNCTION delete_session (p_user_id IN NUMBER, p_session_id IN NUMBER) RETURN NUMBER IS
  BEGIN
    DELETE FROM sd_sessions WHERE user_id = p_user_id AND id = p_session_id;
    RETURN SQL%ROWCOUNT;
  END delete_session;

  PROCEDURE purge_expired_sessions IS
  BEGIN
    DELETE FROM sd_sessions WHERE expires_at < utc_now;
  END purge_expired_sessions;

  -- ------------------------------------------------------------------
  PROCEDURE record_review (
    p_user_id     IN  NUMBER,
    p_item_id     IN  VARCHAR2,
    p_chapter_id  IN  VARCHAR2,
    p_grade       IN  NUMBER,
    p_mode        IN  VARCHAR2,
    p_correct     IN  NUMBER,
    o_ease        OUT NUMBER,
    o_interval    OUT NUMBER,
    o_reps        OUT NUMBER,
    o_lapses      OUT NUMBER,
    o_due_at      OUT VARCHAR2
  ) IS
    l_prev  sd_srs.t_state;
    l_next  sd_srs.t_state;
    l_now   TIMESTAMP := utc_now;
    l_due   TIMESTAMP;
  BEGIN
    -- Bloquea la fila (si existe) para que dos respuestas simultáneas no se pisen
    BEGIN
      SELECT ease, interval_days, reps, lapses
        INTO l_prev.ease, l_prev.interval_days, l_prev.reps, l_prev.lapses
        FROM sd_reviews
       WHERE user_id = p_user_id
         AND item_id = p_item_id
         FOR UPDATE;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        l_prev := sd_srs.initial_state;
    END;

    l_next := sd_srs.schedule(l_prev, p_grade);
    l_due  := l_now + NUMTODSINTERVAL(ROUND(l_next.interval_days * 86400, 3), 'SECOND');

    MERGE INTO sd_reviews r
    USING (SELECT p_user_id AS user_id, p_item_id AS item_id FROM dual) s
       ON (r.user_id = s.user_id AND r.item_id = s.item_id)
     WHEN MATCHED THEN UPDATE SET
          r.chapter_id    = p_chapter_id,
          r.ease          = ROUND(l_next.ease, 4),
          r.interval_days = ROUND(l_next.interval_days, 4),
          r.reps          = l_next.reps,
          r.lapses        = l_next.lapses,
          r.due_at        = l_due,
          r.last_grade    = p_grade,
          r.updated_at    = l_now
     WHEN NOT MATCHED THEN INSERT
          (user_id, item_id, chapter_id, ease, interval_days, reps, lapses, due_at, last_grade, updated_at)
          VALUES (p_user_id, p_item_id, p_chapter_id, ROUND(l_next.ease, 4), ROUND(l_next.interval_days, 4),
                  l_next.reps, l_next.lapses, l_due, p_grade, l_now);

    INSERT INTO sd_attempts (user_id, item_id, chapter_id, attempt_mode, correct, created_at)
    VALUES (p_user_id, p_item_id, p_chapter_id, p_mode, p_correct, l_now);

    o_ease     := ROUND(l_next.ease, 4);
    o_interval := ROUND(l_next.interval_days, 4);
    o_reps     := l_next.reps;
    o_lapses   := l_next.lapses;
    o_due_at   := iso(l_due);
  END record_review;

  PROCEDURE reset_progress (p_user_id IN NUMBER, p_chapter_id IN VARCHAR2 DEFAULT NULL) IS
  BEGIN
    DELETE FROM sd_reviews
     WHERE user_id = p_user_id
       AND (p_chapter_id IS NULL OR chapter_id = p_chapter_id);
    DELETE FROM sd_sections_read
     WHERE user_id = p_user_id
       AND (p_chapter_id IS NULL OR chapter_id = p_chapter_id);
  END reset_progress;

  -- ------------------------------------------------------------------
  PROCEDURE set_section_read (p_user_id IN NUMBER, p_chapter_id IN VARCHAR2, p_section_id IN VARCHAR2, p_read IN NUMBER) IS
  BEGIN
    IF p_read = 1 THEN
      MERGE INTO sd_sections_read t
      USING (SELECT p_user_id AS user_id, p_chapter_id AS chapter_id, p_section_id AS section_id FROM dual) s
         ON (t.user_id = s.user_id AND t.chapter_id = s.chapter_id AND t.section_id = s.section_id)
       WHEN NOT MATCHED THEN INSERT (user_id, chapter_id, section_id, read_at)
            VALUES (s.user_id, s.chapter_id, s.section_id, utc_now);
    ELSE
      DELETE FROM sd_sections_read
       WHERE user_id = p_user_id AND chapter_id = p_chapter_id AND section_id = p_section_id;
    END IF;
  END set_section_read;

  -- ------------------------------------------------------------------
  FUNCTION create_custom_card (p_user_id IN NUMBER, p_chapter_id IN VARCHAR2, p_front IN CLOB, p_back IN CLOB) RETURN NUMBER IS
    l_id sd_custom_cards.id%TYPE;
  BEGIN
    INSERT INTO sd_custom_cards (user_id, chapter_id, front, back, created_at)
    VALUES (p_user_id, p_chapter_id, p_front, p_back, utc_now)
    RETURNING id INTO l_id;
    RETURN l_id;
  END create_custom_card;

  PROCEDURE update_custom_card (p_user_id IN NUMBER, p_card_id IN NUMBER, p_chapter_id IN VARCHAR2, p_front IN CLOB, p_back IN CLOB) IS
  BEGIN
    UPDATE sd_custom_cards
       SET chapter_id = p_chapter_id, front = p_front, back = p_back
     WHERE id = p_card_id AND user_id = p_user_id;
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20004, 'Tarjeta no encontrada');
    END IF;
    UPDATE sd_reviews SET chapter_id = p_chapter_id
     WHERE user_id = p_user_id AND item_id = 'u.' || p_card_id;
  END update_custom_card;

  PROCEDURE delete_custom_card (p_user_id IN NUMBER, p_card_id IN NUMBER) IS
  BEGIN
    DELETE FROM sd_custom_cards WHERE id = p_card_id AND user_id = p_user_id;
    DELETE FROM sd_reviews WHERE user_id = p_user_id AND item_id = 'u.' || p_card_id;
  END delete_custom_card;

  -- ------------------------------------------------------------------
  FUNCTION create_exam (p_user_id IN NUMBER, p_item_ids IN CLOB, p_chapters IN VARCHAR2,
                        p_time_limit IN NUMBER, p_started_at IN VARCHAR2, p_total IN NUMBER) RETURN NUMBER IS
    l_id sd_exams.id%TYPE;
  BEGIN
    INSERT INTO sd_exams (user_id, item_ids, chapters, time_limit, started_at, total)
    VALUES (p_user_id, p_item_ids, p_chapters, p_time_limit, to_ts(p_started_at), p_total)
    RETURNING id INTO l_id;
    RETURN l_id;
  END create_exam;

  -- Devuelve 1 si se entregó ahora, 0 si ya estaba entregado (UPDATE condicional = sin carreras)
  FUNCTION finish_exam (p_user_id IN NUMBER, p_exam_id IN NUMBER, p_score IN NUMBER) RETURN NUMBER IS
  BEGIN
    UPDATE sd_exams
       SET finished_at = utc_now, score = p_score
     WHERE id = p_exam_id AND user_id = p_user_id AND finished_at IS NULL;
    RETURN SQL%ROWCOUNT;
  END finish_exam;

  -- ------------------------------------------------------------------
  PROCEDURE save_drill_submission (p_user_id IN NUMBER, p_item_id IN VARCHAR2, p_chapter_id IN VARCHAR2,
                                   p_code IN CLOB, p_passed IN NUMBER, p_total IN NUMBER,
                                   p_elapsed_ms IN NUMBER, p_time_limit IN NUMBER) IS
  BEGIN
    INSERT INTO sd_drill_submissions (user_id, item_id, chapter_id, code, passed, total, elapsed_ms, time_limit, created_at)
    VALUES (p_user_id, p_item_id, p_chapter_id, p_code, p_passed, p_total, p_elapsed_ms, p_time_limit, utc_now);
  END save_drill_submission;

  -- ------------------------------------------------------------------
  FUNCTION get_activity (p_user_id IN NUMBER, p_since_day IN VARCHAR2) RETURN SYS_REFCURSOR IS
    l_rc SYS_REFCURSOR;
  BEGIN
    OPEN l_rc FOR
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS activity_day,
             COUNT(*)                          AS n,
             SUM(correct)                      AS ok
        FROM sd_attempts
       WHERE user_id = p_user_id
         AND created_at >= TO_TIMESTAMP(p_since_day, 'YYYY-MM-DD')
       GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
       ORDER BY activity_day;
    RETURN l_rc;
  END get_activity;

  FUNCTION get_weak_items (p_user_id IN NUMBER, p_limit IN NUMBER DEFAULT 8) RETURN SYS_REFCURSOR IS
    l_rc SYS_REFCURSOR;
  BEGIN
    OPEN l_rc FOR
      SELECT item_id, chapter_id, ease, interval_days, reps, lapses,
             iso(due_at) AS due_at, last_grade, iso(updated_at) AS updated_at
        FROM sd_reviews
       WHERE user_id = p_user_id
         AND (last_grade = 0 OR lapses > 0)
       ORDER BY last_grade, lapses DESC, ease
       FETCH FIRST p_limit ROWS ONLY;
    RETURN l_rc;
  END get_weak_items;

END sd_api;
/
