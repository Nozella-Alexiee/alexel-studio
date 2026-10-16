// Jalankan berkas aktif atau target Smart Run di terminal PTY.

import * as docs from "../editor/documents";
import { api, errMsg, isWindows } from "../lib/ipc";
import { basename } from "../lib/paths";
import type { RunTarget } from "../lib/types";
import { activeTab, getState, setState, toast } from "../state/store";
import { tl } from "../i18n";

let busy = false;

export async function runActiveFile() {
  if (busy) return;
  const tab = activeTab();
  if (!tab || tab.kind !== "text") return toast(tl("Buka berkas yang mau dijalankan."));
  busy = true;
  try {
    if (tab.dirty && !(await docs.saveDocument(tab.id, { quiet: true }))) return toast(tl("Berkas belum bisa disimpan, jadi tidak dijalankan."), "error");
    const target = await api.commandForFile(tab.id, getState().root);
    await runTarget(target, basename(tab.id));
  } catch (e) {
    toast(errMsg(e), "error");
  } finally {
    busy = false;
  }
}

/** Program yang dibutuhkan belum terpasang: beri tahu apa yang dipasang, jangan jalankan perintah yang pasti gagal. */
function reportMissing(m: { tool: string; install: string }) {
  toast(tl("{tool} tidak ditemukan di komputer ini. Pasang dulu: {install}", { tool: m.tool, install: m.install }), "error", {
    label: tl("Salin perintah"),
    run: () => void import("../components/textMenu").then((x) => x.copyText(m.install)),
  });
}

export async function runTarget(t: RunTarget, title = t.label) {
  if (t.missing) return reportMissing(t.missing);
  // Simpan semua dulu supaya yang dijalankan sama dengan yang terlihat.
  for (const tab of Object.values(getState().tabs)) if (tab.dirty) await docs.saveDocument(tab.id, { quiet: true });
  const { runCommand } = await import("../terminal/terminals");
  // Fokus tetap di editor: Ctrl+R / F5 berikutnya harus tetap bisa dipakai (terminal menelan tombol).
  await runCommand(t.command, t.cwd, title, { focus: false });
}

export async function openShell() {
  const { newTerminal } = await import("../terminal/terminals");
  await newTerminal({ kind: "shell" });
}

/** Path program sebagai perintah shell: PowerShell di Windows, sh di macOS/Linux. */
export function shellExe(path: string): string {
  return isWindows ? `& '${path.replace(/'/g, "''")}'` : `'${path.replace(/'/g, "'\\''")}'`;
}

export async function openClaudeInteractive() {
  const info = getState().claude ?? (await api.claudeDetect().catch(() => null));
  if (!info?.installed || !info.path) return toast(tl("Claude Code belum terpasang. Buka panel Claude untuk memasangnya."), "error");
  const { newTerminal } = await import("../terminal/terminals");
  await newTerminal({ kind: "claude", title: "Claude", command: shellExe(info.path) });
}

/** Jalankan satu perintah di tab terminal baru (folder project, atau folder rumah). */
/** Jalankan perintah di tab terminal "run"; mengembalikan kunci sesi terminalnya. */
export async function runInTerminal(command: string, title: string, opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<string> {
  const { runCommand } = await import("../terminal/terminals");
  return runCommand(command, opts.cwd || (getState().root ?? ""), title, { env: opts.env });
}

/**
 * Ctrl+` ala VS Code: panel terminal tertutup → buka (dan buat shell bila belum ada shell);
 * panel terminal sudah tampil → tutup. Sesi Run/Claude tidak dihitung sebagai shell.
 */
export async function toggleTerminal() {
  const s = getState();
  const l = s.layouts[s.settings.design];
  if (l.panel && l.panelTab === "terminal") {
    const A = await import("./actions");
    return A.togglePanel();
  }
  const shell = s.terminals.find((t) => t.kind === "shell" && t.status !== "exited");
  if (!shell) return openShell();
  const A = await import("./actions");
  A.togglePanel("terminal");
  setState({ activeTerminal: shell.key });
  const { focusTerminal } = await import("../terminal/terminals");
  requestAnimationFrame(() => focusTerminal(shell.key));
}
