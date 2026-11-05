import { Router } from 'express';
import { requireUser } from '../auth.js';

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

export default function statsRoutes({ db, content, progress }) {
  const r = Router();
  r.use(requireUser);

  r.get('/', (req, res) => {
    const userId = req.user.id;
    const now = new Date();
    const since = new Date(now.getTime() - 83 * DAY_MS);

    const activityRows = db.prepare(`
      SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n, SUM(correct) AS ok
      FROM attempts WHERE user_id = ? AND created_at >= ? GROUP BY day ORDER BY day`)
      .all(userId, dayKey(since));
    const allDays = db.prepare('SELECT DISTINCT substr(created_at, 1, 10) AS day FROM attempts WHERE user_id = ?')
      .all(userId).map((x) => x.day);

    const activity = [];
    for (let i = 0; i < 84; i++) {
      const d = dayKey(new Date(since.getTime() + i * DAY_MS));
      const row = activityRows.find((x) => x.day === d);
      activity.push({ day: d, count: row?.n ?? 0 });
    }

    const totals = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS ok FROM attempts WHERE user_id = ?').get(userId);
    const byChapterAcc = new Map(db.prepare(`
      SELECT chapter_id, COUNT(*) AS n, SUM(correct) AS ok FROM attempts WHERE user_id = ? GROUP BY chapter_id`)
      .all(userId).map((x) => [x.chapter_id, x]));
    const byMode = db.prepare(`SELECT mode, COUNT(*) AS n, SUM(correct) AS ok FROM attempts WHERE user_id = ? GROUP BY mode`)
      .all(userId).map((x) => ({ mode: x.mode, count: x.n, accuracy: Math.round((x.ok / x.n) * 100) }));

    const nowIso = now.toISOString();
    const dueNow = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND due_at <= ?').get(userId, nowIso).n;
    const forecast = [];
    for (let i = 1; i <= 7; i++) {
      const end = new Date(now.getTime() + i * DAY_MS).toISOString();
      const start = new Date(now.getTime() + (i - 1) * DAY_MS).toISOString();
      forecast.push({
        day: dayKey(new Date(now.getTime() + i * DAY_MS)),
        count: db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND due_at > ? AND due_at <= ?').get(userId, start, end).n,
      });
    }

    const weak = db.prepare(`SELECT item_id, lapses, ease, last_grade FROM reviews
      WHERE user_id = ? AND (last_grade = 0 OR lapses > 0) ORDER BY last_grade ASC, lapses DESC, ease ASC LIMIT 8`)
      .all(userId)
      .map((rv) => {
        const it = progress.resolveItem(userId, rv.item_id);
        if (!it) return null;
        return {
          id: rv.item_id, chapterId: it.chapterId, kind: it.kind, lapses: rv.lapses, lastGrade: rv.last_grade,
          text: it.kind === 'card' ? it.public.front : it.public.prompt,
        };
      })
      .filter(Boolean);

    const todayCount = activity.at(-1)?.count ?? 0;
    res.json({
      streak: computeStreak(allDays, now),
      today: todayCount,
      dailyGoal: req.user.dailyGoal,
      dueNow,
      totals: { attempts: totals.n, correct: totals.ok, accuracy: totals.n ? Math.round((totals.ok / totals.n) * 100) : 0 },
      activity,
      forecast,
      byMode,
      chapters: progress.chapterSummaries(userId, now).map((c) => {
        const a = byChapterAcc.get(c.id);
        return { ...c, attempts: a?.n ?? 0, accuracy: a ? Math.round((a.ok / a.n) * 100) : null };
      }),
      weak,
    });
  });

  /** Reinicia el progreso de un capítulo (o de todo, si no se indica). */
  r.delete('/progress', (req, res) => {
    const userId = req.user.id;
    const ch = req.query.chapter ? String(req.query.chapter) : null;
    if (ch && !content.chapterById.has(ch)) return res.status(404).json({ error: 'Capítulo no encontrado' });
    if (ch) {
      db.prepare('DELETE FROM reviews WHERE user_id = ? AND chapter_id = ?').run(userId, ch);
      db.prepare('DELETE FROM sections_read WHERE user_id = ? AND chapter_id = ?').run(userId, ch);
    } else {
      db.prepare('DELETE FROM reviews WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM sections_read WHERE user_id = ?').run(userId);
    }
    res.json({ ok: true });
  });

  return r;
}
