// Contratos de la API de SharpDrill (deben coincidir con server/src/routes).

export type Lang = 'csharp' | 'plsql' | 'sql' | 'tsx' | 'ts' | 'js' | 'bash' | 'json' | 'xml' | 'http' | 'dockerfile' | 'text';
export type TrackId = 'csharp-basics' | 'csharp' | 'db' | 'react' | 'api' | 'english';

export interface User { id: number; email: string; name: string; dailyGoal: number }
export interface Track { id: TrackId; title: string; order: number }

export interface SrsState { ease: number; interval: number; reps: number; lapses: number; dueAt: string; grade: number }

export interface ChapterSummary {
  id: string; number: number; title: string; summary: string; level: string; track: TrackId;
  sections: number; cards: number; questions: number; drills: number; snippets: number;
  sectionsRead: number; seen: number; total: number; due: number; mastery: number; completion: number;
}

export interface RealWorldCase { sector: string; text: string }
export interface Section { id: string; title: string; body: string; realWorld?: RealWorldCase[] }

export interface CardItem {
  id: string; kind: 'card'; chapterId: string; front: string; back: string; code?: string; lang?: Lang;
  custom?: boolean; isNew?: boolean; chapterTitle?: string;
}
export interface QuestionItem {
  id: string; kind: 'question'; chapterId: string; type: 'mcq' | 'tf' | 'fill'; prompt: string;
  code?: string; lang?: Lang; options?: string[]; tag?: string; isNew?: boolean; chapterTitle?: string;
}
export interface DrillItem {
  id: string; kind: 'drill'; chapterId: string; lang: Lang; title: string; prompt: string; starter: string;
  timeLimit: number; checkCount: number; isNew?: boolean; chapterTitle?: string; bestMs?: number | null; due?: boolean | null;
}
export type StudyItem = CardItem | QuestionItem;

export interface Snippet { id: string; title: string; lang: Lang; code: string; note?: string | null; chapterId?: string; chapterTitle?: string; track?: TrackId }
export interface Shortcut { tool: string; keys: string; action: string; chapterId?: string; chapterTitle?: string; track?: TrackId }

export interface ChapterDetail extends Omit<ChapterSummary, 'sections' | 'cards' | 'questions' | 'drills' | 'snippets'> {
  objectives: string[]; sections: Section[]; cards: CardItem[]; questions: QuestionItem[]; drills: DrillItem[];
  snippets: Omit<Snippet, 'chapterId' | 'chapterTitle' | 'track'>[]; shortcuts: Shortcut[];
  readSections: string[]; prev: string | null; next: string | null;
}

export interface AnswerResult { correct: boolean; expected: number | boolean | string | string[]; explanation: string; next: SrsState }

export interface DrillResult {
  results: { hint: string; ok: boolean }[]; passed: number; total: number; inTime: boolean; srsGrade: number;
  correct: boolean; elapsedMs: number; timeLimit: number; solution: string; explanation: string | null; next: SrsState;
}

export interface Stats {
  streak: number; today: number; dailyGoal: number; dueNow: number;
  totals: { attempts: number; correct: number; accuracy: number };
  activity: { day: string; count: number }[];
  forecast: { day: string; count: number }[];
  byMode: { mode: string; count: number; accuracy: number | null }[];
  chapters: (ChapterSummary & { attempts: number; accuracy: number | null })[];
  tracks: (Track & { chapters: number; mastery: number; completion: number })[];
  weak: { id: string; chapterId: string; kind: string; lapses: number; lastGrade: number; text: string }[];
}

export interface ExamSummary { id: number; chapters: string[]; timeLimit: number; startedAt: string; finishedAt: string; score: number; total: number }
export interface Exam { id: number; startedAt: string; timeLimit: number; total: number; items: QuestionItem[] }
export interface ExamResult {
  id: number; score: number; total: number; late: boolean; elapsed: number;
  results: (QuestionItem & { answer: unknown; correct: boolean; expected: AnswerResult['expected']; explanation: string })[];
}

export interface CustomCard { id: string; chapterId: string; front: string; back: string; createdAt: string }
export interface ApiToken { id: number; kind: string; label: string | null; createdAt: string; expiresAt: string }
export interface SearchResult { type: 'section' | 'card' | 'snippet' | 'shortcut'; chapterId: string; chapterTitle: string; title: string; snippet: string; sectionId?: string }
