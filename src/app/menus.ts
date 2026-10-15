// Menu aplikasi ala VS Code (Berkas, Edit, Seleksi, Tampilan, Pergi, Jalankan, Terminal, Bantuan).
// Satu definisi untuk menu native macOS (lewat main process) dan menu bar di dalam jendela
// di Windows/Linux (components/MenuBar.tsx). Setiap item menunjuk ke perintah di COMMANDS.

import { useDebug } from "../debug/state";
import { DESIGNS } from "../design/designs";
import { call, isMac, on } from "../lib/ipc";
import { getState, useStore } from "../state/store";
import { COMMANDS, keysOf, type Command } from "./commands";
import { tl } from "../i18n";

export type MenuNode =
  | "-"
  | { cmd: string; label?: string; checked?: () => boolean }
  | { role: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll" | "togglefullscreen"; cmd: string; label?: string }
  | { label: string; sub: () => MenuNode[] };

export interface TopMenu {
  label: string;
  items: () => MenuNode[];
}

const s = () => getState();
const home = (p: string) => p.replace(/^\/Users\/[^/]+|^\/home\/[^/]+|^[A-Z]:\/Users\/[^/]+/, "~");

export const MENUS: TopMenu[] = [
  {
    label: tl("Berkas"),
    items: () => [
      { cmd: "newFile" },
      { cmd: "newFolder" },
      "-",
      { cmd: "openFolder" },
      {
        label: tl("Buka terbaru"),
        sub: () => {
          const r = s().recents.filter((x) => x !== s().root).slice(0, 10);
          return r.length ? r.map((p) => ({ cmd: `recent:${p}`, label: home(p) })) : [{ cmd: "noop", label: tl("(belum ada)") }];
        },
      },
      { cmd: "cloneRepo" },
      "-",
      { cmd: "save" },
      { cmd: "saveAll" },
      { cmd: "autoSave", checked: () => s().settings.autoSave !== "off" },
      "-",
      { cmd: "settings" },
      { cmd: "keyboardShortcuts" },
      "-",
      { cmd: "closeTab" },
      { cmd: "closeAll" },
      { cmd: "closeFolder" },
      ...(isMac ? [] : (["-", { cmd: "quit" }] as MenuNode[])),
    ],
  },
  {
    label: "Edit",
    items: () => [
      { role: "undo", cmd: "undo" },
      { role: "redo", cmd: "redo" },
      "-",
      { role: "cut", cmd: "cut" },
      { role: "copy", cmd: "copy" },
      { role: "paste", cmd: "paste" },
      "-",
      { cmd: "find" },
      { cmd: "replace" },
      "-",
      { cmd: "search", label: tl("Cari di seluruh project") },
      "-",
      { cmd: "comment" },
      { cmd: "format" },
      { cmd: "rename" },
    ],
  },
  {
    label: tl("Seleksi"),
    items: () => [
      { role: "selectAll", cmd: "selectAll" },
      { cmd: "expandSelection" },
      { cmd: "selectLine" },
      "-",
      { cmd: "copyLineUp" },
      { cmd: "copyLineDown" },
      { cmd: "moveLineUp" },
      { cmd: "moveLineDown" },
      "-",
      { cmd: "cursorAbove" },
      { cmd: "cursorBelow" },
      { cmd: "nextOccurrence" },
      { cmd: "allOccurrences" },
    ],
  },
  {
    label: tl("Tampilan"),
    items: () => [
      { cmd: "palette" },
      "-",
      { cmd: "explorer" },
      { cmd: "search" },
      { cmd: "git" },
      { cmd: "runView" },
      { cmd: "extensions" },
      { cmd: "outline" },
      { cmd: "claude" },
      "-",
      { cmd: "problems" },
      { cmd: "output" },
      { cmd: "terminal" },
      "-",
      { cmd: "sidebar" },
      { cmd: "panel" },
      { cmd: "wrap", checked: () => s().settings.wordWrap },
      { cmd: "minimap", checked: () => s().settings.minimap },
      "-",
      { label: tl("Desain"), sub: () => DESIGNS.map((d) => ({ cmd: `design:${d.id}`, label: d.name, checked: () => s().settings.design === d.id })) },
      { cmd: "fontUp" },
      { cmd: "fontDown" },
      { role: "togglefullscreen", cmd: "fullscreen" },
    ],
  },
  {
    label: tl("Pergi"),
    items: () => [
      { cmd: "quickOpen", label: tl("Buka berkas…") },
      { cmd: "gotoSymbol" },
      { cmd: "workspaceSymbol" },
      { cmd: "gotoLine" },
      "-",
      { cmd: "definition" },
      { cmd: "references" },
      "-",
      { cmd: "nextTab" },
      { cmd: "prevTab" },
      { cmd: "reopenTab" },
    ],
  },
  {
    label: tl("Jalankan"),
    items: () => [
      { cmd: "debugStart" },
      { cmd: "runNoDebug", label: tl("Jalankan tanpa debug") },
      { cmd: "debugStop" },
      { cmd: "debugRestart" },
      "-",
      { cmd: "debugStepOver" },
      { cmd: "debugStepInto" },
      { cmd: "debugStepOut" },
      { cmd: "debugPause" },
      "-",
      { cmd: "debugToggleBreakpoint" },
      { cmd: "launchJson" },
      "-",
      { cmd: "runTarget" },
      { cmd: "stopRun" },
    ],
  },
  {
    label: "Terminal",
    items: () => [{ cmd: "newTerminal" }, { cmd: "terminal", label: tl("Tampilkan terminal") }, "-", { cmd: "run", label: tl("Jalankan berkas aktif") }, { cmd: "runTarget" }, "-", { cmd: "claudeTerm" }],
  },
  {
    label: tl("Bantuan"),
    items: () => [{ cmd: "welcome" }, { cmd: "tour" }, { cmd: "keyboardShortcuts" }, "-", { cmd: "reportIssue" }, { cmd: "checkUpdate" }, ...(isMac ? [] : (["-", { cmd: "about" }] as MenuNode[]))],
  },
];

const byId = () => new Map(COMMANDS.map((c) => [c.id, c] as const));

export function commandFor(id: string): Command | undefined {
  return byId().get(id);
}

/** Jalankan item menu (perintah biasa, atau "recent:<path>"). */
export function runMenuCommand(id: string) {
  if (id === "noop") return;
  if (id.startsWith("recent:")) {
    void import("./actions").then((A) => A.openProject(id.slice(7)));
    return;
  }
  const c = commandFor(id);
  if (!c || (c.when && !c.when())) return;
  void c.run();
}

/** "Mod+Shift+P" → akselerator Electron untuk tampilan di menu macOS. */
export function toAccelerator(keys?: string): string | undefined {
  if (!keys) return undefined;
  const map: Record<string, string> = { Mod: "Cmd", Alt: "Alt", Ctrl: "Ctrl", Shift: "Shift", Escape: "Esc", Enter: "Return", Up: "Up", Down: "Down", Left: "Left", Right: "Right" };
  return keys
    .split("+")
    .map((k) => map[k] ?? k)
    .join("+");
}

export interface ResolvedItem {
  kind: "item" | "sep" | "sub";
  id?: string;
  label: string;
  keys?: string;
  enabled?: boolean;
  checked?: boolean;
  role?: string;
  sub?: ResolvedItem[];
}

/** Bentuk akhir sebuah menu: label, shortcut, aktif/tidak, centang. */
export function resolveItems(nodes: MenuNode[]): ResolvedItem[] {
  const cmds = byId();
  const out: ResolvedItem[] = [];
  for (const n of nodes) {
    if (n === "-") {
      if (out.length && out[out.length - 1].kind !== "sep") out.push({ kind: "sep", label: "" });
      continue;
    }
    if ("sub" in n) {
      out.push({ kind: "sub", label: n.label, sub: resolveItems(n.sub()) });
      continue;
    }
    const c = cmds.get(n.cmd);
    if (!c && !n.cmd.startsWith("recent:") && n.cmd !== "noop") continue;
    out.push({
      kind: "item",
      id: n.cmd,
      label: n.label ?? c?.label ?? n.cmd,
      keys: c ? keysOf(c) : undefined,
      enabled: n.cmd === "noop" ? false : c ? !c.when || c.when() : true,
      checked: "checked" in n && n.checked ? n.checked() : undefined,
      role: "role" in n ? n.role : undefined,
    });
  }
  while (out.length && out[out.length - 1].kind === "sep") out.pop();
  return out;
}

function toSpec(items: ResolvedItem[]): unknown[] {
  return items.map((it) =>
    it.kind === "sep"
      ? { type: "separator" }
      : it.kind === "sub"
        ? { label: it.label, submenu: toSpec(it.sub ?? []) }
        : it.role
          ? { role: it.role }
          : { id: it.id, label: it.label, accelerator: toAccelerator(it.keys), enabled: it.enabled, ...(it.checked !== undefined ? { type: "checkbox", checked: it.checked } : {}) }
  );
}

/** Kirim menu ke macOS (dipanggil saat state yang memengaruhi menu berubah). */
function syncNativeMenu() {
  const appMenu = {
    label: "Alexel Studio",
    submenu: [
      { id: "about", label: tl("Tentang Alexel Studio") },
      { type: "separator" },
      { id: "settings", label: tl("Pengaturan…"), accelerator: "Cmd+," },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };
  const windowMenu = { label: tl("Jendela"), submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] };
  const spec = [appMenu, ...MENUS.map((m) => ({ label: m.label, submenu: toSpec(resolveItems(m.items())) })), windowMenu];
  // Pindahkan "Bantuan" ke paling kanan seperti aplikasi macOS lain.
  const hi = spec.findIndex((m) => m.label === tl("Bantuan"));
  const help = hi >= 0 ? spec.splice(hi, 1) : [];
  spec.push(...help);
  void call("menu_set", { spec }).catch(() => {});
}

let started = false;

export function initMenus() {
  if (started) return;
  started = true;
  void on<{ id: string }>("menu-command", ({ id }) => runMenuCommand(id));
  if (!isMac) {
    void call("menu_set", { spec: null }).catch(() => {});
    return;
  }
  let t: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(t);
    t = setTimeout(syncNativeMenu, 250);
  };
  // State yang memengaruhi menu: folder, tab aktif, pengaturan, project terakhir.
  // Debug ada di store terpisah; item Run (Stop, Step, Hentikan semua) bergantung padanya.
  let last = "";
  const check = () => {
    const st = getState();
    const g = st.groups[st.focusedGroup];
    const tab = g?.active ? st.tabs[g.active] : null;
    const running = st.terminals.filter((t) => t.kind === "run" && t.status === "running").length;
    const key = [st.root, tab?.kind, st.settings.wordWrap, st.settings.minimap, st.settings.autoSave, st.settings.design, st.recents.join("|"), st.groups.length, running, useDebug.getState().status].join("¦");
    if (key !== last) {
      last = key;
      schedule();
    }
  };
  useStore.subscribe(check);
  useDebug.subscribe(check);
  syncNativeMenu();
}
