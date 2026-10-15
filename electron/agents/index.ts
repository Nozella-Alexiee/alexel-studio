// Router agen AI: Claude Code (stream-json), Codex (app-server), Gemini & agen lain (ACP).
// Setiap agen menulis event berbentuk stream-json Claude ke kanal `agent-event`, sehingga
// panel di renderer cukup memahami satu format (teks, alat, kartu izin, hasil).

import * as claude from "../claude";
import { agyClose, agyControl, agySend, agyStatus, killAllAgy } from "./antigravity";
import { acpClose, acpControl, acpLogin, acpSend, acpStatus, killAllAcp } from "./acp";
import { codexClose, codexControl, codexSend, codexSessionLoad, codexSessions, codexStatus, killAllCodex } from "./codex";
import { installAgentPackage, installedAgent, installNpmAgent, NPM_PACKAGES, removeAgentPackage, removeNpmAgent } from "./install";
import type { Ctx } from "../util";

export type AgentId = "claude" | "codex" | "gemini" | "antigravity" | "acp";

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
  status(ctx: Ctx, cfg?: Record<string, unknown>): Promise<AgentStatus>;
  send(ctx: Ctx, key: string, cfg: Record<string, unknown>, content: unknown): void | Promise<void>;
  control(ctx: Ctx, key: string, msg: unknown): boolean | Promise<boolean>;
  close(key: string): void;
  sessions?(cwd: string, ctx: Ctx): unknown;
  sessionLoad?(cwd: string, id: string, ctx: Ctx): unknown;
  killAll(): void;
}

const useExtClaude = (ctx: Ctx) => {
  const inst = installedAgent(ctx, "claude");
  claude.setPreferredClaude(inst?.binary ?? null);
  return inst;
};

const drivers: Partial<Record<AgentId, AgentDriver>> = {
  claude: {
    status: async (ctx) => {
      const inst = useExtClaude(ctx);
      return { ...(await claude.claudeDetect()), source: inst ? "extension" : "system" };
    },
    send: (ctx, key, cfg, content) => {
      useExtClaude(ctx);
      return claude.claudeSessionSend(ctx, key, cfg, content);
    },
    control: (_ctx, key, msg) => claude.claudeSessionControl(key, msg),
    close: (key) => claude.claudeSessionClose(key),
    sessions: (cwd) => claude.claudeSessionsList(cwd),
    sessionLoad: (cwd, id) => claude.claudeSessionLoad(cwd, id),
    killAll: () => claude.killAllClaude(),
  },
};

drivers.codex = {
  status: (ctx) => codexStatus(ctx),
  send: (ctx, key, cfg, content) => codexSend(ctx, key, cfg, content),
  control: (_ctx, key, msg) => codexControl(key, msg),
  close: (key) => codexClose(key),
  sessions: (cwd, ctx) => codexSessions(ctx, cwd),
  sessionLoad: (cwd, id, ctx) => codexSessionLoad(ctx, cwd, id),
  killAll: () => killAllCodex(),
};

for (const id of ["gemini", "acp"] as const) {
  drivers[id] = {
    status: (ctx, cfg) => acpStatus(ctx, id, cfg?.command as string | undefined),
    send: (ctx, key, cfg, content) => acpSend(ctx, id, key, cfg, content),
    control: (_ctx, key, msg) => acpControl(key, msg),
    close: (key) => acpClose(key),
    killAll: () => killAllAcp(),
  };
}

drivers.antigravity = {
  status: () => agyStatus(),
  send: (ctx, key, cfg, content) => agySend(ctx, key, cfg, content),
  control: (_ctx, key, msg) => agyControl(key, msg),
  close: (key) => agyClose(key),
  killAll: () => killAllAgy(),
};

export function registerDriver(id: AgentId, d: AgentDriver) {
  drivers[id] = d;
}

function driver(id: unknown): AgentDriver {
  const d = drivers[id as AgentId];
  if (!d) throw new Error("Agen ini belum tersedia.");
  return d;
}

export const agentStatus = (ctx: Ctx, id: unknown, cfg?: Record<string, unknown>) =>
  drivers[id as AgentId] ? driver(id).status(ctx, cfg) : Promise.resolve<AgentStatus>({ installed: false, error: "Agen ini belum tersedia." });
export const agentSend = (ctx: Ctx, id: unknown, key: string, cfg: Record<string, unknown>, content: unknown) => driver(id).send(ctx, key, cfg ?? {}, content);
export const agentControl = (ctx: Ctx, id: unknown, key: string, msg: unknown) => (drivers[id as AgentId] ? driver(id).control(ctx, key, msg) : false);
export const agentClose = (id: unknown, key: string) => drivers[id as AgentId]?.close(key);
export const agentSessions = (ctx: Ctx, id: unknown, cwd: string) => driver(id).sessions?.(cwd, ctx) ?? [];
export function agentSessionLoad(ctx: Ctx, id: unknown, cwd: string, sid: string) {
  const d = driver(id);
  if (!d.sessionLoad) throw new Error("Agen ini belum menyimpan riwayat.");
  return d.sessionLoad(cwd, sid, ctx);
}
export function killAllAgents() {
  for (const d of Object.values(drivers)) d?.killAll();
}

export const agentInstall = (ctx: Ctx, id: unknown) => (NPM_PACKAGES[String(id)] ? installNpmAgent(ctx, String(id)) : installAgentPackage(ctx, String(id)));
export const agentUninstall = (ctx: Ctx, id: unknown) => (NPM_PACKAGES[String(id)] ? removeNpmAgent(ctx, String(id)) : removeAgentPackage(ctx, String(id)));
/** Masuk ke agen ACP (Gemini) lewat metode autentikasinya sendiri. */
export const agentLogin = (ctx: Ctx, id: unknown, cfg?: Record<string, unknown>) => {
  if (id !== "gemini" && id !== "acp") throw new Error("Masuk untuk agen ini dilakukan lewat terminal.");
  return acpLogin(ctx, id, cfg?.command as string | undefined);
};
export const agentInstalled = (ctx: Ctx, id: unknown) => installedAgent(ctx, String(id));
