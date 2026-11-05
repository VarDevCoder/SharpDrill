import { useCallback, useEffect, useRef, useState } from 'react';

/** Carga asíncrona con estado de carga/error y recarga manual. Ignora respuestas obsoletas. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const run = useCallback(() => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    fn().then(
      (d) => { if (my === seq.current) { setData(d); setLoading(false); } },
      (e: Error) => { if (my === seq.current) { setError(e); setLoading(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

/** Atajos de teclado globales mientras el componente está montado. */
export function useKeys(handler: (e: KeyboardEvent) => void, deps: unknown[]) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key !== 'Enter') return;
      if (e.metaKey || e.altKey) return;
      handler(e);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useNow(intervalMs = 250, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
  return now;
}
