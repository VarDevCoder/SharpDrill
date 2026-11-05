import { api } from '../api.js';
import { $, toast } from '../ui.js';

export function authView(main, _p, ctx) {
  let mode = 'login';
  function render() {
    main.innerHTML = `
      <div class="auth">
        <div class="auth-brand">
          <div class="logo big" aria-hidden="true">C#</div>
          <h1>SharpDrill</h1>
          <p>Curso de C# para nivel senior con <strong>repaso activo</strong>: teoría, flashcards con repetición espaciada, práctica y exámenes cronometrados.</p>
          <ul class="features">
            <li>12 capítulos: CLR, GC, async, concurrencia, rendimiento, EF Core…</li>
            <li>Algoritmo SM-2: repasas justo antes de olvidar</li>
            <li>Progreso guardado en el servidor, en cualquier dispositivo</li>
          </ul>
        </div>
        <form class="card auth-form" id="auth">
          <div class="tabs small" role="tablist">
            <button type="button" role="tab" class="tab ${mode === 'login' ? 'active' : ''}" data-mode="login">Entrar</button>
            <button type="button" role="tab" class="tab ${mode === 'register' ? 'active' : ''}" data-mode="register">Crear cuenta</button>
          </div>
          ${mode === 'register' ? '<label>Nombre <input name="name" autocomplete="name" required minlength="2" maxlength="60"></label>' : ''}
          <label>Email <input name="email" type="email" autocomplete="email" required></label>
          <label>Contraseña <input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="${mode === 'register' ? 8 : 1}"></label>
          <button class="btn wide" type="submit">${mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        </form>
      </div>`;
  }
  main.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mode]');
    if (t) { mode = t.dataset.mode; render(); }
  });
  main.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const { user } = mode === 'login'
        ? await api.login(f.get('email'), f.get('password'))
        : await api.register(f.get('name'), f.get('email'), f.get('password'));
      ctx.setUser(user);
      toast(`¡Hola, ${user.name}!`, 'ok');
      location.hash = '#/';
    } catch (err) { toast(err.message, 'error'); }
  });
  render();
}
