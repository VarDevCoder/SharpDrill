import { Router } from 'express';
import { requireUser } from '../auth.js';
import { httpError } from '../errors.js';

const DAY_MS = 86_400_000;
const dayKey = (d) => d.toISOString().slice(0, 10);

/** Racha: días consecutivos con actividad terminando hoy (o ayer, si hoy aún no hay). */
export function computeStreak(daysWithActivity, today = new Date()) {
  const set = new Set(daysWithActivity);
  let cursor = new Date(today);
  if (!set.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  let streak = 0;
  while (set.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

const pct = (ok, n) => (n ? Math.round((ok / n) * 100) : null);

export default function statsRoutes({ repo, content, progress }) {
  const r = Router();
  r.use(requireUser);

  r.get('/', async (req, res) => {
    const userId = req.user.id;
    const now = new Date();
    const since = new Date(now.getTime() - 83 * DAY_MS);

    const [activityRows, days, totals, byChapter, byModeRows, dueNow, weakRows, summaries] = await Promise.all([
      repo.activity(userId, dayKey(since)),
      repo.activeDays(userId),
      repo.totals(userId),
      repo.accuracyBy(userId, 'chapter'),
      repo.accuracyBy(userId, 'mode'),
      repo.countDue(userId, null, now),
      repo.weakItems(userId, 8),
      progress.chapterSummaries(userId, now),
    ]);

    const byDay = new Map(activityRows.map((a) => [a.day, a.count]));
    const activity = Array.from({ length: 84 }, (_, i) => {
      const d = dayKey(new Date(since.getTime() + i * DAY_MS));
      return { day: d, count: byDay.get(d) ?? 0 };
    });

    const forecast = [];
    for (let i = 1; i <= 7; i++) {
      const from = new Date(now.getTime() + (i - 1) * DAY_MS);
      const to = new Date(now.getTime() + i * DAY_MS);
      forecast.push({ day: dayKey(to), count: await repo.countDue(userId, from, to) });
    }

    const weak = [];
    for (const rv of weakRows) {
      const it = await progress.resolveItem(userId, rv.itemId);
      if (!it) continue;
      weak.push({
        id: rv.itemId, chapterId: it.chapterId, kind: it.kind, lapses: rv.lapses, lastGrade: rv.lastGrade,
        text: it.kind === 'card' ? it.public.front : it.kind === 'drill' ? it.public.title : it.public.prompt,
      });
    }

    const acc = new Map(byChapter.map((x) => [x.key, x]));
    res.json({
      streak: computeStreak(days, now),
      today: byDay.get(dayKey(now)) ?? 0,
      dailyGoal: req.user.dailyGoal,
      dueNow,
      totals: { ...totals, accuracy: pct(totals.correct, totals.attempts) ?? 0 },
      activity,
      forecast,
      byMode: byModeRows.map((m) => ({ mode: m.key, count: m.count, accuracy: pct(m.correct, m.count) })),
      chapters: summaries.map((c) => {
        const a = acc.get(c.id);
        return { ...c, attempts: a?.count ?? 0, accuracy: a ? pct(a.correct, a.count) : null };
      }),
      tracks: Object.values(content.tracks).map((t) => {
        const cs = summaries.filter((c) => c.track === t.id);
        return { ...t, chapters: cs.length, mastery: Math.round(cs.reduce((s, c) => s + c.mastery, 0) / (cs.length || 1)) };
      }),
      weak,
    });
  });

  /** Reinicia el progreso de un capítulo (o de todo, si no se indica). */
  r.delete('/progress', async (req, res) => {
    const ch = req.query.chapter ? String(req.query.chapter) : null;
    if (ch && !content.chapterById.has(ch)) throw httpError(404, 'Capítulo no encontrado');
    await repo.resetProgress(req.user.id, ch);
    res.json({ ok: true });
  });

  return r;
}
