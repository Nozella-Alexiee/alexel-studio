// Sisi main process untuk extension host: menjalankan proses host, meneruskan permintaan UI dari host
// ke renderer (dan jawabannya), serta panggilan dari renderer ke host.

import { fork, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { clipboard, dialog, shell, BrowserWindow } from "electron";
import { childEnv, killTree, type Ctx } from "../util";
import { extCodeDir, extList, type InstalledExt } from "../extensions";
import { Rpc, type Msg } from "./rpc";
import { webviewCreate, webviewDispose, webviewHtml } from "./webviews";

export interface HostStart {
  root: string | null;
  settings: Record<string, unknown>;
  core?: Record<string, unknown>;
  trusted: string[];
  disabled: string[];
}

/** Lokasi skrip host; di aplikasi terpaket harus di luar asar supaya bisa dijalankan Node. */
export function hostScriptPath(dir = __dirname): string {
  return path.join(dir, "exthost.cjs").replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

/** Ekstensi yang boleh dijalankan: punya kode, dipercaya, dan tidak dimatikan. */
export function runnableExtensions(ctx: Ctx, trusted: string[], disabled: string[]): { id: string; dir: string; manifest: unknown; meta: InstalledExt }[] {
  const out: { id: string; dir: string; manifest: unknown; meta: InstalledExt }[] = [];
  for (const e of extList(ctx)) {
    if (!e.hasCode || !trusted.includes(e.id) || disabled.includes(e.id)) continue;
    const dir = extCodeDir(ctx, e.id);
    try {
      out.push({ id: e.id, dir, manifest: JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")), meta: e });
    } catch {
      /* paket kode rusak: lewati */
    }
  }
  return out;
}

let instance: ExtHostManager | null = null;
/** Satu extension host per aplikasi (jendela tunggal). */
export const hostManager = (ctx: Ctx): ExtHostManager => (instance ??= new ExtHostManager(ctx));
export const stopExtHost = () => void instance?.stop();

export class ExtHostManager {
  private child: ChildProcess | null = null;
  private rpc: Rpc | null = null;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private seq = 0;
  private stopping = false;

  constructor(private ctx: Ctx, private script = hostScriptPath()) {}

  get running(): boolean {
    return !!this.child && !this.child.killed;
  }

  async start(o: HostStart): Promise<{ count: number }> {
    await this.stop();
    const exts = runnableExtensions(this.ctx, o.trusted, o.disabled);
    if (!exts.length) return { count: 0 };
    if (!fs.existsSync(this.script)) throw new Error("Extension host tidak ditemukan di build ini.");
    this.stopping = false;
    const child = fork(this.script, [], { env: childEnv({ ELECTRON_RUN_AS_NODE: "1" }), // "advanced" = structured clone: pesan webview boleh berisi ArrayBuffer/typed array (mis. Cap'n Proto di Codex).
      serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"], cwd: o.root && fs.existsSync(o.root) ? o.root : undefined, windowsHide: true });
    this.child = child;
    const rpc = new Rpc((m) => child.send(m));
    this.rpc = rpc;
    rpc.fallback = (m, p) => this.toUi(m, p);
    let ready!: () => void;
    const readyP = new Promise<void>((r) => (ready = r));
    child.on("message", (m: Msg) => {
      if (m.t === "evt") {
        if (m.m === "ready") return ready();
        if (m.m === "ui/webview") {
          const w = m.p as { op: string; id: number; roots?: string[]; html?: string; owner?: string };
          if (w.op === "create") webviewCreate(w.id, w.roots ?? [], w.owner);
          else if (w.op === "html") webviewHtml(w.id, String(w.html ?? ""));
          else if (w.op === "dispose") webviewDispose(w.id);
        }
        this.ctx.emit("exthost-event", { e: m.m, p: m.p });
        return;
      }
      rpc.receive(m);
    });
    let errBuf = "";
    child.stderr?.on("data", (d: Buffer) => {
      errBuf = (errBuf + d.toString("utf8")).slice(-4000);
      this.ctx.emit("exthost-event", { e: "ui/output", p: { channel: "Extension Host", text: d.toString("utf8") } });
    });
    child.on("exit", (code) => {
      rpc.failAll("Extension host berhenti");
      for (const w of this.pending.values()) w.reject(new Error("Extension host berhenti"));
      this.pending.clear();
      if (this.child === child) {
        this.child = null;
        this.rpc = null;
      }
      if (!this.stopping) this.ctx.emit("exthost-exit", { code, stderr: errBuf });
    });
    await Promise.race([readyP, new Promise((_r, rej) => setTimeout(() => rej(new Error("Extension host tidak siap")), 15_000))]);
    await rpc.request("init", { extensions: exts.map((e) => ({ id: e.id, dir: e.dir, manifest: e.manifest })), root: o.root, userData: this.ctx.userData, settings: o.settings, core: o.core });
    void rpc.request("startup").catch(() => {});
    return { count: exts.length };
  }

  async stop(): Promise<void> {
    const child = this.child;
    const rpc = this.rpc;
    this.stopping = true;
    this.child = null;
    this.rpc = null;
    if (!child) return;
    try {
      await rpc?.request("shutdown", undefined, 3000);
    } catch {
      /* langsung dimatikan */
    }
    killTree(child);
  }

  call(m: string, p?: unknown): Promise<unknown> {
    if (!this.rpc) return Promise.reject(new Error("Extension host tidak berjalan"));
    return this.rpc.request(m, p, 20_000);
  }

  notify(e: string, p?: unknown) {
    this.rpc?.notify(e, p);
  }

  /** Jawaban renderer untuk permintaan UI dari host. */
  reply(id: number, result: unknown, error?: string) {
    const w = this.pending.get(id);
    if (!w) return;
    this.pending.delete(id);
    if (error !== undefined && error !== null) w.reject(new Error(error));
    else w.resolve(result);
  }

  /** Permintaan UI dari host: sebagian ditangani di main, selebihnya diteruskan ke renderer. */
  private async toUi(m: string, p: unknown): Promise<unknown> {
    const a = (p ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const win = BrowserWindow.getAllWindows()[0];
    switch (m) {
      case "ui/clipboardRead":
        return clipboard.readText();
      case "ui/clipboardWrite":
        clipboard.writeText(String(a.text ?? ""));
        return null;
      case "ui/openExternal": {
        const url = String(a.url ?? "");
        if (!/^(https?:|mailto:)/i.test(url)) return false;
        await shell.openExternal(url);
        return true;
      }
      case "ui/openDialog": {
        if (!win) return null;
        const r = await dialog.showOpenDialog(win, { title: a.title, defaultPath: a.defaultUri?.path, properties: [a.canSelectFiles === false ? undefined : "openFile", a.canSelectFolders ? "openDirectory" : undefined, a.canSelectMany ? "multiSelections" : undefined].filter(Boolean) as ("openFile" | "openDirectory" | "multiSelections")[] });
        return r.canceled ? null : r.filePaths;
      }
      case "ui/saveDialog": {
        if (!win) return null;
        const r = await dialog.showSaveDialog(win, { title: a.title, defaultPath: a.defaultUri?.path });
        return r.canceled || !r.filePath ? null : r.filePath;
      }
      default:
        return new Promise((resolve, reject) => {
          const id = ++this.seq;
          this.pending.set(id, { resolve, reject });
          this.ctx.emit("exthost-request", { id, m, p });
        });
    }
  }
}
