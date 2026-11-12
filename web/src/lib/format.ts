export function formatInterval(days: number): string {
  const min = days * 24 * 60;
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (days < 1) return `${Math.round(days * 24)} h`;
  const d = Math.round(days);
  if (days < 30) return `${d} ${d === 1 ? 'día' : 'días'}`;
  const m = Math.round(days / 30);
  if (days < 365) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
  return '1 año';
}

export const formatMs = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const pct = (n: number) => `${Math.max(0, Math.min(100, Math.round(n)))}%`;

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const shuffle = <T,>(a: T[]): T[] => {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const TRACK_ICON: Record<string, string> = { csharp: 'C#', db: 'SQL', react: '⚛', api: 'API', english: 'EN' };
