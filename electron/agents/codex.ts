// Codex (OpenAI) lewat `codex app-server`: JSON-RPC per baris di stdin/stdout, protokol yang
// sama dengan ekstensi Codex di VS Code. Event diterjemahkan ke bentuk stream-json Claude
// supaya panel Agen AI cukup memahami satu format.

import { runCapture, findExecutable, type Ctx } from "../util";
import type { AgentStatus } from "./index";
import { installedAgent } from "./install";

export function findCodex(ctx: Ctx): { path: string; source: "extension" | "system" } | null {
  const inst = installedAgent(ctx, "codex");
  if (inst) return { path: inst.binary, source: "extension" };
  const p = findExecutable("codex");
  return p ? { path: p, source: "system" } : null;
}

export async function codexStatus(ctx: Ctx): Promise<AgentStatus> {
  const f = findCodex(ctx);
  if (!f) return { installed: false, error: null };
  const v = await runCapture(f.path, ["--version"], { timeoutMs: 15_000 }).catch(() => null);
  if (!v?.success) return { installed: false, path: f.path, source: f.source, error: `Codex ditemukan tapi gagal jalan${v?.stderr ? `: ${v.stderr.trim().slice(0, 200)}` : "."}` };
  const login = await runCapture(f.path, ["login", "status"], { timeoutMs: 15_000 }).catch(() => null);
  const text = `${login?.stdout ?? ""}${login?.stderr ?? ""}`;
  const loggedIn = login ? login.success && !/not logged in/i.test(text) : null;
  const plan = /chatgpt/i.test(text) ? "chatgpt" : /api key/i.test(text) ? "api key" : null;
  return { installed: true, path: f.path, version: v.stdout.trim(), loggedIn, plan, source: f.source, error: null };
}
