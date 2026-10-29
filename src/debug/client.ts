// Klien Debug Adapter Protocol di renderer: request/response bernomor, event, dan
// permintaan balik dari adapter (runInTerminal, startDebugging). Transport lewat IPC (src/lib/ipc).

import { api, on } from "../lib/ipc";
import { tl } from "../i18n";

type Handler = (body: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
type ReverseHandler = (command: string, args: any) => Promise<unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any

const clients = new Map<string, DapClient>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  void on<{ id: string; message: string }>("dap-message", ({ id, message }) => clients.get(id)?.receive(message));
  void on<{ id: string; code: number | null; stderr: string }>("dap-exit", ({ id, code, stderr }) => clients.get(id)?.exited(code, stderr));
}

export class DapClient {
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; command: string }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  private handlers = new Map<string, Set<Handler>>();
  onReverse: ReverseHandler = async () => {
    throw new Error("Tidak didukung.");
  };
  onExit: (code: number | null, stderr: string) => void = () => {};
  closed = false;
  /** Ditutup lewat stop() (bukan adapter yang keluar sendiri). */
  stopped = false;

  constructor(public id: string) {
    listen();
    clients.set(id, this);
  }

  receive(raw: string) {
    let m: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.type === "response") {
      const p = this.pending.get(m.request_seq);
      if (!p) return;
      this.pending.delete(m.request_seq);
      if (m.success) p.resolve(m.body ?? {});
      else p.reject(new Error(m.body?.error?.format ?? m.message ?? tl("{cmd} gagal", { cmd: p.command })));
    } else if (m.type === "event") {
      this.handlers.get(m.event)?.forEach((h) => h(m.body ?? {}));
      this.handlers.get("*")?.forEach((h) => h({ event: m.event, body: m.body ?? {} }));
    } else if (m.type === "request") {
      void this.onReverse(m.command, m.arguments ?? {}).then(
        (body) => this.send({ type: "response", request_seq: m.seq, command: m.command, success: true, body: body ?? {} }),
        (e: Error) => this.send({ type: "response", request_seq: m.seq, command: m.command, success: false, message: e.message })
      );
    }
  }

  exited(code: number | null, stderr: string) {
    this.closed = true;
    clients.delete(this.id);
    for (const p of this.pending.values()) p.reject(new Error(tl("Debug adapter berhenti.")));
    this.pending.clear();
    this.onExit(code, stderr);
  }

  private send(msg: Record<string, unknown>) {
    if (this.closed) return;
    void api.dapSend(this.id, { seq: ++this.seq, ...msg }).catch(() => {});
  }

  request<T = any>(command: string, args?: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (this.closed) return Promise.reject(new Error(tl("Sesi debug sudah berakhir.")));
    const seq = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(seq, { resolve, reject, command });
      void api.dapSend(this.id, { seq, type: "request", command, arguments: args ?? {} }).catch((e) => {
        this.pending.delete(seq);
        reject(e);
      });
    });
  }

  on(event: string, h: Handler) {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(h);
  }

  once(event: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Promise((resolve) => {
      const h: Handler = (b) => {
        this.handlers.get(event)?.delete(h);
        resolve(b);
      };
      this.on(event, h);
    });
  }

  stop() {
    this.closed = true;
    this.stopped = true;
    clients.delete(this.id);
    // Request yang masih menunggu tidak akan pernah dijawab (pesan dari adapter tidak lagi diteruskan).
    for (const p of this.pending.values()) p.reject(new Error(tl("Sesi debug sudah berakhir.")));
    this.pending.clear();
    void api.dapStop(this.id).catch(() => {});
  }
}
