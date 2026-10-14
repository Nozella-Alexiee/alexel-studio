import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { setState } from "../state/store";
import * as docs from "./documents";

/** Satu EditorView per grup editor. Ganti berkas = setState, view tidak dibuat ulang. */
export function CodeEditor({ group, path, hidden }: { group: number; path: string; hidden?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    const view = new EditorView({ parent: host.current! });
    viewRef.current = view;
    docs.attachView(group, view);
    const onFocus = () => setState({ focusedGroup: group });
    view.contentDOM.addEventListener("focus", onFocus);
    return () => {
      docs.detachFromView(group, shownRef.current);
      view.contentDOM.removeEventListener("focus", onFocus);
      docs.attachView(group, null);
      view.destroy();
      viewRef.current = null;
      shownRef.current = null;
    };
  }, [group]);

  useEffect(() => {
    let cancelled = false;
    const show = () => {
      if (cancelled || !viewRef.current || shownRef.current === path || !docs.getDoc(path)) return;
      docs.detachFromView(group, shownRef.current);
      docs.showInView(group, path);
      shownRef.current = path;
    };
    // Dokumen biasanya sudah terbuka; kalau belum (mis. setelah pemulihan sesi), muat dulu.
    if (docs.getDoc(path)) show();
    else void docs.openDocument(path).then(show, () => {});
    return () => {
      cancelled = true;
    };
  }, [group, path]);

  return <div ref={host} className="code-host" hidden={hidden} />;
}
