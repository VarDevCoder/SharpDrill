import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [dbMissing, setDbMissing] = useState(false);

  // En Vercel sin base de datos configurada, /api/health responde configured: false
  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((h) => setDbMissing(h.configured === false)).catch(() => undefined);
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const { user } = mode === 'login'
        ? await api.login(form.email, form.password)
        : await api.register(form.name, form.email, form.password);
      setUser(user);
      toast(`¡Hola, ${user.name}!`, 'ok');
      navigate('/');
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="logo big" aria-hidden="true">SD</div>
        <h1>SharpDrill</h1>
        <p>Entrenamiento senior con <strong>repaso activo</strong> y <strong>drills de código cronometrados</strong>.</p>
        <ul className="features">
          <li><strong>C# y .NET</strong>: CLR, GC, async, concurrencia, rendimiento, EF Core</li>
          <li><strong>Oracle</strong>: SQL avanzado y PL/SQL bajo reloj</li>
          <li><strong>React + TypeScript</strong> y <strong>Next.js</strong></li>
          <li><strong>APIs</strong>: curl, Bearer/JWT, Postman/Newman y Azure APIM</li>
          <li>Snippets y atajos de teclado para ir más rápido</li>
        </ul>
      </div>
      <form className="card auth-form" onSubmit={onSubmit}>
        {dbMissing && (
          <div className="feedback ko" role="alert">
            <strong>Base de datos no configurada</strong>
            <p className="small">Este despliegue aún no tiene Oracle conectado. Define <code>DB_CLIENT=oracle</code>, <code>ORACLE_USER</code>,
              <code>ORACLE_PASSWORD</code> y <code>ORACLE_CONNECT_STRING</code> en Vercel y vuelve a desplegar.</p>
          </div>
        )}
        <div className="tabs small" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Entrar</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Crear cuenta</button>
        </div>
        {mode === 'register' && <label>Nombre <input name="name" value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} maxLength={60} /></label>}
        <label>Email <input name="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
        <label>Contraseña <input name="password" type="password" value={form.password} onChange={set('password')}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} /></label>
        <button className="btn wide" type="submit" disabled={busy}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
      </form>
    </div>
  );
}
