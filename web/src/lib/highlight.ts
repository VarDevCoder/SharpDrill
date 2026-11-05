import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-plsql';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-docker';

export const LANG_LABEL: Record<string, string> = {
  csharp: 'C#', plsql: 'PL/SQL', sql: 'SQL', tsx: 'TSX', ts: 'TypeScript', js: 'JavaScript',
  bash: 'Bash', json: 'JSON', xml: 'XML', http: 'HTTP', dockerfile: 'Dockerfile', text: 'Texto',
};

const PRISM_LANG: Record<string, string> = {
  csharp: 'csharp', cs: 'csharp', plsql: 'plsql', sql: 'sql', tsx: 'tsx', ts: 'typescript', typescript: 'typescript',
  js: 'javascript', javascript: 'javascript', bash: 'bash', sh: 'bash', json: 'json', xml: 'markup', html: 'markup',
  http: 'http', dockerfile: 'docker', docker: 'docker', csv: 'none', text: 'none',
};

export const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Devuelve HTML resaltado y seguro (Prism escapa el texto de entrada). */
export function highlight(code: string, lang = 'text'): string {
  const name = PRISM_LANG[lang] ?? 'none';
  const grammar = Prism.languages[name];
  return grammar ? Prism.highlight(code, grammar, name) : esc(code);
}
