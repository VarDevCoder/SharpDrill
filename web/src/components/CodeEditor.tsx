import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { sql, PLSQL, StandardSQL } from '@codemirror/lang-sql';
import { javascript } from '@codemirror/lang-javascript';
import { xml } from '@codemirror/lang-xml';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { Prec, type Extension } from '@codemirror/state';

function languageFor(lang: string): Extension[] {
  switch (lang) {
    case 'plsql': return [sql({ dialect: PLSQL })];
    case 'sql': return [sql({ dialect: StandardSQL })];
    case 'tsx': return [javascript({ jsx: true, typescript: true })];
    case 'ts': return [javascript({ typescript: true })];
    case 'js': return [javascript()];
    case 'xml': return [xml()];
    case 'csharp': return [StreamLanguage.define(csharp)];
    case 'bash': return [StreamLanguage.define(shell)];
    // Redacción en prosa (drills de inglés): sin gramática, pero con ajuste de línea
    case 'text': return [EditorView.lineWrapping];
    default: return [];
  }
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  lang: string;
  onSubmit?: () => void;
  readOnly?: boolean;
  dark: boolean;
};

/** Editor de código (CodeMirror 6) con resaltado por lenguaje y Ctrl+Enter para entregar. */
export default function CodeEditor({ value, onChange, lang, onSubmit, readOnly = false, dark }: Props) {
  const extensions = useMemo(() => [
    ...languageFor(lang),
    // Prec.highest: el keymap por defecto de CodeMirror también usa Mod-Enter (insertar línea)
    Prec.highest(keymap.of([{ key: 'Mod-Enter', preventDefault: true, run: () => { onSubmit?.(); return true; } }])),
  ], [lang, onSubmit]);

  return (
    <CodeMirror
      className="editor"
      value={value}
      height="320px"
      theme={dark ? 'dark' : 'light'}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      autoFocus
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: true, tabSize: 2 }}
      aria-label="Editor de código"
    />
  );
}
