-- =====================================================================
-- Autotest de los paquetes PL/SQL (se ejecuta en una transacción y hace ROLLBACK).
-- Uso:  sqlplus sharpdrill/<pwd>@//localhost:1521/FREEPDB1 @90_selftest.sql
-- =====================================================================
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

DECLARE
  l_s       sd_srs.t_state;
  l_user    NUMBER;
  l_ease    NUMBER;
  l_int     NUMBER;
  l_reps    NUMBER;
  l_lapses  NUMBER;
  l_due     VARCHAR2(40);
  l_count   NUMBER;

  PROCEDURE assert_eq (p_name VARCHAR2, p_actual NUMBER, p_expected NUMBER) IS
  BEGIN
    IF ROUND(p_actual, 4) <> ROUND(p_expected, 4) OR p_actual IS NULL THEN
      RAISE_APPLICATION_ERROR(-20999, p_name || ': esperado ' || p_expected || ', obtenido ' || p_actual);
    END IF;
    DBMS_OUTPUT.PUT_LINE('  OK ' || p_name);
  END assert_eq;
BEGIN
  DBMS_OUTPUT.PUT_LINE('SD_SRS');
  l_s := sd_srs.schedule(sd_srs.initial_state, 0);
  assert_eq('fallo baja ease a 2.3', l_s.ease, 2.3);
  assert_eq('fallo → 10 minutos', l_s.interval_days, 10 / 1440);

  l_s := sd_srs.schedule(sd_srs.initial_state, 2);
  assert_eq('1er acierto → 1 día', l_s.interval_days, 1);
  l_s := sd_srs.schedule(l_s, 2);
  assert_eq('2º acierto → 3 días', l_s.interval_days, 3);
  l_s := sd_srs.schedule(l_s, 0);
  assert_eq('olvido suma lapse', l_s.lapses, 1);
  assert_eq('dominio sin repasos = 0', sd_srs.mastery(0, 10), 0);
  assert_eq('dominio 21 días = 1', sd_srs.mastery(3, 21), 1);

  DBMS_OUTPUT.PUT_LINE('SD_API');
  l_user := sd_api.create_user('selftest@example.com', 'Self Test', 'scrypt$00$00');
  sd_api.record_review(l_user, 'ch14.q1', 'ch14', 2, 'practice', 1, l_ease, l_int, l_reps, l_lapses, l_due);
  assert_eq('record_review nuevo → 1 día', l_int, 1);
  sd_api.record_review(l_user, 'ch14.q1', 'ch14', 2, 'practice', 1, l_ease, l_int, l_reps, l_lapses, l_due);
  assert_eq('record_review existente → 3 días', l_int, 3);

  SELECT COUNT(*) INTO l_count FROM sd_attempts WHERE user_id = l_user;
  assert_eq('2 intentos registrados', l_count, 2);

  BEGIN
    l_user := sd_api.create_user('SELFTEST@example.com', 'Dup', 'x');
    RAISE_APPLICATION_ERROR(-20999, 'debía fallar el email duplicado');
  EXCEPTION
    WHEN sd_api.e_email_taken THEN DBMS_OUTPUT.PUT_LINE('  OK email duplicado (sin distinguir mayúsculas)');
  END;

  ROLLBACK;
  DBMS_OUTPUT.PUT_LINE('Todo correcto');
END;
/
