import { useMemo } from 'react';
import { markdown, codeBlockHtml, inline } from '../lib/markdown';

/** Copiar código: delegación de eventos sobre el HTML generado. */
async function onCopyClick(e: React.MouseEvent<HTMLElement>) {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
  if (!btn) return;
  const code = btn.closest('.code')?.querySelector('code')?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(code);
    btn.textContent = 'Copiado ✓';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
  setTimeout(() => { btn.textContent = 'Copiar'; }, 1500);
}

type Props = { source: string; lang?: string; className?: string };

export function Markdown({ source, lang = 'text', className = 'prose' }: Props) {
  const html = useMemo(() => markdown(source, lang), [source, lang]);
  return <div className={className} onClick={onCopyClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CodeBlock({ code, lang = 'text' }: { code: string; lang?: string }) {
  const html = useMemo(() => codeBlockHtml(code, lang), [code, lang]);
  return <div onClick={onCopyClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Inline({ text }: { text: string }) {
  const html = useMemo(() => inline(text), [text]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
