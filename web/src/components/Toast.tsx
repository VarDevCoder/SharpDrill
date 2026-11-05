import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Kind = 'info' | 'ok' | 'warn' | 'error';
type Toast = { id: number; message: string; kind: Kind };
type ToastFn = (message: string, kind?: Kind, ms?: number) => void;

const ToastContext = createContext<ToastFn | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback<ToastFn>((message, kind = 'info', ms = 2400) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const value = useMemo(() => toast, [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div id="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
