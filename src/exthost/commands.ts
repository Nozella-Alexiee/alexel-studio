// Perintah & shortcut dari ekstensi (contributes.commands / keybindings) di palette dan penangan tombol.

import { setExtensionCommands, type Command } from "../app/commands";
import { isMac } from "../lib/ipc";
import { useExtensions } from "../extensions/registry";
import { activeTab, getState, toast, useStore } from "../state/store";
import { hostCall } from "./client";
import { useExtHost } from "./state";

const KEY_NAMES: Record<string, string> = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", enter: "Enter", return: "Enter", escape: "Escape", esc: "Escape", tab: "Tab", backspace: "Backspace", delete: "Delete", space: " ", pageup: "PageUp", pagedown: "PageDown", home: "Home", end: "End", insert: "Insert", "[": "[", "]": "]", "\\": "\\", "/": "/", ".": ".", ",": ",", ";": ";", "'": "'", "`": "`", "-": "-", "=": "=" };

/** "ctrl+shift+p" (sintaks VS Code) → "Mod+Shift+P" / "Ctrl+Shift+P" (notasi Alexel). Chord (dua langkah) tidak didukung. */
export function convertKey(key: string): string | null {
  const k = key.trim().toLowerCase();
  if (!k || /\s/.test(k)) return null;
  const parts = k.split("+");
  const out: string[] = [];
  let ctrl = false;
  let last = parts.pop() ?? "";
  for (const m of parts) {
    if (m === "ctrl" || m === "control") ctrl = true;
    else if (m === "cmd" || m === "meta" || m === "win" || m === "super") out.push("Mod");
    else if (m === "shift") out.push("Shift");
    else if (m === "alt" || m === "option") out.push("Alt");
    else return null;
  }
  // Di macOS ctrl ≠ cmd; di Windows/Linux ctrl = Mod.
  if (ctrl) out.unshift(isMac ? "Ctrl" : "Mod");
  const name = KEY_NAMES[last] ?? (/^f\d{1,2}$/.test(last) ? last.toUpperCase() : last.length === 1 ? last.toUpperCase() : null);
  if (!name) return null;
  last = name;
  const uniq = [...new Set(out)];
  return [...uniq, last].join("+");
}

/** Pilih kombinasi untuk OS ini dari definisi keybinding VS Code. */
export const keyFor = (kb: { key: string; mac?: string; win?: string; linux?: string }): string | null => {
  const raw = isMac ? kb.mac ?? kb.key : navigator.platform.startsWith("Win") ? kb.win ?? kb.key : kb.linux ?? kb.key;
  return convertKey(raw);
};

/** Evaluasi ekspresi `when` sederhana: && , ||, !, ==, !=, kunci konteks. Yang tak dikenal dianggap salah. */
export function evalWhen(expr: string | undefined, ctx: Record<string, unknown>): boolean {
  if (!expr) return true;
  const term = (t: string): boolean => {
    t = t.trim();
    if (t.startsWith("!")) return !term(t.slice(1));
    const m = /^([\w.]+)\s*(==|!=|=~)\s*(.+)$/.exec(t);
    if (m) {
      const v = String(ctx[m[1]] ?? "");
      const rhs = m[3].trim().replace(/^['"/]|['"/]$/g, "");
      return m[2] === "==" ? v === rhs : m[2] === "!=" ? v !== rhs : new RegExp(rhs).test(v);
    }
    const v = ctx[t];
    return !!v;
  };
  return expr.split("||").some((or) => or.split("&&").every(term));
}

/** Kunci konteks standar VS Code yang tersedia dari keadaan editor. */
export function whenContext(): Record<string, unknown> {
  const tab = activeTab();
  const ed = document.activeElement?.closest?.(".cm-editor");
  const path = tab?.kind === "text" ? tab.id : "";
  return {
    ...useExtHost.getState().contexts,
    editorTextFocus: !!ed,
    editorFocus: !!ed,
    textInputFocus: !!ed,
    editorLangId: tab?.lang ?? "",
    resourceExtname: path.includes(".") ? "." + path.split(".").pop() : "",
    resourceFilename: path.split("/").pop() ?? "",
    resourceLangId: tab?.lang ?? "",
    isMac,
    isWindows: navigator.platform.startsWith("Win"),
    isLinux: !isMac && !navigator.platform.startsWith("Win"),
    workspaceFolderCount: getState().root ? 1 : 0,
    sideBarVisible: true,
    editorHasSelection: false,
  };
}

/** Bangun ulang daftar perintah ekstensi dari ekstensi yang terpasang, dipercaya, dan aktif. */
export function syncExtensionCommands() {
  const s = getState().settings;
  const list: Command[] = [];
  for (const e of useExtensions.getState().list) {
    if (!e.hasCode || !s.trustedExts.includes(e.id) || s.disabledExts.includes(e.id)) continue;
    const kbs = (e.keybindings ?? []).filter((k) => k.command);
    for (const c of e.commands ?? []) {
      const kb = kbs.find((k) => k.command === c.command);
      const keys = kb ? keyFor(kb) : null;
      const when = kb?.when;
      list.push({
        id: `ext:${c.command}`,
        label: c.title,
        group: c.category ?? e.displayName,
        keys: keys ?? undefined,
        when: when ? () => evalWhen(when, whenContext()) : undefined,
        run: async () => {
          try {
            await hostCall("command/execute", { id: c.command, args: kb && (kb as { args?: unknown }).args !== undefined ? [(kb as { args?: unknown }).args] : [] });
          } catch (err) {
            toast(`${c.title}: ${err instanceof Error ? err.message : String(err)}`, "error");
          }
        },
      });
    }
  }
  setExtensionCommands(list);
}

let watching = false;
export function watchExtensionCommands() {
  if (watching) return;
  watching = true;
  let key = "";
  const sig = () => JSON.stringify([useExtensions.getState().list.map((e) => [e.id, e.version, !!e.hasCode]), getState().settings.trustedExts, getState().settings.disabledExts]);
  const check = () => {
    const k = sig();
    if (k === key) return;
    key = k;
    syncExtensionCommands();
  };
  useStore.subscribe(check);
  useExtensions.subscribe(check);
  check();
}
