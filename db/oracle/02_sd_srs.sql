-- =====================================================================
-- Paquete SD_SRS: algoritmo de repetición espaciada SM-2 en PL/SQL.
-- Es el mismo algoritmo que server/src/srs.js (los tests de 90_selftest.sql
-- comprueban que ambos producen los mismos valores).
-- =====================================================================
CREATE OR REPLACE PACKAGE sd_srs AUTHID DEFINER AS
  c_min_ease      CONSTANT NUMBER := 1.3;
  c_default_ease  CONSTANT NUMBER := 2.5;
  c_relearn_days  CONSTANT NUMBER := 10 / 1440;   -- 10 minutos expresados en días

  TYPE t_state IS RECORD (
    ease           NUMBER,
    interval_days  NUMBER,
    reps           PLS_INTEGER,
    lapses         PLS_INTEGER
  );

  FUNCTION initial_state RETURN t_state;

  -- p_grade: 0 = Otra vez, 1 = Difícil, 2 = Bien, 3 = Fácil
  FUNCTION schedule (p_prev IN t_state, p_grade IN PLS_INTEGER) RETURN t_state;

  -- Dominio 0..1 (curva logarítmica: 21 días o más = dominado)
  FUNCTION mastery (p_reps IN NUMBER, p_interval_days IN NUMBER) RETURN NUMBER DETERMINISTIC;
END sd_srs;
/

CREATE OR REPLACE PACKAGE BODY sd_srs AS

  FUNCTION initial_state RETURN t_state IS
    l_state t_state;
  BEGIN
    l_state.ease          := c_default_ease;
    l_state.interval_days := 0;
    l_state.reps          := 0;
    l_state.lapses        := 0;
    RETURN l_state;
  END initial_state;

  FUNCTION schedule (p_prev IN t_state, p_grade IN PLS_INTEGER) RETURN t_state IS
    l_s       t_state := p_prev;
    l_q       PLS_INTEGER;
    l_base    NUMBER;
    l_factor  NUMBER;
  BEGIN
    IF p_grade IS NULL OR p_grade NOT BETWEEN 0 AND 3 THEN
      RAISE_APPLICATION_ERROR(-20010, 'grade debe estar entre 0 y 3');
    END IF;

    IF p_grade = 0 THEN
      IF l_s.reps > 0 THEN
        l_s.lapses := l_s.lapses + 1;
      END IF;
      l_s.reps          := 0;
      l_s.ease          := GREATEST(c_min_ease, l_s.ease - 0.2);
      l_s.interval_days := c_relearn_days;
    ELSE
      -- Ajuste de facilidad SM-2 con q en escala 3..5
      l_q      := p_grade + 2;
      l_s.ease := GREATEST(c_min_ease, l_s.ease + (0.1 - (5 - l_q) * (0.08 + (5 - l_q) * 0.02)));

      IF l_s.reps = 0 THEN
        l_s.interval_days := CASE p_grade WHEN 1 THEN 0.5 WHEN 2 THEN 1 ELSE 3 END;
      ELSIF l_s.reps = 1 THEN
        l_s.interval_days := CASE p_grade WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 6 END;
      ELSE
        l_base   := GREATEST(1, l_s.interval_days);
        l_factor := CASE p_grade WHEN 1 THEN 1.2 WHEN 2 THEN l_s.ease ELSE l_s.ease * 1.3 END;
        l_s.interval_days := LEAST(365, l_base * l_factor);
      END IF;
      l_s.reps := l_s.reps + 1;
    END IF;

    RETURN l_s;
  END schedule;

  FUNCTION mastery (p_reps IN NUMBER, p_interval_days IN NUMBER) RETURN NUMBER DETERMINISTIC IS
  BEGIN
    IF NVL(p_reps, 0) = 0 THEN
      RETURN 0;
    END IF;
    RETURN LEAST(1, LOG(2, 1 + p_interval_days) / LOG(2, 22));
  END mastery;

END sd_srs;
/
