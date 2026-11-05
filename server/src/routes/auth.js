import { Router } from 'express';
import { hashPassword, verifyPassword, createSession, setSessionCookie, clearSessionCookie, requireUser } from '../auth.js';
import { httpError } from '../errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function authRoutes({ db, secureCookies }) {
  const r = Router();

  r.post('/register', (req, res) => {
    const email = String(req.body?.email ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!EMAIL_RE.test(email)) throw httpError(400, 'Email inválido');
    if (name.length < 2 || name.length > 60) throw httpError(400, 'El nombre debe tener entre 2 y 60 caracteres');
    if (password.length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw httpError(409, 'Ese email ya está registrado');

    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run(email, name, hashPassword(password));
    const id = Number(lastInsertRowid);
    const { token, expires } = createSession(db, id);
    setSessionCookie(res, token, expires, secureCookies);
    res.status(201).json({ user: { id, email, name, dailyGoal: 20 }, token });
  });

  r.post('/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, row.password_hash)) throw httpError(401, 'Email o contraseña incorrectos');
    const { token, expires } = createSession(db, row.id);
    setSessionCookie(res, token, expires, secureCookies);
    res.json({ user: { id: row.id, email: row.email, name: row.name, dailyGoal: row.daily_goal }, token });
  });

  r.post('/logout', (req, res) => {
    if (req.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Devuelve user: null si no hay sesión (evita un 401 ruidoso al arrancar la SPA)
  r.get('/me', (req, res) => res.json({ user: req.user ?? null }));

  r.patch('/me', requireUser, (req, res) => {
    const goal = req.body?.dailyGoal;
    const name = req.body?.name;
    if (goal !== undefined) {
      if (!Number.isInteger(goal) || goal < 5 || goal > 500) throw httpError(400, 'Meta diaria entre 5 y 500');
      db.prepare('UPDATE users SET daily_goal = ? WHERE id = ?').run(goal, req.user.id);
    }
    if (name !== undefined) {
      const n = String(name).trim();
      if (n.length < 2 || n.length > 60) throw httpError(400, 'Nombre inválido');
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(n, req.user.id);
    }
    const u = db.prepare('SELECT id, email, name, daily_goal AS dailyGoal FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: u });
  });

  return r;
}
