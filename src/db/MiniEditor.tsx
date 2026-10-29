// Editor query kecil (konsol database): CodeMirror dengan riwayat, autocomplete, dan Mod+Enter = jalankan.

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder as ph } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { nozelEditorTheme } from "../editor/theme";

export interface MiniEditorApi {
  view: EditorView;
}

export function MiniEditor({ initial, language, onRun, onChange, placeholder, apiRef }: { initial: string; language: Extension; onRun: (view: EditorView) => void; onChange?: (text: string) => void; placeholder?: string; apiRef?: React.MutableRefObject<MiniEditorApi | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lang = useRef(new Compartment());
  const run = useRef(onRun);
  run.current = onRun;
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ icons: true }),
          Prec.highest(keymap.of([{ key: "Mod-Enter", run: (x) => (run.current(x), true) }, { key: "Shift-Enter", run: (x) => (run.current(x), true) }])),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
          nozelEditorTheme,
          EditorView.lineWrapping,
          ph(placeholder ?? ""),
          lang.current.of(language),
          EditorView.updateListener.of((u) => u.docChanged && change.current?.(u.state.doc.toString())),
        ],
      }),
    });
    view.current = v;
    if (apiRef) apiRef.current = { view: v };
    v.focus();
    return () => {
      v.destroy();
      view.current = null;
      if (apiRef) apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure(language) });
  }, [language]);
  return <div className="db-mini-editor" ref={host} />;
}
