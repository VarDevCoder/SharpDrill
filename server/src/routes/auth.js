import { Router } from 'express';
import {
  hashPassword, verifyPassword, issueToken, hashToken, setSessionCookie, clearSessionCookie, requireUser,
} from '../auth.js';
import { httpError } from '../errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function authRoutes({ repo, secureCookies }) {
  const r = Router();

  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, dailyGoal: u.dailyGoal });

  r.post('/register', async (req, res) => {
    const email = String(req.body?.email ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!EMAIL_RE.test(email)) throw httpError(400, 'Email inválido');
    if (name.length < 2 || name.length > 60) throw httpError(400, 'El nombre debe tener entre 2 y 60 caracteres');
    if (password.length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres');
    if (await repo.findUserByEmail(email)) throw httpError(409, 'Ese email ya está registrado');

    let id;
    try {
      id = await repo.createUser({ email, name, passwordHash: hashPassword(password) });
    } catch (e) {
      // Dos registros simultáneos con el mismo email: el segundo choca con el UNIQUE
      if (e.status || !(await repo.findUserByEmail(email))) throw e;
      throw httpError(409, 'Ese email ya está registrado');
    }
    const { token, expiresAt } = await issueToken(repo, id);
    setSessionCookie(res, token, expiresAt, secureCookies);
    res.status(201).json({ user: { id, email, name, dailyGoal: 20 }, token, tokenType: 'Bearer', expiresAt });
  });

  /** Login: devuelve el token (para usarlo como Bearer en curl/Postman) y además fija la cookie HttpOnly. */
  r.post('/login', async (req, res) => {
    const email = String(req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');
    const u = await repo.findUserByEmail(email);
    if (!u || !verifyPassword(password, u.passwordHash)) throw httpError(401, 'Email o contraseña incorrectos');
    await repo.purgeExpiredSessions(); // en serverless no hay arranque del servidor donde limpiar
    const { token, expiresAt } = await issueToken(repo, u.id);
    setSessionCookie(res, token, expiresAt, secureCookies);
    res.json({ user: publicUser(u), token, tokenType: 'Bearer', expiresAt });
  });

  r.post('/logout', async (req, res) => {
    if (req.token) await repo.deleteSessionByHash(hashToken(req.token));
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // user: null si no hay sesión (evita un 401 ruidoso al arrancar la SPA)
  r.get('/me', (req, res) => res.json({ user: req.user ?? null, authVia: req.authVia }));

  r.patch('/me', requireUser, async (req, res) => {
    const patch = {};
    if (req.body?.dailyGoal !== undefined) {
      const g = req.body.dailyGoal;
      if (!Number.isInteger(g) || g < 5 || g > 500) throw httpError(400, 'Meta diaria entre 5 y 500');
      patch.dailyGoal = g;
    }
    if (req.body?.name !== undefined) {
      const n = String(req.body.name).trim();
      if (n.length < 2 || n.length > 60) throw httpError(400, 'Nombre inválido');
      patch.name = n;
    }
    res.json({ user: publicUser(await repo.updateUser(req.user.id, patch)) });
  });

  // ---- Tokens de API personales (para practicar Bearer con curl / Postman) ----
  r.get('/tokens', requireUser, async (req, res) => {
    res.json({ tokens: await repo.listSessions(req.user.id, 'api') });
  });

  r.post('/tokens', requireUser, async (req, res) => {
    const label = String(req.body?.label ?? '').trim().slice(0, 60) || 'Token de API';
    const days = Math.min(365, Math.max(1, Number(req.body?.days) || 30));
    const t = await issueToken(repo, req.user.id, { kind: 'api', label, days });
    // El token solo se muestra una vez: en BD guardamos su hash
    res.status(201).json({ id: t.id, label, token: t.token, tokenType: 'Bearer', expiresAt: t.expiresAt });
  });

  r.delete('/tokens/:id', requireUser, async (req, res) => {
    const ok = await repo.deleteSession(req.user.id, Number(req.params.id));
    if (!ok) throw httpError(404, 'Token no encontrado');
    res.json({ ok: true });
  });

  return r;
}
