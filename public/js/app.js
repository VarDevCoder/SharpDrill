import { api } from './api.js';
import { $, $$, errorBox } from './ui.js';
import { dashboardView } from './views/dashboard.js';
import { chaptersView } from './views/chapters.js';
import { chapterView } from './views/chapter.js';
import { reviewView } from './views/review.js';
import { practiceView } from './views/practice.js';
import { examView } from './views/exam.js';
import { progressView } from './views/progress.js';
import { cardsView } from './views/cards.js';
import { settingsView } from './views/settings.js';
import { searchView } from './views/search.js';
import { authView } from './views/auth.js';

const ROUTES = [
  { re: /^\/$/, view: dashboardView, nav: 'inicio', title: 'Inicio' },
  { re: /^\/capitulos$/, view: chaptersView, nav: 'capitulos', title: 'Temario' },
  { re: /^\/capitulo\/(?<id>[\w-]+)(?:\/(?<tab>teoria|tarjetas|practica))?$/, view: chapterView, nav: 'capitulos', title: 'Capítulo' },
  { re: /^\/repaso$/, view: reviewView, nav: 'repaso', title: 'Repaso' },
  { re: /^\/practica$/, view: practiceView, nav: 'practica', title: 'Práctica' },
  { re: /^\/examen$/, view: examView, nav: 'examen', title: 'Examen' },
  { re: /^\/progreso$/, view: progressView, nav: 'progreso', title: 'Progreso' },
  { re: /^\/mis-tarjetas$/, view: cardsView, nav: 'mis-tarjetas', title: 'Mis tarjetas' },
  { re: /^\/ajustes$/, view: settingsView, nav: 'ajustes', title: 'Ajustes' },
  { re: /^\/buscar$/, view: searchView, nav: '', title: 'Buscar' },
  { re: /^\/login$/, view: authView, nav: '', title: 'Entrar', public: true },
];

const ctx = {
  user: null,
  setUser(u) {
    ctx.user = u;
    document.body.classList.toggle('anon', !u);
    $('#user-name').textContent = u ? u.name : '';
  },
};

let cleanup = null;
let navSeq = 0;

async function navigate() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const route = ROUTES.find((r) => r.re.test(path)) ?? ROUTES[0];
  const params = route.re.exec(path)?.groups ?? {};

  if (!route.public && !ctx.user) { location.hash = '#/login'; return; }
  if (route.public && ctx.user) { location.hash = '#/'; return; }

  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const seq = ++navSeq;

  // Contenedor nuevo por vista: los listeners de la vista anterior desaparecen con ella
  const view = document.createElement('div');
  view.className = 'view';
  $('#main').replaceChildren(view);
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === route.nav));
  document.title = `${route.title} · SharpDrill`;
  document.body.classList.remove('menu-open');
  window.scrollTo(0, 0);

  try {
    const c = await route.view(view, params, { ...ctx, query: new URLSearchParams(qs) });
    if (seq === navSeq) cleanup = c;
    else if (typeof c === 'function') c();
  } catch (e) {
    if (seq === navSeq && e.status !== 401) view.innerHTML = errorBox(e);
  }
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('sd-theme'); } catch { /* sin almacenamiento */ }
  if (saved) document.documentElement.dataset.theme = saved;
  $('#theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sd-theme', next); } catch { /* sin almacenamiento */ }
  });
}

window.addEventListener('sd:unauthorized', () => { ctx.setUser(null); location.hash = '#/login'; });
window.addEventListener('hashchange', navigate);
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.matches('input, textarea, select') && ctx.user) {
    e.preventDefault();
    location.hash = '#/buscar';
  }
});
$('#menu').addEventListener('click', () => document.body.classList.toggle('menu-open'));
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  location.hash = '#/buscar?q=' + encodeURIComponent(new FormData(e.target).get('q'));
});

initTheme();
try { ctx.setUser((await api.me()).user); } catch { ctx.setUser(null); }
navigate();
