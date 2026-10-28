// Diff dari agen (tool openDiff): berkas lama vs usulan, side-by-side; pemakai menerima atau menolak.

import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { languageFor } from "../editor/languages";
import { nozelEditorTheme } from "../editor/theme";
import { resolveIdeDiff } from "../ide/ide";
import { basename } from "../lib/paths";
import { useStore } from "../state/store";
import { tl } from "../i18n";

export function IdeDiffHost() {
  const d = useStore((s) => s.ideDiff);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!d || !host.current) return;
    let view: MergeView | null = null;
    let dead = false;
    void languageFor(d.path)
      .load()
      .catch(() => [])
      .then((lang) => {
        if (dead || !host.current) return;
        const ext = [lineNumbers(), nozelEditorTheme, EditorState.readOnly.of(true), EditorView.editable.of(false), lang];
        view = new MergeView({ a: { doc: d.oldText, extensions: ext }, b: { doc: d.newText, extensions: ext }, parent: host.current, highlightChanges: true, gutter: true });
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolveIdeDiff(false);
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) resolveIdeDiff(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      dead = true;
      window.removeEventListener("keydown", onKey);
      view?.destroy();
    };
  }, [d]);

  if (!d) return null;
  return (
    <div className="scrim">
      <div className="dialog ide-diff" role="dialog" aria-modal="true" aria-label={d.tab}>
        <h2 className="dialog-title">{tl("Perubahan dari agen: {name}", { name: basename(d.path) })}</h2>
        <p className="dialog-msg">{d.tab}</p>
        {/* Path lengkap yang akan ditulis: nama berkas saja bisa menyesatkan (mis. ~/.zshrc). */}
        <p className={`dialog-msg mono ${d.outside ? "tone-danger-fg" : ""}`} title={d.path}>
          {d.outside ? tl("Di luar folder project: {path}", { path: d.path }) : d.path}
        </p>
        {d.oldPath && <p className="dialog-msg mono">{tl("Dibandingkan dengan: {path}", { path: d.oldPath })}</p>}
        <div className="ide-diff-body" ref={host} />
        <div className="dialog-actions">
          <button className="btn" onClick={() => resolveIdeDiff(false)}>
            <X size={13} aria-hidden /> {tl("Tolak")}
          </button>
          <button className="btn btn-primary" onClick={() => resolveIdeDiff(true)}>
            <Check size={13} aria-hidden /> {tl("Terima & simpan")}
          </button>
        </div>
      </div>
    </div>
  );
}
