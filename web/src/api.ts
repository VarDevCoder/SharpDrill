import type {
  User, ChapterSummary, ChapterDetail, Track, StudyItem, QuestionItem, DrillItem, AnswerResult, DrillResult, SrsState,
  Stats, Exam, ExamResult, ExamSummary, CustomCard, ApiToken, SearchResult, Snippet, Shortcut,
} from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Query = Record<string, string | number | undefined | null>;

const qs = (o: Query = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/**
 * Cliente HTTP tipado. En el navegador la sesión viaja en una cookie HttpOnly (más segura frente a XSS);
 * la misma API acepta `Authorization: Bearer <token>` para curl y Postman.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('sd:unauthorized'));
    throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `Error ${res.status}`);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>('GET', '/auth/me'),
  login: (email: string, password: string) => request<{ user: User; token: string }>('POST', '/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => request<{ user: User; token: string }>('POST', '/auth/register', { name, email, password }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
  updateMe: (patch: Partial<Pick<User, 'name' | 'dailyGoal'>>) => request<{ user: User }>('PATCH', '/auth/me', patch),
  tokens: () => request<{ tokens: ApiToken[] }>('GET', '/auth/tokens'),
  createToken: (label: string, days: number) => request<{ id: number; token: string; expiresAt: string; label: string }>('POST', '/auth/tokens', { label, days }),
  deleteToken: (id: number) => request<{ ok: true }>('DELETE', `/auth/tokens/${id}`),

  chapters: () => request<{ chapters: ChapterSummary[]; tracks: Track[] }>('GET', '/chapters'),
  chapter: (id: string) => request<{ chapter: ChapterDetail }>('GET', `/chapters/${encodeURIComponent(id)}`),
  markRead: (ch: string, sid: string, read: boolean) => request<{ read: boolean }>('POST', `/chapters/${ch}/sections/${sid}/read`, { read }),
  search: (q: string) => request<{ results: SearchResult[] }>('GET', `/chapters/search${qs({ q })}`),

  queue: (o: Query) => request<{ items: StudyItem[]; counts: { due: number; new: number } }>('GET', `/review/queue${qs(o)}`),
  practice: (o: Query) => request<{ items: QuestionItem[] }>('GET', `/review/practice${qs(o)}`),
  gradeCard: (itemId: string, grade: number, mode: string) => request<{ next: SrsState }>('POST', '/review/card', { itemId, grade, mode }),
  answer: (itemId: string, answer: unknown, mode: string) => request<AnswerResult>('POST', '/review/answer', { itemId, answer, mode }),

  drills: (o: Query) => request<{ items: DrillItem[] }>('GET', `/drills${qs(o)}`),
  drillSession: (o: Query) => request<{ items: DrillItem[] }>('GET', `/drills/session${qs(o)}`),
  drillHistory: () => request<{ history: { itemId: string; title: string; lang: string; passed: number; total: number; elapsedMs: number; timeLimit: number; createdAt: string }[] }>('GET', '/drills/history'),
  startDrill: (id: string) => request<{ ticket: string; startedAt: string; timeLimit: number }>('POST', `/drills/${encodeURIComponent(id)}/start`, {}),
  submitDrill: (id: string, ticket: string, code: string) => request<DrillResult>('POST', `/drills/${encodeURIComponent(id)}/submit`, { ticket, code }),

  startExam: (o: { chapters?: string[]; track?: string; count: number; minutes: number }) => request<{ exam: Exam }>('POST', '/exams', o),
  submitExam: (id: number, answers: Record<string, unknown>) => request<{ result: ExamResult }>('POST', `/exams/${id}/submit`, { answers }),
  exams: () => request<{ exams: ExamSummary[] }>('GET', '/exams'),

  stats: () => request<Stats>('GET', '/stats'),
  resetProgress: (chapter?: string) => request<{ ok: true }>('DELETE', `/stats/progress${qs({ chapter })}`),

  snippets: (o: Query) => request<{ snippets: Snippet[]; shortcuts: Shortcut[]; langs: string[]; tools: string[] }>('GET', `/snippets${qs(o)}`),

  customCards: () => request<{ cards: CustomCard[] }>('GET', '/custom-cards'),
  createCard: (c: Pick<CustomCard, 'chapterId' | 'front' | 'back'>) => request<{ card: CustomCard }>('POST', '/custom-cards', c),
  updateCard: (id: string, c: Pick<CustomCard, 'chapterId' | 'front' | 'back'>) => request<{ card: CustomCard }>('PUT', `/custom-cards/${id}`, c),
  deleteCard: (id: string) => request<{ ok: true }>('DELETE', `/custom-cards/${id}`),
};
