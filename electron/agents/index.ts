// Router agen AI: Claude Code (stream-json), Codex (app-server), Gemini & agen lain (ACP).
// Setiap agen menulis event berbentuk stream-json Claude ke kanal `agent-event`, sehingga
// panel di renderer cukup memahami satu format (teks, alat, kartu izin, hasil).

import * as claude from "../claude";
import type { Ctx } from "../util";

export type AgentId = "claude" | "codex" | "gemini" | "acp";

export interface AgentStatus {
  installed: boolean;
  path?: string | null;
  version?: string | null;
  /** null = tidak diketahui. */
  loggedIn?: boolean | null;
  plan?: string | null;
  /** "system" = sudah ada di komputer, "extension" = dipasang dari panel Ekstensi. */
  source?: "system" | "extension" | null;
  error?: string | null;
}

export interface AgentDriver {
  status(ctx: Ctx): Promise<AgentStatus>;
  send(ctx: Ctx, key: string, cfg: Record<string, unknown>, content: unknown): void | Promise<void>;
  control(ctx: Ctx, key: string, msg: unknown): boolean | Promise<boolean>;
  close(key: string): void;
  sessions?(cwd: string): unknown;
  sessionLoad?(cwd: string, id: string): unknown;
  killAll(): void;
}

const drivers: Partial<Record<AgentId, AgentDriver>> = {
  claude: {
    status: () => claude.claudeDetect(),
    send: (ctx, key, cfg, content) => claude.claudeSessionSend(ctx, key, cfg, content),
    control: (_ctx, key, msg) => claude.claudeSessionControl(key, msg),
    close: (key) => claude.claudeSessionClose(key),
    sessions: (cwd) => claude.claudeSessionsList(cwd),
    sessionLoad: (cwd, id) => claude.claudeSessionLoad(cwd, id),
    killAll: () => claude.killAllClaude(),
  },
};

export function registerDriver(id: AgentId, d: AgentDriver) {
  drivers[id] = d;
}

function driver(id: unknown): AgentDriver {
  const d = drivers[id as AgentId];
  if (!d) throw new Error("Agen ini belum tersedia.");
  return d;
}

export const agentStatus = (ctx: Ctx, id: unknown) =>
  drivers[id as AgentId] ? driver(id).status(ctx) : Promise.resolve<AgentStatus>({ installed: false, error: "Agen ini belum tersedia." });
export const agentSend = (ctx: Ctx, id: unknown, key: string, cfg: Record<string, unknown>, content: unknown) => driver(id).send(ctx, key, cfg ?? {}, content);
export const agentControl = (ctx: Ctx, id: unknown, key: string, msg: unknown) => (drivers[id as AgentId] ? driver(id).control(ctx, key, msg) : false);
export const agentClose = (id: unknown, key: string) => drivers[id as AgentId]?.close(key);
export const agentSessions = (id: unknown, cwd: string) => driver(id).sessions?.(cwd) ?? [];
export function agentSessionLoad(id: unknown, cwd: string, sid: string) {
  const d = driver(id);
  if (!d.sessionLoad) throw new Error("Agen ini belum menyimpan riwayat.");
  return d.sessionLoad(cwd, sid);
}
export function killAllAgents() {
  for (const d of Object.values(drivers)) d?.killAll();
}
