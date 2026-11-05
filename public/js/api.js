// Cliente HTTP mínimo para la API de SharpDrill. La sesión viaja en una cookie HttpOnly.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('sd:unauthorized'));
    throw new ApiError(res.status, data?.error ?? `Error ${res.status}`);
  }
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = p.toString();
  return s ? '?' + s : '';
};

export const api = {
  me: () => request('GET', '/auth/me'),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (name, email, password) => request('POST', '/auth/register', { name, email, password }),
  logout: () => request('POST', '/auth/logout', {}),
  updateMe: (patch) => request('PATCH', '/auth/me', patch),

  chapters: () => request('GET', '/chapters'),
  chapter: (id) => request('GET', `/chapters/${encodeURIComponent(id)}`),
  markRead: (ch, sid, read = true) => request('POST', `/chapters/${ch}/sections/${sid}/read`, { read }),
  search: (q) => request('GET', '/chapters/search' + qs({ q })),

  queue: (opts = {}) => request('GET', '/review/queue' + qs(opts)),
  practice: (opts = {}) => request('GET', '/review/practice' + qs(opts)),
  gradeCard: (itemId, grade, mode) => request('POST', '/review/card', { itemId, grade, mode }),
  answer: (itemId, answer, mode) => request('POST', '/review/answer', { itemId, answer, mode }),

  startExam: (chapters, count, minutes) => request('POST', '/exams', { chapters, count, minutes }),
  submitExam: (id, answers) => request('POST', `/exams/${id}/submit`, { answers }),
  exams: () => request('GET', '/exams'),

  stats: () => request('GET', '/stats'),
  resetProgress: (chapter) => request('DELETE', '/stats/progress' + qs({ chapter })),

  customCards: (chapter) => request('GET', '/custom-cards' + qs({ chapter })),
  createCard: (card) => request('POST', '/custom-cards', card),
  updateCard: (id, card) => request('PUT', `/custom-cards/${id}`, card),
  deleteCard: (id) => request('DELETE', `/custom-cards/${id}`),
};
