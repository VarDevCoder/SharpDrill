import { Router } from 'express';
import { requireUser } from '../auth.js';
import { httpError } from '../errors.js';

/** Tarjetas propias del alumno: también entran en la cola de repaso espaciado. */
export default function customCardRoutes({ repo, content }) {
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
  const dto = ({ numericId, ...c }) => c;

  const ownCard = async (req) => {
    const m = /^(?:u\.)?(\d+)$/.exec(req.params.id);
    if (!m) throw httpError(400, 'id inválido');
    const card = await repo.getCustomCard(req.user.id, Number(m[1]));
    if (!card) throw httpError(404, 'Tarjeta no encontrada');
    return card;
  };

  r.get('/', async (req, res) => {
    const cards = await repo.listCustomCards(req.user.id, req.query.chapter ? String(req.query.chapter) : null);
    res.json({ cards: cards.map(dto) });
  });

  r.post('/', async (req, res) => {
    res.status(201).json({ card: dto(await repo.createCustomCard(req.user.id, validate(req.body))) });
  });

  r.put('/:id', async (req, res) => {
    const card = await ownCard(req);
    res.json({ card: dto(await repo.updateCustomCard(req.user.id, card.numericId, validate(req.body))) });
  });

  r.delete('/:id', async (req, res) => {
    const card = await ownCard(req);
    await repo.deleteCustomCard(req.user.id, card.numericId);
    res.json({ ok: true });
  });

  return r;
}
