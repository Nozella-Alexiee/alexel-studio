// vscode.tasks dasar: provider task dari ekstensi (mis. npm, Gradle, Cargo) jadi target Smart Run,
// dan executeTask menjalankan ShellExecution/ProcessExecution di terminal Alexel Studio.
// CustomExecution (pseudoterminal) belum didukung.

import path from "node:path";
import type { HostCtx, LoadedExt } from "./context";
import * as T from "./types";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const providers = new Map<number, { type: string; provider: Any; ext: LoadedExt | null }>();
let seq = 0;
/** Task terakhir dari `tasks/list` (id → objek Task) supaya `tasks/run` memakai objek aslinya. */
const listed = new Map<string, Any>();

const quote = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, "\\$1")}"`);
const argText = (a: Any): string => (typeof a === "string" ? a : typeof a?.value === "string" ? a.value : String(a ?? ""));

/** Perintah shell + folder kerja dari execution task; null bila tidak bisa dijalankan sebagai perintah. */
export function taskCommand(task: Any, root: string | null, platform = process.platform): { command: string; cwd: string } | null {
  const ex = task?.execution;
  if (!ex) return null;
  const cwdOpt = ex.options?.cwd as string | undefined;
  const cwd = cwdOpt ? path.resolve(root ?? ".", cwdOpt.replace(/\$\{workspaceFolder\}/g, root ?? ".")) : root ?? ".";
  let command: string;
  if (ex instanceof T.ProcessExecution || (typeof ex.process === "string" && !("commandLine" in ex))) {
    command = [quote(ex.process), ...((ex.args ?? []) as unknown[]).map((a) => quote(argText(a)))].join(" ");
  } else if (typeof ex.commandLine === "string" && ex.args === undefined) {
    command = ex.commandLine;
  } else if (ex.commandLine !== undefined) {
    command = [argText(ex.commandLine), ...((ex.args ?? []) as unknown[]).map((a) => quote(argText(a)))].join(" ");
  } else return null;
  // PowerShell: perintah yang diawali string ber-kutip butuh operator &.
  if (platform === "win32" && command.startsWith('"')) command = `& ${command}`;
  return { command: command.replace(/\$\{workspaceFolder\}/g, root ?? "."), cwd };
}

export function tasksApi(hc: HostCtx, ext: LoadedExt | null) {
  const started = new T.EventEmitter<Any>();
  const ended = new T.EventEmitter<Any>();
  const api = {
    taskExecutions: [] as Any[],
    registerTaskProvider(type: string, provider: Any) {
      const id = ++seq;
      providers.set(id, { type, provider, ext });
      return new T.Disposable(() => providers.delete(id));
    },
    async fetchTasks(filter?: { type?: string }) {
      return collectTasks(hc, filter?.type);
    },
    async executeTask(task: Any) {
      const c = taskCommand(task, hc.root);
      if (!c) throw new Error(`Task "${task?.name}" tidak bisa dijalankan (CustomExecution belum didukung).`);
      await hc.rpc.request("ui/runTask", { label: `${task.name}${task.source ? ` (${task.source})` : ""}`, ...c });
      const exec = { task, terminate() {} };
      started.fire({ execution: exec });
      return exec;
    },
    onDidStartTask: started.event,
    onDidEndTask: ended.event,
    onDidStartTaskProcess: new T.EventEmitter<Any>().event,
    onDidEndTaskProcess: new T.EventEmitter<Any>().event,
  };
  return api;
}

async function collectTasks(hc: HostCtx, type?: string): Promise<Any[]> {
  const out: Any[] = [];
  for (const { type: t, provider, ext } of providers.values()) {
    if (type && t !== type) continue;
    try {
      const list = await Promise.race([Promise.resolve(provider.provideTasks?.(new T.CancellationTokenSource().token)), new Promise((r) => setTimeout(() => r([]), 10_000))]);
      for (const task of (list as Any[]) ?? []) out.push(task);
    } catch (e) {
      hc.log(ext, `provideTasks gagal: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

/** Untuk Smart Run: task ekstensi yang bisa dijalankan sebagai perintah shell. */
export async function listTasks(hc: HostCtx) {
  listed.clear();
  const tasks = await collectTasks(hc);
  const out: { id: string; label: string; source: string; command: string; cwd: string; group?: string }[] = [];
  tasks.forEach((task, i) => {
    const c = taskCommand(task, hc.root);
    if (!c) return;
    const id = `${task.source ?? "ext"}:${task.name}:${i}`;
    listed.set(id, task);
    out.push({ id, label: String(task.name), source: String(task.source ?? ""), group: task.group?.id, ...c });
  });
  return out;
}
