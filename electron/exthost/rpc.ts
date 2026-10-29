// RPC dua arah antar main process dan proses extension host (JSON lewat kanal IPC child_process).

export interface Msg {
  t: "req" | "res" | "evt";
  id?: number;
  m?: string;
  p?: unknown;
  r?: unknown;
  e?: string;
}

type Handler = (params: any) => unknown | Promise<unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class Rpc {
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout | null }>();
  readonly requests = new Map<string, Handler>();
  readonly events = new Map<string, Handler>();
  /** Dipanggil untuk request tanpa penangan terdaftar (mis. diteruskan ke sisi lain). */
  fallback: ((m: string, p: unknown) => Promise<unknown>) | null = null;

  constructor(private send: (m: Msg) => void) {}

  request<T = unknown>(m: string, p?: unknown, timeoutMs = 120_000): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC ${m} timeout`));
      }, timeoutMs) : null;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        this.send({ t: "req", id, m, p });
      } catch (e) {
        this.pending.delete(id);
        if (timer) clearTimeout(timer);
        reject(e as Error);
      }
    });
  }

  notify(e: string, p?: unknown) {
    try {
      this.send({ t: "evt", m: e, p });
    } catch {
      /* kanal tertutup */
    }
  }

  /** Gagalkan semua request yang menunggu (kanal putus). */
  failAll(reason: string) {
    for (const [id, w] of this.pending) {
      if (w.timer) clearTimeout(w.timer);
      w.reject(new Error(reason));
      this.pending.delete(id);
    }
  }

  receive(msg: Msg) {
    if (msg.t === "res") {
      const w = this.pending.get(msg.id!);
      if (!w) return;
      this.pending.delete(msg.id!);
      if (w.timer) clearTimeout(w.timer);
      if (msg.e !== undefined) w.reject(new Error(msg.e));
      else w.resolve(msg.r);
    } else if (msg.t === "req") {
      const h = this.requests.get(msg.m!);
      const run = h ? Promise.resolve().then(() => h(msg.p)) : this.fallback ? this.fallback(msg.m!, msg.p) : Promise.reject(new Error(`RPC: tidak ada penangan untuk ${msg.m}`));
      // send bisa melempar (kanal tertutup, hasil tidak bisa di-clone): jangan jadi unhandled rejection,
      // dan sebisa mungkin kirim galat supaya sisi lain tidak menunggu sampai timeout.
      const reply = (m: Msg) => {
        try {
          this.send(m);
        } catch (err) {
          if (m.e !== undefined) return;
          try {
            this.send({ t: "res", id: msg.id, e: `RPC: hasil ${msg.m} tidak bisa dikirim (${err instanceof Error ? err.message : String(err)})` });
          } catch {
            /* kanal tertutup */
          }
        }
      };
      run.then(
        (r) => reply({ t: "res", id: msg.id, r }),
        (e) => reply({ t: "res", id: msg.id, e: e instanceof Error ? e.message : String(e) })
      );
    } else {
      const h = this.events.get(msg.m!);
      if (h) {
        try {
          void Promise.resolve(h(msg.p)).catch((e) => console.error("[rpc] event", msg.m, e));
        } catch (e) {
          console.error("[rpc] event", msg.m, e);
        }
      }
    }
  }
}
