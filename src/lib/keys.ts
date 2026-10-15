// Notasi shortcut lintas OS. Perintah ditulis "Mod+Shift+P"; Mod = ⌘ di macOS, Ctrl di Windows/Linux.

import { isMac, isWindows } from "./ipc";
import { tl } from "../i18n";

/** Notasi COMMANDS → notasi platform: di Windows/Linux "Mod" jadi Ctrl, "Ctrl+Mod" jadi Ctrl+Alt. */
export function normalizeKeys(keys: string, mac = isMac): string {
  if (mac) return keys;
  const parts = keys.split("+");
  const hasCtrl = parts.includes("Ctrl");
  const hasMod = parts.includes("Mod");
  const out = parts.filter((p) => p !== "Mod" && p !== "Ctrl");
  const mods: string[] = [];
  if (hasCtrl || hasMod) mods.push("Ctrl");
  if (hasCtrl && hasMod && !out.includes("Alt")) mods.push("Alt");
  return [...mods, ...out].join("+");
}

const MAC_SYMBOLS: Record<string, string> = { Mod: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃", Tab: "⇥", Enter: "↵", Backspace: "⌫", Escape: "⎋", Up: "↑", Down: "↓", Left: "←", Right: "→" };
const PC_NAMES: Record<string, string> = { Escape: "Esc", Backspace: "Backspace", Up: "↑", Down: "↓", Left: "←", Right: "→" };

/** Teks shortcut untuk ditampilkan: mac "⌘⇧P", Windows/Linux "Ctrl+Shift+P". Aman dipanggil dua kali. */
export function prettyKeys(keys?: string, mac = isMac): string {
  if (!keys) return "";
  if (!mac) return normalizeKeys(keys, false).split("+").map((k) => PC_NAMES[k] ?? k).join("+");
  return keys
    .split("+")
    .map((k) => MAC_SYMBOLS[k] ?? k)
    .join("");
}

/** Tombol pengubah utama: ⌘ di macOS, Ctrl di tempat lain. */
export const modKey = (e: { metaKey: boolean; ctrlKey: boolean }) => (isMac ? e.metaKey : e.ctrlKey);

/** Nama pengelola berkas bawaan OS. */
export const fileManagerName = () => (isMac ? "Finder" : isWindows ? "File Explorer" : tl("pengelola berkas"));

/** Nama shell bawaan terminal di OS ini (lihat electron/pty.ts). */
export const shellName = () => (isMac ? "zsh" : isWindows ? "PowerShell" : "bash");
