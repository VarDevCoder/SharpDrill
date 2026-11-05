import { useState } from 'react';
import { api } from '../api';
import { useAsync } from '../hooks';
import { ErrorBox, Loading } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { useToast } from '../components/Toast';
import type { CustomCard } from '../types';

export function CustomCardsPage() {
  const toast = useToast();
  const chapters = useAsync(() => api.chapters(), []);
  const cards = useAsync(() => api.customCards(), []);
  const [editing, setEditing] = useState<CustomCard | null>(null);
  const empty = { chapterId: '', front: '', back: '' };
  const [form, setForm] = useState(empty);

  if (chapters.loading || cards.loading) return <Loading />;
  if (chapters.error || cards.error) return <ErrorBox error={(chapters.error ?? cards.error)!} />;
  const list = cards.data!.cards;
  const title = (id: string) => chapters.data!.chapters.find((c) => c.id === id)?.title ?? id;
  const chapterId = form.chapterId || chapters.data!.chapters[0]?.id;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const body = { ...form, chapterId };
      if (editing) {
        const { card } = await api.updateCard(editing.id, body);
        cards.setData({ cards: list.map((c) => (c.id === card.id ? card : c)) });
        toast('Tarjeta actualizada', 'ok');
      } else {
        const { card } = await api.createCard(body);
        cards.setData({ cards: [card, ...list] });
        toast('Tarjeta creada', 'ok');
      }
      setEditing(null);
      setForm(empty);
    } catch (err) { toast((err as Error).message, 'error'); }
  }

  async function remove(c: CustomCard) {
    if (!confirm('¿Eliminar esta tarjeta y su historial de repaso?')) return;
    try { await api.deleteCard(c.id); cards.setData({ cards: list.filter((x) => x.id !== c.id) }); } catch (err) { toast((err as Error).message, 'error'); }
  }

  return (
    <>
      <header className="page-head">
        <h1>Mis tarjetas</h1>
        <p className="muted">Escribir tus propias tarjetas refuerza el aprendizaje (efecto de generación). Entran en tu repaso espaciado.</p>
      </header>
      <form className="card card-form" onSubmit={onSubmit}>
        <h2>{editing ? 'Editar tarjeta' : 'Nueva tarjeta'}</h2>
        <label>Capítulo <select value={chapterId} onChange={(e) => setForm({ ...form, chapterId: e.target.value })}>
          {chapters.data!.chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}
        </select></label>
        <label>Pregunta (anverso) <textarea rows={2} required minLength={3} maxLength={2000} value={form.front} onChange={(e) => setForm({ ...form, front: e.target.value })} placeholder="¿Qué diferencia hay entre…?" /></label>
        <label>Respuesta (reverso) — admite Markdown y bloques ```sql / ```tsx / ```csharp
          <textarea rows={6} required maxLength={4000} value={form.back} onChange={(e) => setForm({ ...form, back: e.target.value })} /></label>
        <div className="row">
          <button className="btn" type="submit">{editing ? 'Guardar cambios' : 'Crear tarjeta'}</button>
          {editing && <button className="btn ghost" type="button" onClick={() => { setEditing(null); setForm(empty); }}>Cancelar</button>}
        </div>
      </form>
      <h2>{list.length} {list.length === 1 ? 'tarjeta' : 'tarjetas'}</h2>
      {list.length ? (
        <div className="custom-list">
          {list.map((c) => (
            <article key={c.id} className="card custom">
              <div className="tags"><span className="tag">{title(c.chapterId)}</span></div>
              <div className="prompt"><Markdown source={c.front} /></div>
              <details><summary>Ver respuesta</summary><Markdown source={c.back} /></details>
              <div className="row">
                <button className="btn ghost small" type="button" onClick={() => { setEditing(c); setForm({ chapterId: c.chapterId, front: c.front, back: c.back }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
                <button className="btn ghost small danger" type="button" onClick={() => remove(c)}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="muted">Aún no has creado tarjetas.</p>}
    </>
  );
}
