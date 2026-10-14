// Jalankan berkas aktif atau target Smart Run di terminal PTY.

import * as docs from "../editor/documents";
import { api, errMsg } from "../lib/ipc";
import { basename } from "../lib/paths";
import type { RunTarget } from "../lib/types";
import { activeTab, getState, toast } from "../state/store";

let busy = false;

export async function runActiveFile() {
  if (busy) return;
  const tab = activeTab();
  if (!tab || tab.kind !== "text") return toast("Buka berkas yang mau dijalankan.");
  busy = true;
  try {
    if (tab.dirty && !(await docs.saveDocument(tab.id, { quiet: true }))) return;
    const target = await api.commandForFile(tab.id, getState().root);
    await runTarget(target, basename(tab.id));
  } catch (e) {
    toast(errMsg(e), "error");
  } finally {
    busy = false;
  }
}

export async function runTarget(t: RunTarget, title = t.label) {
  // Simpan semua dulu supaya yang dijalankan sama dengan yang terlihat.
  for (const tab of Object.values(getState().tabs)) if (tab.dirty) await docs.saveDocument(tab.id, { quiet: true });
  const { runCommand } = await import("../terminal/terminals");
  await runCommand(t.command, t.cwd, title);
}

export async function openShell() {
  const { newTerminal } = await import("../terminal/terminals");
  await newTerminal({ kind: "shell" });
}

export async function openClaudeInteractive() {
  const info = getState().claude ?? (await api.claudeDetect().catch(() => null));
  if (!info?.installed || !info.path) return toast("Claude Code CLI belum terpasang. Jalankan: npm install -g @anthropic-ai/claude-code", "error");
  const { newTerminal } = await import("../terminal/terminals");
  const q = `'${info.path.replace(/'/g, "'\\''")}'`;
  await newTerminal({ kind: "claude", title: "Claude", command: q });
}
