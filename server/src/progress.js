import { schedule, mastery } from './srs.js';
import { publicCard, publicQuestion } from './content.js';
import { tx } from './db.js';

/**
 * Lógica compartida de progreso: resolver elementos, registrar repasos
 * y calcular el avance por capítulo.
 */
export function createProgress(db, content) {
  const q = {
    getReview: db.prepare('SELECT * FROM reviews WHERE user_id = ? AND item_id = ?'),
    upsertReview: db.prepare(`
      INSERT INTO reviews (user_id, item_id, chapter_id, ease, interval, reps, lapses, due_at, last_grade, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, item_id) DO UPDATE SET
        ease = excluded.ease, interval = excluded.interval, reps = excluded.reps,
        lapses = excluded.lapses, due_at = excluded.due_at, last_grade = excluded.last_grade,
        updated_at = excluded.updated_at`),
    insertAttempt: db.prepare(
      'INSERT INTO attempts (user_id, item_id, chapter_id, mode, correct, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    customCard: db.prepare('SELECT * FROM custom_cards WHERE id = ? AND user_id = ?'),
    reviewsByUser: db.prepare('SELECT * FROM reviews WHERE user_id = ?'),
    sectionsRead: db.prepare('SELECT chapter_id, section_id FROM sections_read WHERE user_id = ?'),
  };

  /** Resuelve un id global ("ch01.q3" o "u.17") a { kind, chapterId, data, public }. */
  function resolveItem(userId, itemId) {
    if (itemId?.startsWith('u.')) {
      const row = q.customCard.get(Number(itemId.slice(2)), userId);
      if (!row) return null;
      return {
        kind: 'card', chapterId: row.chapter_id, custom: true, data: row,
        public: { id: itemId, kind: 'card', chapterId: row.chapter_id, front: row.front, back: row.back, custom: true },
      };
    }
    const it = content.items.get(itemId);
    if (!it) return null;
    const pub = it.kind === 'card'
      ? publicCard(itemId, it.data, it.chapterId)
      : publicQuestion(itemId, it.data, it.chapterId);
    return { ...it, public: pub };
  }

  /** Aplica SM-2 y guarda el intento. Devuelve el nuevo estado. */
  function record(userId, itemId, chapterId, grade, mode, correct, now = new Date()) {
    const prev = q.getReview.get(userId, itemId);
    const next = schedule(prev, grade, now);
    const iso = now.toISOString();
    tx(db, () => {
      q.upsertReview.run(userId, itemId, chapterId, next.ease, next.interval, next.reps,
        next.lapses, next.dueAt, grade, iso);
      q.insertAttempt.run(userId, itemId, chapterId, mode, correct ? 1 : 0, iso);
    });
    return next;
  }

  /** Resumen de progreso de cada capítulo para un usuario. */
  function chapterSummaries(userId, now = new Date()) {
    const reviews = q.reviewsByUser.all(userId);
    const read = q.sectionsRead.all(userId);
    const nowIso = now.toISOString();
    return content.chapters.map((ch) => {
      const prefix = ch.id + '.';
      const mine = reviews.filter((r) => r.item_id.startsWith(prefix));
      const total = ch.cards.length + ch.questions.length;
      const m = mine.reduce((acc, r) => acc + mastery(r), 0) / (total || 1);
      return {
        id: ch.id,
        number: ch.number,
        title: ch.title,
        summary: ch.summary,
        level: ch.level,
        sections: ch.sections.length,
        cards: ch.cards.length,
        questions: ch.questions.length,
        sectionsRead: read.filter((r) => r.chapter_id === ch.id).length,
        seen: mine.length,
        total,
        due: mine.filter((r) => r.due_at <= nowIso).length,
        mastery: Math.round(m * 100),
      };
    });
  }

  return { resolveItem, record, chapterSummaries };
}
