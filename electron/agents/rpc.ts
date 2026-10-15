// JSON-RPC per baris (newline-delimited) di stdin/stdout sebuah proses agen.
// Dipakai Codex app-server dan agen ACP.

import type { ChildProcess } from "node:child_process";
import readline from "node:readline";

type Id = number | string;

export interface RpcHandlers {
  onNotify: (method: string, params: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Permintaan dari agen ke editor; jawab lewat respond()/respondError(). */
  onRequest: (id: Id, method: string, params: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class LineRpc {
  private seq = 0;
  private pending = new Map<Id, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> }>();
  closed = false;

  constructor(
    private child: ChildProcess,
    private h: RpcHandlers,
    /** ACP memakai "jsonrpc": "2.0"; Codex tidak memerlukannya. */
    private jsonrpc = false
  ) {
    readline.createInterface({ input: child.stdout! }).on("line", (line) => this.onLine(line));
    child.stdin?.on("error", () => {});
    child.on("close", () => {
      this.closed = true;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Proses agen berhenti."));
      }
      this.pending.clear();
    });
  }

  private write(obj: Record<string, unknown>) {
    if (this.closed || !this.child.stdin || this.child.stdin.destroyed) return;
    this.child.stdin.write(JSON.stringify(this.jsonrpc ? { jsonrpc: "2.0", ...obj } : obj) + "\n");
  }

  private onLine(line: string) {
    if (!line.trim()) return;
    let m: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (m.id !== undefined && m.method === undefined) {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(new Error(typeof m.error?.message === "string" ? m.error.message : "Permintaan ditolak agen."));
      else p.resolve(m.result);
      return;
    }
    if (m.id !== undefined && typeof m.method === "string") return this.h.onRequest(m.id, m.method, m.params);
    if (typeof m.method === "string") this.h.onNotify(m.method, m.params);
  }

  request<T = any>(method: string, params?: unknown, timeoutMs = 0): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = timeoutMs ? setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: agen tidak menjawab.`));
      }, timeoutMs) : undefined;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.write({ id, method, ...(params !== undefined ? { params } : {}) });
    });
  }

  notify(method: string, params?: unknown) {
    this.write({ method, ...(params !== undefined ? { params } : {}) });
  }

  respond(id: Id, result: unknown) {
    this.write({ id, result });
  }

  respondError(id: Id, message: string, code = -32601) {
    this.write({ id, error: { code, message } });
  }
}
