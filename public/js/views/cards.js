import { api } from '../api.js';
import { esc, markdown } from '../markdown.js';
import { loading, toast, $ } from '../ui.js';

export async function cardsView(main) {
  main.innerHTML = loading();
  const [{ chapters }, { cards }] = await Promise.all([api.chapters(), api.customCards()]);
  const title = (id) => chapters.find((c) => c.id === id)?.title ?? id;
  let editing = null;

  function render() {
    main.innerHTML = `
      <header class="page-head"><div><h1>Mis tarjetas</h1>
      <p class="muted">Escribir tus propias tarjetas es una forma potente de aprender (efecto de generación). Entran en tu repaso espaciado.</p></div></header>
      <form class="card card-form" id="form">
        <h2>${editing ? 'Editar tarjeta' : 'Nueva tarjeta'}</h2>
        <label>Capítulo <select name="chapterId" required>${chapters.map((c) =>
          `<option value="${c.id}" ${editing?.chapterId === c.id ? 'selected' : ''}>${c.number}. ${esc(c.title)}</option>`).join('')}</select></label>
        <label>Pregunta (anverso) <textarea name="front" rows="2" required minlength="3" maxlength="2000" placeholder="¿Qué diferencia hay entre…?">${esc(editing?.front ?? '')}</textarea></label>
        <label>Respuesta (reverso) — admite Markdown y bloques \`\`\`csharp <textarea name="back" rows="5" required maxlength="4000">${esc(editing?.back ?? '')}</textarea></label>
        <div class="row"><button class="btn" type="submit">${editing ? 'Guardar cambios' : 'Crear tarjeta'}</button>
        ${editing ? '<button class="btn ghost" type="button" data-cancel>Cancelar</button>' : ''}</div>
      </form>
      <section>
        <h2>${cards.length} ${cards.length === 1 ? 'tarjeta' : 'tarjetas'}</h2>
        ${cards.length ? `<div class="custom-list">${cards.map((c) => `
          <article class="card custom">
            <div class="tags"><span class="tag">${esc(title(c.chapterId))}</span></div>
            <div class="prompt">${markdown(c.front)}</div>
            <details><summary>Ver respuesta</summary><div class="answer">${markdown(c.back)}</div></details>
            <div class="row"><button class="btn ghost small" data-edit="${c.id}" type="button">Editar</button>
            <button class="btn ghost small danger" data-del="${c.id}" type="button">Eliminar</button></div>
          </article>`).join('')}</div>` : '<p class="muted">Aún no has creado tarjetas.</p>'}
      </section>`;
  }

  main.addEventListener('submit', async (e) => {
    if (e.target.id !== 'form') return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      if (editing) {
        const { card } = await api.updateCard(editing.id, data);
        cards.splice(cards.findIndex((c) => c.id === editing.id), 1, card);
        toast('Tarjeta actualizada', 'ok');
      } else {
        const { card } = await api.createCard(data);
        cards.unshift(card);
        toast('Tarjeta creada', 'ok');
      }
      editing = null;
      render();
    } catch (err) { toast(err.message, 'error'); }
  });
  main.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (e.target.closest('[data-cancel]')) { editing = null; render(); }
    if (ed) { editing = cards.find((c) => c.id === ed.dataset.edit); render(); $('#form', main).scrollIntoView({ behavior: 'smooth' }); }
    if (del && confirm('¿Eliminar esta tarjeta y su historial de repaso?')) {
      try {
        await api.deleteCard(del.dataset.del);
        cards.splice(cards.findIndex((c) => c.id === del.dataset.del), 1);
        render();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  render();
}
