import { esc } from './markdown.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, kind = 'info', ms = 2600) {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = message;
  host.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

/** Formatea un intervalo en días como texto legible. */
export function formatInterval(days) {
  const min = days * 24 * 60;
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 30) return `${Math.round(days)} ${Math.round(days) === 1 ? 'día' : 'días'}`;
  if (days < 365) return `${Math.round(days / 30)} ${Math.round(days / 30) === 1 ? 'mes' : 'meses'}`;
  return '1 año';
}

export const pct = (n) => `${Math.max(0, Math.min(100, Math.round(n)))}%`;

export function progressBar(value, label = '') {
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(value)}" aria-label="${esc(label)}"><span style="width:${pct(value)}"></span></div>`;
}

export function ring(value, size = 120, label = '') {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value)));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

export const loading = () => '<div class="loading"><span class="spinner" aria-hidden="true"></span> Cargando…</div>';

export const errorBox = (e) => `<div class="empty"><p>⚠️ ${esc(e.message ?? e)}</p></div>`;

export function chapterCheckboxes(chapters, selected = []) {
  return `<div class="chips">${chapters.map((c) => `
    <label class="chip"><input type="checkbox" name="chapter" value="${esc(c.id)}" ${selected.includes(c.id) ? 'checked' : ''}>
      <span>${String(c.number).padStart(2, '0')} · ${esc(c.title)}</span></label>`).join('')}</div>`;
}

/** Copiar bloques de código (delegación global). */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const code = btn.closest('.code')?.querySelector('code')?.innerText ?? '';
  try {
    await navigator.clipboard.writeText(code);
    btn.textContent = 'Copiado';
    setTimeout(() => (btn.textContent = 'Copiar'), 1500);
  } catch { toast('No se pudo copiar', 'error'); }
});
