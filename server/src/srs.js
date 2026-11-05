/**
 * Repetición espaciada basada en SM-2 (SuperMemo 2) con 4 botones, como Anki.
 *
 * grade: 0 = Otra vez (fallo), 1 = Difícil, 2 = Bien, 3 = Fácil
 * interval se expresa en días (puede ser fraccionario: 10 min = 0.0069 días).
 */
export const GRADES = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;
const RELEARN_MINUTES = 10;
const DAY_MS = 86_400_000;

export function initialState() {
  return { ease: DEFAULT_EASE, interval: 0, reps: 0, lapses: 0 };
}

/**
 * Calcula el siguiente estado a partir del estado previo y la calificación.
 * Función pura: no toca la base de datos, fácil de testear.
 */
export function schedule(prev, grade, now = new Date()) {
  if (![0, 1, 2, 3].includes(grade)) throw new RangeError('grade debe ser 0..3');
  const s = { ...(prev ?? initialState()) };

  if (grade === GRADES.AGAIN) {
    s.lapses += s.reps > 0 ? 1 : 0;
    s.reps = 0;
    s.ease = Math.max(MIN_EASE, s.ease - 0.2);
    s.interval = RELEARN_MINUTES / (24 * 60);
  } else {
    // Ajuste de facilidad estilo SM-2: q en escala 3..5
    const q = grade + 2;
    s.ease = Math.max(MIN_EASE, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

    if (s.reps === 0) {
      s.interval = grade === GRADES.HARD ? 0.5 : grade === GRADES.GOOD ? 1 : 3;
    } else if (s.reps === 1) {
      s.interval = grade === GRADES.HARD ? 2 : grade === GRADES.GOOD ? 3 : 6;
    } else {
      const base = Math.max(1, s.interval);
      const factor = grade === GRADES.HARD ? 1.2 : grade === GRADES.GOOD ? s.ease : s.ease * 1.3;
      s.interval = Math.min(365, base * factor);
    }
    s.reps += 1;
  }

  const dueAt = new Date(now.getTime() + Math.round(s.interval * DAY_MS));
  s.interval = Math.round(s.interval * 10000) / 10000; // solo para almacenar/mostrar
  return { ...s, dueAt: dueAt.toISOString(), grade };
}

/** Nivel de dominio 0..1 de un elemento para las barras de progreso. */
export function mastery(state) {
  if (!state || state.reps === 0) return 0;
  // Curva logarítmica: 1 día ≈ 22 %, 3 días ≈ 45 %, 10 días ≈ 78 %, 21+ días = dominado
  return Math.min(1, Math.log2(1 + state.interval) / Math.log2(22));
}
