import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useAsync } from '../hooks';
import { CodeBlock } from '../components/Markdown';
import { useToast } from '../components/Toast';

export function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const chapters = useAsync(() => api.chapters(), []);
  const tokens = useAsync(() => api.tokens(), []);
  const [name, setName] = useState(user?.name ?? '');
  const [goal, setGoal] = useState(user?.dailyGoal ?? 20);
  const [reset, setReset] = useState('');
  const [label, setLabel] = useState('Postman');
  const [days, setDays] = useState(30);
  const [newToken, setNewToken] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try { setUser((await api.updateMe({ name, dailyGoal: goal })).user); toast('Ajustes guardados', 'ok'); }
    catch (err) { toast((err as Error).message, 'error'); }
  }

  async function createToken(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try { const t = await api.createToken(label, days); setNewToken(t.token); tokens.reload(); }
    catch (err) { toast((err as Error).message, 'error'); }
  }

  const origin = window.location.origin;

  return (
    <>
      <header className="page-head"><h1>Ajustes</h1></header>
      <form className="card" onSubmit={save}>
        <h2>Perfil</h2>
        <label>Nombre <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required /></label>
        <label>Email <input value={user?.email ?? ''} disabled /></label>
        <label>Meta diaria de repasos <input type="number" min={5} max={500} value={goal} onChange={(e) => setGoal(Number(e.target.value))} required /></label>
        <button className="btn" type="submit">Guardar</button>
      </form>

      <section className="card">
        <h2>Tokens de API (Bearer)</h2>
        <p className="muted">Crea un token personal para llamar a la API de SharpDrill desde <strong>curl</strong> o <strong>Postman</strong> y practicar con autenticación Bearer de verdad.
          Solo se muestra una vez: en la base de datos se guarda su hash SHA-256.</p>
        <form className="row" onSubmit={createToken}>
          <label>Nombre <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} /></label>
          <label>Días <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 7, 30, 90, 365].map((d) => <option key={d}>{d}</option>)}</select></label>
          <button className="btn" type="submit">Crear token</button>
        </form>
        {newToken && (
          <div className="feedback ok">
            <strong>Copia tu token ahora (no volverá a mostrarse):</strong>
            <CodeBlock lang="bash" code={`export TOKEN='${newToken}'\n\ncurl -s ${origin}/api/stats -H "Authorization: Bearer $TOKEN" | jq .`} />
          </div>
        )}
        {tokens.data && tokens.data.tokens.length > 0 && (
          <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Creado</th><th>Caduca</th><th /></tr></thead><tbody>
            {tokens.data.tokens.map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td>{new Date(t.createdAt).toLocaleDateString('es-ES')}</td>
                <td>{new Date(t.expiresAt).toLocaleDateString('es-ES')}</td>
                <td><button className="btn ghost small danger" type="button" onClick={async () => { await api.deleteToken(t.id); tokens.reload(); toast('Token revocado', 'ok'); }}>Revocar</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <section className="card">
        <h2>Reiniciar progreso</h2>
        <p className="muted">Borra el estado de repetición espaciada y las secciones leídas. El historial de intentos se conserva.</p>
        <div className="row">
          <select value={reset} onChange={(e) => setReset(e.target.value)} aria-label="Capítulo a reiniciar">
            <option value="">Todo el curso</option>
            {chapters.data?.chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}
          </select>
          <button className="btn ghost danger" type="button" onClick={async () => {
            if (!confirm(reset ? '¿Reiniciar el progreso de este capítulo?' : '¿Reiniciar el progreso de TODO el curso?')) return;
            try { await api.resetProgress(reset || undefined); toast('Progreso reiniciado', 'ok'); } catch (err) { toast((err as Error).message, 'error'); }
          }}>Reiniciar</button>
        </div>
      </section>

      <section className="card">
        <h2>Atajos de SharpDrill</h2>
        <ul className="list">
          <li><span>Mostrar respuesta de flashcard</span><kbd>Espacio</kbd></li>
          <li><span>Calificar: Otra vez / Difícil / Bien / Fácil</span><span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></span></li>
          <li><span>Elegir opción</span><span><kbd>A</kbd>–<kbd>D</kbd> o <kbd>1</kbd>–<kbd>4</kbd></span></li>
          <li><span>Verdadero / Falso</span><span><kbd>V</kbd> <kbd>F</kbd></span></li>
          <li><span>Siguiente</span><kbd>Enter</kbd></li>
          <li><span>Entregar un drill de código</span><span><kbd>Ctrl</kbd>+<kbd>Enter</kbd></span></li>
          <li><span>Buscar</span><kbd>/</kbd></li>
        </ul>
      </section>

      <section className="card">
        <h2>Sesión</h2>
        <button className="btn ghost" type="button" onClick={async () => { await logout(); navigate('/login'); }}>Cerrar sesión</button>
      </section>
    </>
  );
}
