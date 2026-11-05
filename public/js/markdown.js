// Renderizador Markdown mínimo y seguro (escapa todo el HTML) + resaltado de C#.
export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CS_KEYWORDS = new Set(('abstract as async await base bool break byte case catch char checked class const continue ' +
  'decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if ' +
  'implicit in init int interface internal is lock long namespace new null object operator out override params private ' +
  'protected public readonly record ref required return sbyte sealed short sizeof stackalloc static string struct switch ' +
  'this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while yield when and or ' +
  'not with get set value nameof managed unmanaged notnull file scoped field extension allows partial where let from select ' +
  'orderby group into join on equals descending ascending global dynamic nint nuint').split(' '));

const TOKEN_RE = new RegExp([
  String.raw`(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/)`,
  String.raw`(?<string>\$?@?"(?:[^"\\\n]|\\.|"")*"|'(?:[^'\\\n]|\\.)')`,
  String.raw`(?<number>\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[mMfFdDlLuU]*\b|\b0x[\da-fA-F_]+\b)`,
  String.raw`(?<attr>(?<=^|\n)\s*\[[A-Z][\w<>.]*(?=[(\]]))`,
  String.raw`(?<word>[A-Za-z_]\w*)`,
].join('|'), 'g');

export function highlightCSharp(code) {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKEN_RE)) {
    out += esc(code.slice(last, m.index));
    const g = m.groups;
    const t = esc(m[0]);
    if (g.comment) out += `<span class="tk-c">${t}</span>`;
    else if (g.string) out += `<span class="tk-s">${t}</span>`;
    else if (g.number) out += `<span class="tk-n">${t}</span>`;
    else if (g.attr) out += `<span class="tk-a">${t}</span>`;
    else if (CS_KEYWORDS.has(m[0])) out += `<span class="tk-k">${t}</span>`;
    else if (/^[A-Z]/.test(m[0])) out += `<span class="tk-t">${t}</span>`;
    else out += t;
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}

export function codeBlock(code, lang = 'csharp') {
  const body = lang === 'csharp' || lang === 'cs' ? highlightCSharp(code.replace(/\n$/, '')) : esc(code.replace(/\n$/, ''));
  return `<div class="code"><div class="code-bar"><span>${esc(lang === 'cs' ? 'csharp' : lang || 'texto')}</span>` +
    `<button class="copy" type="button" data-copy aria-label="Copiar código">Copiar</button></div><pre><code>${body}</code></pre></div>`;
}

export function inline(text) {
  // Primero se separan los fragmentos de código para no aplicar formato dentro
  return String(text).split(/(`[^`]+`)/g).map((part) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return `<code>${esc(part.slice(1, -1))}</code>`;
    return esc(part)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,:;]|$)/g, '$1<em>$2</em>');
  }).join('');
}

export function markdown(src) {
  const lines = String(src ?? '').replace(/\r/g, '').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html.push(codeBlock(buf.join('\n'), fence[1] || 'csharp'));
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const n = Math.min(4, h[1].length + 2); html.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().slice(1, -1).split('|').map((c) => c.trim());
      const body = rows.filter((r, idx) => !(idx === 1 && /^\|[\s:|-]+\|$/.test(r.trim())));
      const [head, ...rest] = body;
      html.push('<div class="table-wrap"><table><thead><tr>' + cells(head).map((c) => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' + rest.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^```|^#{1,4}\s|^\||^\s*[-*]\s+|^\s*\d+\.\s+/.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) { para.push(lines[i++]); }
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return html.join('\n');
}
