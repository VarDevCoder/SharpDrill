import { esc, highlight, LANG_LABEL } from './highlight';

/** Bloque de código con barra de lenguaje y botón copiar (el clic se gestiona por delegación en <Markdown>). */
export function codeBlockHtml(code: string, lang = 'text'): string {
  const clean = code.replace(/\n$/, '');
  return `<div class="code"><div class="code-bar"><span>${esc(LANG_LABEL[lang] ?? lang)}</span>` +
    `<button class="copy" type="button" data-copy aria-label="Copiar código">Copiar</button></div>` +
    `<pre class="language-${esc(lang)}"><code>${highlight(clean, lang)}</code></pre></div>`;
}

export function inline(text: string): string {
  // Se separan los fragmentos de código para no aplicar formato dentro de ellos
  return String(text).split(/(`[^`]+`)/g).map((part) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return `<code>${esc(part.slice(1, -1))}</code>`;
    return esc(part)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,:;]|$)/g, '$1<em>$2</em>');
  }).join('');
}

const LIST_RE = /^\s*(?:[-*]|\d+\.)\s+/;

/** Markdown mínimo y seguro: todo el texto se escapa antes de aplicar formato. */
export function markdown(src: string, defaultLang = 'text'): string {
  const lines = String(src ?? '').replace(/\r/g, '').split('\n');
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html.push(codeBlockHtml(buf.join('\n'), fence[1] || defaultLang));
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const n = Math.min(4, h[1].length + 2); html.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^\|.*\|\s*$/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r: string) => r.trim().slice(1, -1).split('|').map((c) => c.trim());
      const body = rows.filter((r, idx) => !(idx === 1 && /^\|[\s:|-]+\|$/.test(r.trim())));
      const [head, ...rest] = body;
      html.push('<div class="table-wrap"><table><thead><tr>' + cells(head).map((c) => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' + rest.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const re = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^```|^#{1,4}\s|^\|/.test(lines[i]) && !LIST_RE.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) para.push(lines[i++]);
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return html.join('\n');
}
