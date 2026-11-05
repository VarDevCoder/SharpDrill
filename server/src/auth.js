import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const COOKIE = 'sd_session';
export const WEB_SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Los tokens son opacos (no JWT). En BD solo se guarda su SHA-256. */
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const newToken = (prefix = 'sd') => `${prefix}_${randomBytes(32).toString('base64url')}`;

export async function issueToken(repo, userId, { kind = 'web', label = null, days = WEB_SESSION_DAYS } = {}) {
  const token = newToken(kind === 'api' ? 'sdapi' : 'sd');
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  const id = await repo.createSession({ tokenHash: hashToken(token), userId, kind, label, expiresAt });
  return { id, token, expiresAt: expiresAt.toISOString() };
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie malformada */ }
    }
  }
  return out;
}

/** Acepta `Authorization: Bearer <token>` (curl/Postman) o la cookie HttpOnly (navegador). */
export function tokenFrom(req) {
  const h = req.headers.authorization;
  if (h && /^Bearer\s+/i.test(h)) return { token: h.replace(/^Bearer\s+/i, '').trim(), via: 'bearer' };
  const c = parseCookies(req.headers.cookie)[COOKIE];
  return c ? { token: c, via: 'cookie' } : { token: null, via: null };
}

export function setSessionCookie(res, token, expires, secure) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Expires=${new Date(expires).toUTCString()}`];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Middleware: carga req.user si el token es válido. */
export function loadUser(repo) {
  return async (req, _res, next) => {
    try {
      const { token, via } = tokenFrom(req);
      req.token = token;
      req.authVia = via;
      const u = token ? await repo.userByTokenHash(hashToken(token)) : null;
      req.user = u ? { id: u.id, email: u.email, name: u.name, dailyGoal: u.dailyGoal } : null;
      req.sessionId = u?.sessionId ?? null;
      next();
    } catch (e) { next(e); }
  };
}

export function requireUser(req, res, next) {
  if (!req.user) {
    // RFC 6750: indicar el esquema esperado y si el token era inválido
    res.setHeader('WWW-Authenticate', 'Bearer realm="sharpdrill"' + (req.token ? ', error="invalid_token"' : ''));
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}
