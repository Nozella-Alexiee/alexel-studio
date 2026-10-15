// Jendela pembanding dua versi (MergeView CodeMirror), dipakai untuk: diff git,
// konflik disk vs editor, time-travel, dan kode usulan Claude.

import { MergeView } from "@codemirror/merge";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import * as docs from "../editor/documents";
import { languageFor } from "../editor/languages";
import { nozelEditorTheme } from "../editor/theme";
import { api } from "../lib/ipc";
import { basename } from "../lib/paths";
import { diffStats } from "../lib/diff";
import { getState, setState, useStore, type CompareRequest } from "../state/store";
import { IconButton } from "../components/ui";
import { tl } from "../i18n";

export function openCompare(req: CompareRequest) {
  setState({ compare: req });
}

export async function openDiskCompare(path: string) {
  const disk = await api.readText(path).then((t) => t.content.replace(/\r\n/g, "\n")).catch(() => "");
  openCompare({
    title: `${basename(path)}: disk vs editor`,
    leftLabel: "Di disk",
    rightLabel: "Editanmu",
    left: disk,
    right: docs.currentText(path) ?? "",
    acceptLabel: "Simpan versiku (timpa disk)",
    onAccept: () => {
      setState((s) => (s.tabs[path] ? { tabs: { ...s.tabs, [path]: { ...s.tabs[path], conflict: false } } } : {}));
      void docs.saveDocument(path, { force: true });
    },
  });
}

export function CompareModal() {
  const req = useStore((s) => s.compare);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!req || !host.current) return;
    const langA = new Compartment();
    const langB = new Compartment();
    const ro = [EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers(), nozelEditorTheme];
    const mv = new MergeView({
      a: { doc: req.left, extensions: [ro, langA.of([])] },
      b: { doc: req.right, extensions: [ro, langB.of([])] },
      parent: host.current,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
    });
    // Bahasa (untuk warna sintaks) dimuat menyusul.
    let alive = true;
    void languageFor(req.filename ?? req.title.split(":")[0].trim())
      .load()
      .then((lang) => {
        if (!alive) return;
        mv.a.dispatch({ effects: langA.reconfigure(lang) });
        mv.b.dispatch({ effects: langB.reconfigure(lang) });
      })
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setState({ compare: null });
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
      mv.destroy();
    };
  }, [req]);
  if (!req) return null;
  const st = diffStats(req.left, req.right);
  const close = () => setState({ compare: null });
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="compare" role="dialog" aria-modal="true" aria-label={req.title}>
        <div className="compare-head">
          <strong>{req.title}</strong>
          <span className="diff-stat">
            <span className="tone-success-fg">+{st.added}</span> <span className="tone-danger-fg">−{st.removed}</span>
          </span>
          <span className="spacer" />
          {req.onAccept && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const r = getState().compare;
                close();
                r?.onAccept?.();
              }}
            >
              {req.acceptLabel ?? "Terapkan"}
            </button>
          )}
          <IconButton label={tl("Tutup")} onClick={close}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="compare-labels">
          <span>{req.leftLabel}</span>
          <span>{req.rightLabel}</span>
        </div>
        <div className="compare-body" ref={host} />
      </div>
    </div>
  );
}
