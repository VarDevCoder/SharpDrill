import { useEffect, useState } from 'react';
import { pct } from '../lib/format';

export function ProgressBar({ value, label = '' }: { value: number; label?: string }) {
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
      <span style={{ width: pct(value) }} />
    </div>
  );
}

export function Ring({ value, size = 112, label }: { value: number; size?: number; label: string }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value)));
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

export const Loading = () => <div className="loading"><span className="spinner" aria-hidden="true" /> Cargando…</div>;

export const ErrorBox = ({ error, onRetry }: { error: Error; onRetry?: () => void }) => (
  <div className="empty card">
    <p>⚠️ {error.message}</p>
    {onRetry && <button className="btn ghost" type="button" onClick={onRetry}>Reintentar</button>}
  </div>
);

export function Heatmap({ activity }: { activity: { day: string; count: number }[] }) {
  const max = Math.max(1, ...activity.map((a) => a.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  return (
    <>
      <div className="heatmap" role="img" aria-label="Actividad de las últimas 12 semanas">
        {activity.map((a) => <span key={a.day} className={`hm l${level(a.count)}`} title={`${a.day}: ${a.count} repasos`} />)}
      </div>
      <div className="hm-legend muted small">Menos {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`hm l${l}`} />)} Más</div>
    </>
  );
}

/** Tema claro/oscuro: respeta prefers-color-scheme salvo que el usuario elija uno. */
export function useTheme() {
  const media = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const read = () => (document.documentElement.dataset.theme as 'light' | 'dark' | undefined) ?? (media?.matches ? 'dark' : 'light');
  const [theme, setTheme] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    const h = () => setTheme(read());
    media?.addEventListener('change', h);
    return () => media?.removeEventListener('change', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sd-theme', next); } catch { /* sin almacenamiento */ }
    setTheme(next);
    window.dispatchEvent(new Event('sd:theme'));
  };
  useEffect(() => {
    const h = () => setTheme(read());
    window.addEventListener('sd:theme', h);
    return () => window.removeEventListener('sd:theme', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { theme, toggle };
}

export function LangBadge({ lang }: { lang: string }) {
  const label: Record<string, string> = { csharp: 'C#', plsql: 'PL/SQL', sql: 'SQL', tsx: 'React TSX', ts: 'TypeScript', js: 'JavaScript', bash: 'Bash / curl', xml: 'XML (APIM)', text: 'Inglés · redacción' };
  return <span className={`tag lang lang-${lang}`}>{label[lang] ?? lang}</span>;
}
