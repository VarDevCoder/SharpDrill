import { api } from '../api.js';
import { esc } from '../markdown.js';
import { toast, $ } from '../ui.js';

export async function settingsView(main, _p, ctx) {
  const { chapters } = await api.chapters();
  main.innerHTML = `
    <header class="page-head"><div><h1>Ajustes</h1></div></header>
    <form class="card" id="profile">
      <h2>Perfil</h2>
      <label>Nombre <input name="name" value="${esc(ctx.user.name)}" minlength="2" maxlength="60" required></label>
      <label>Email <input value="${esc(ctx.user.email)}" disabled></label>
      <label>Meta diaria de repasos <input name="dailyGoal" type="number" min="5" max="500" value="${ctx.user.dailyGoal}" required></label>
      <button class="btn" type="submit">Guardar</button>
    </form>
    <section class="card">
      <h2>Reiniciar progreso</h2>
      <p class="muted">Borra el estado de repetición espaciada y las secciones leídas. El historial de intentos se conserva para las estadísticas.</p>
      <div class="row"><select id="reset-ch"><option value="">Todo el curso</option>${chapters.map((c) => `<option value="${c.id}">${c.number}. ${esc(c.title)}</option>`).join('')}</select>
      <button class="btn ghost danger" id="reset" type="button">Reiniciar</button></div>
    </section>
    <section class="card">
      <h2>Sesión</h2>
      <button class="btn ghost" id="logout" type="button">Cerrar sesión</button>
    </section>
    <section class="card">
      <h2>Atajos de teclado</h2>
      <ul class="list">
        <li><span>Mostrar respuesta de flashcard</span><kbd>Espacio</kbd></li>
        <li><span>Calificar: Otra vez / Difícil / Bien / Fácil</span><span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></span></li>
        <li><span>Elegir opción</span><span><kbd>A</kbd>–<kbd>D</kbd> o <kbd>1</kbd>–<kbd>4</kbd></span></li>
        <li><span>Verdadero / Falso</span><span><kbd>V</kbd> <kbd>F</kbd></span></li>
        <li><span>Siguiente</span><kbd>Enter</kbd></li>
        <li><span>Buscar</span><kbd>/</kbd></li>
      </ul>
    </section>`;

  $('#profile', main).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const { user } = await api.updateMe({ name: f.get('name'), dailyGoal: Number(f.get('dailyGoal')) });
      ctx.setUser(user);
      toast('Ajustes guardados', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#reset', main).addEventListener('click', async () => {
    const ch = $('#reset-ch', main).value;
    if (!confirm(ch ? '¿Reiniciar el progreso de este capítulo?' : '¿Reiniciar el progreso de TODO el curso?')) return;
    try { await api.resetProgress(ch); toast('Progreso reiniciado', 'ok'); } catch (err) { toast(err.message, 'error'); }
  });
  $('#logout', main).addEventListener('click', async () => { await api.logout(); ctx.setUser(null); location.hash = '#/login'; });
}
