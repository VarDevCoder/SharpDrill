import { mastery } from './srs.js';
import { publicCard, publicQuestion, publicDrill } from './content.js';

/** Lógica compartida de progreso sobre el repositorio (independiente del motor de BD). */
export function createProgress(repo, content) {
  /** Resuelve un id global ("ch01.q3", "ch14.d1" o "u.17") a { kind, chapterId, data, public }. */
  async function resolveItem(userId, itemId) {
    if (typeof itemId !== 'string') return null;
    if (itemId.startsWith('u.')) {
      // Solo la forma canónica: "u.01" o "u.1e0" apuntarían a la misma tarjeta con otro id de repaso
      if (!/^u\.[1-9]\d*$/.test(itemId)) return null;
      const id = Number(itemId.slice(2));
      const card = await repo.getCustomCard(userId, id);
      if (!card) return null;
      return {
        kind: 'card', chapterId: card.chapterId, custom: true, data: card,
        public: { id: itemId, kind: 'card', chapterId: card.chapterId, front: card.front, back: card.back, custom: true },
      };
    }
    const it = content.items.get(itemId);
    if (!it) return null;
    const pub = it.kind === 'card' ? publicCard(itemId, it.data, it.chapterId)
      : it.kind === 'drill' ? publicDrill(itemId, it.data, it.chapterId)
      : publicQuestion(itemId, it.data, it.chapterId);
    return { ...it, public: pub };
  }

  function record(userId, itemId, chapterId, grade, mode, correct, now = new Date()) {
    return repo.recordReview({ userId, itemId, chapterId, grade, mode, correct, now });
  }

  /** Resumen de progreso de cada capítulo para un usuario. */
  async function chapterSummaries(userId, now = new Date()) {
    const [reviews, read] = await Promise.all([repo.getReviews(userId), repo.sectionsRead(userId)]);
    const nowIso = now.toISOString();
    return content.chapters.map((ch) => {
      const prefix = ch.id + '.';
      const mine = reviews.filter((r) => r.itemId.startsWith(prefix));
      const total = ch.cards.length + ch.questions.length + ch.drills.length;
      const m = mine.reduce((acc, r) => acc + mastery(r), 0) / (total || 1);
      // Completado: secciones leídas + elementos practicados al menos una vez (solo los que siguen existiendo)
      const sectionIds = new Set(ch.sections.map((s) => s.id));
      const sectionsRead = read.filter((r) => r.chapterId === ch.id && sectionIds.has(r.sectionId)).length;
      const practiced = mine.filter((r) => content.items.has(r.itemId)).length;
      const steps = ch.sections.length + total;
      return {
        id: ch.id, number: ch.number, title: ch.title, summary: ch.summary, level: ch.level, track: ch.track,
        sections: ch.sections.length, cards: ch.cards.length, questions: ch.questions.length,
        drills: ch.drills.length, snippets: ch.snippets.length,
        sectionsRead, seen: practiced, total,
        due: mine.filter((r) => r.dueAt <= nowIso).length,
        mastery: Math.round(m * 100),
        completion: Math.floor(((sectionsRead + practiced) / (steps || 1)) * 100),
      };
    });
  }

  return { resolveItem, record, chapterSummaries };
}
