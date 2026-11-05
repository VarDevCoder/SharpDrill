import { Router } from 'express';
import { requireUser } from '../auth.js';
import { httpError } from '../errors.js';

/** Tarjetas propias del alumno: también entran en la cola de repaso espaciado. */
export default function customCardRoutes({ db, content }) {
  const r = Router();
  r.use(requireUser);

  const validate = (body) => {
    const chapterId = String(body?.chapterId ?? '');
    const front = String(body?.front ?? '').trim();
    const back = String(body?.back ?? '').trim();
    if (!content.chapterById.has(chapterId)) throw httpError(400, 'Capítulo inválido');
    if (front.length < 3 || front.length > 2000) throw httpError(400, 'El anverso debe tener entre 3 y 2000 caracteres');
    if (back.length < 1 || back.length > 4000) throw httpError(400, 'El reverso debe tener entre 1 y 4000 caracteres');
    return { chapterId, front, back };
  };
  const toDto = (row) => ({ id: `u.${row.id}`, chapterId: row.chapter_id, front: row.front, back: row.back, createdAt: row.created_at });

  r.get('/', (req, res) => {
    const rows = req.query.chapter
      ? db.prepare('SELECT * FROM custom_cards WHERE user_id = ? AND chapter_id = ? ORDER BY id DESC').all(req.user.id, String(req.query.chapter))
      : db.prepare('SELECT * FROM custom_cards WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    res.json({ cards: rows.map(toDto) });
  });

  r.post('/', (req, res) => {
    const { chapterId, front, back } = validate(req.body);
    const { lastInsertRowid } = db.prepare('INSERT INTO custom_cards (user_id, chapter_id, front, back) VALUES (?, ?, ?, ?)')
      .run(req.user.id, chapterId, front, back);
    res.status(201).json({ card: toDto(db.prepare('SELECT * FROM custom_cards WHERE id = ?').get(lastInsertRowid)) });
  });

  const ownId = (req) => {
    const m = /^(?:u\.)?(\d+)$/.exec(req.params.id);
    if (!m) throw httpError(400, 'id inválido');
    const row = db.prepare('SELECT * FROM custom_cards WHERE id = ? AND user_id = ?').get(Number(m[1]), req.user.id);
    if (!row) throw httpError(404, 'Tarjeta no encontrada');
    return row;
  };

  r.put('/:id', (req, res) => {
    const row = ownId(req);
    const { chapterId, front, back } = validate(req.body);
    db.prepare('UPDATE custom_cards SET chapter_id = ?, front = ?, back = ? WHERE id = ?').run(chapterId, front, back, row.id);
    db.prepare('UPDATE reviews SET chapter_id = ? WHERE user_id = ? AND item_id = ?').run(chapterId, req.user.id, `u.${row.id}`);
    res.json({ card: toDto(db.prepare('SELECT * FROM custom_cards WHERE id = ?').get(row.id)) });
  });

  r.delete('/:id', (req, res) => {
    const row = ownId(req);
    db.prepare('DELETE FROM custom_cards WHERE id = ?').run(row.id);
    db.prepare('DELETE FROM reviews WHERE user_id = ? AND item_id = ?').run(req.user.id, `u.${row.id}`);
    res.json({ ok: true });
  });

  return r;
}
