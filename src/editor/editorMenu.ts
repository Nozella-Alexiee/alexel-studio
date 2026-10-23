// Menu klik kanan di editor: aksi Claude, aksi LSP, lalu potong/salin/tempel.

import { LSPPlugin } from "@codemirror/lsp-client";
import type { EditorView } from "@codemirror/view";
import { prettyKeys } from "../app/commands";
import { openMenu, type MenuItem } from "../components/Overlays";
import { call } from "../lib/ipc";
import { viewOf } from "./documents";
import { tl } from "../i18n";
import { fixAtCursor, problemsAtCursor } from "./fixWithAi";
import { prettierParser } from "./prettierFormat";
import { hostProviders } from "../exthost/features";
import { activeTab } from "../state/store";

function viewAt(target: EventTarget | null): EditorView | null {
  for (const g of [0, 1]) {
    const v = viewOf(g);
    if (v && target instanceof Node && v.dom.contains(target)) return v;
  }
  return null;
}

export function openEditorMenu(e: MouseEvent): boolean {
  const view = viewAt(e.target);
  if (!view) return false;
  const lsp = !!LSPPlugin.get(view);
  const hasSel = !view.state.selection.main.empty;
  const edit = (action: string) => () => {
    view.focus();
    void call("edit_action", { action });
  };
  const path = activeTab()?.kind === "text" ? activeTab()!.id : null;
  const has = (kind: string) => !!path && hostProviders(kind, path).length > 0;
  const fixable = problemsAtCursor(view).length > 0;
  const items: MenuItem[] = [
    ...(fixable ? [{ label: tl("Perbaiki dengan AI"), keys: prettyKeys("Mod+."), run: () => void fixAtCursor() }] : []),
    { label: hasSel ? tl("Ubah seleksi dengan AI…") : tl("Ubah baris ini dengan AI…"), keys: prettyKeys("Mod+K"), run: () => void import("./inlineClaude").then((m) => m.openInline(view)) },
    { label: hasSel ? tl("Tanya agen AI tentang seleksi") : tl("Tanya agen AI tentang berkas ini"), keys: prettyKeys("Mod+L"), run: () => void import("../claude/claude").then((m) => m.explainSelection()) },
    { label: "", separator: true },
    { label: tl("Ke definisi"), keys: "F12", disabled: !lsp && !has("definition"), run: () => void import("../app/editorCommands").then((m) => m.definition()) },
    { label: tl("Cari semua referensi"), keys: prettyKeys("Shift+F12"), disabled: !lsp && !has("references"), run: () => void import("../app/editorCommands").then((m) => m.references()) },
    { label: tl("Ganti nama simbol"), keys: "F2", disabled: !lsp && !has("rename"), run: () => void import("../app/editorCommands").then((m) => m.rename()) },
    { label: tl("Rapikan dokumen"), keys: prettyKeys("Shift+Alt+F"), disabled: !lsp && !has("formatting") && !(path && prettierParser(path)), run: () => void import("../app/editorCommands").then((m) => m.format()) },
    { label: "", separator: true },
    { label: tl("Potong"), keys: prettyKeys("Mod+X"), disabled: !hasSel, run: edit("cut") },
    { label: tl("Salin"), keys: prettyKeys("Mod+C"), disabled: !hasSel, run: edit("copy") },
    { label: tl("Tempel"), keys: prettyKeys("Mod+V"), run: edit("paste") },
    { label: tl("Pilih semua"), keys: prettyKeys("Mod+A"), run: edit("selectAll") },
  ];
  openMenu(e, items);
  return true;
}
