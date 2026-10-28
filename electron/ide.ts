// Integrasi IDE untuk agen: server MCP lokal (WebSocket) + lockfile di ~/.claude/ide, protokol yang sama
// dengan ekstensi resmi Claude Code untuk VS Code. CLI yang berjalan di folder project (di terminal Alexel
// Studio, atau sesi panel Agen AI dengan --ide) menemukan lockfile ini lalu bisa: membaca seleksi & berkas
// terbuka, meminta diagnostik, membuka berkas, dan menampilkan diff untuk disetujui di editor.
//
// Hanya mendengarkan 127.0.0.1, wajib header token acak, token baru tiap aplikasi dijalankan.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { Ctx } from "./util";

export const lockDir = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "ide");

/** Hapus lockfile milik Alexel Studio yang prosesnya sudah mati (aplikasi ditutup paksa) atau port lama dari PID ini. */
export function cleanStaleLocks(currentPort?: number) {
  try {
    for (const n of fs.readdirSync(lockDir())) {
      if (!n.endsWith(".lock")) continue;
      const f = path.join(lockDir(), n);
      try {
        const j = JSON.parse(fs.readFileSync(f, "utf8")) as { pid?: number; ideName?: string };
        if (j.ideName !== "Alexel Studio" || !j.pid) continue;
        const portFromFilename = parseInt(n.replace(/\.lock$/, ""), 10);
        if (isNaN(portFromFilename)) continue;
        if (j.pid === process.pid) {
          if (currentPort !== undefined && portFromFilename !== currentPort) {
            fs.rmSync(f, { force: true });
          }
          continue;
        }
        try {
          process.kill(j.pid, 0);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ESRCH") fs.rmSync(f, { force: true });
        }
      } catch {
        /* bukan milik kita / rusak */
      }
    }
  } catch {
    /* folder belum ada */
  }
}

export const IDE_TOOLS = [
  { name: "getOpenEditors", description: "Get information about currently open editors", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "getWorkspaceFolders", description: "Get all workspace folders currently open in the IDE", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "getCurrentSelection", description: "Get the current text selection in the active editor", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "getLatestSelection", description: "Get the most recent text selection (even if not in the active editor)", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "getDiagnostics", description: "Get language diagnostics from the IDE", inputSchema: { type: "object", properties: { uri: { type: "string", description: "Optional file URI to get diagnostics for. If not provided, gets diagnostics for all files." } }, additionalProperties: false } },
  { name: "openFile", description: "Open a file in the editor and optionally select a range of text", inputSchema: { type: "object", properties: { filePath: { type: "string" }, preview: { type: "boolean", default: false }, startText: { type: "string" }, endText: { type: "string" }, selectToEndOfLine: { type: "boolean", default: false }, makeFrontmost: { type: "boolean", default: true } }, required: ["filePath"], additionalProperties: false } },
  { name: "openDiff", description: "Open a git diff for the file", inputSchema: { type: "object", properties: { old_file_path: { type: "string" }, new_file_path: { type: "string" }, new_file_contents: { type: "string" }, tab_name: { type: "string" } }, required: ["old_file_path", "new_file_path", "new_file_contents", "tab_name"], additionalProperties: false } },
  { name: "close_tab", description: "Close a tab by name", inputSchema: { type: "object", properties: { tab_name: { type: "string" } }, required: ["tab_name"], additionalProperties: false } },
  { name: "closeAllDiffTabs", description: "Close all diff tabs in the editor", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "checkDocumentDirty", description: "Check if a document has unsaved changes", inputSchema: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"], additionalProperties: false } },
  { name: "saveDocument", description: "Save a document with unsaved changes", inputSchema: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"], additionalProperties: false } },
] as const;

type Rpc = { jsonrpc: "2.0"; id?: number | string; method?: string; params?: any; result?: unknown; error?: unknown }; // eslint-disable-line @typescript-eslint/no-explicit-any

export class IdeServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; ws: WebSocket; rpcId?: number | string }>();
  private seq = 0;
  port = 0;
  token = "";
  private folders: string[] = [];
  private lockFile: string | null = null;

  constructor(private ctx: Ctx, private version: string) {}

  get running() {
    return !!this.server;
  }

  /** Mulai (sekali) lalu pasang/ubah lockfile untuk folder project saat ini. */
  async start(root: string | null, extra: string[] = []): Promise<{ port: number; token: string }> {
    if (!this.server) {
      cleanStaleLocks();
      await this.listen();
    }
    // Sertakan path asli (realpath): CLI membandingkan dengan cwd yang sudah di-resolve (mis. /tmp → /private/tmp di macOS).
    const real = (() => {
      try {
        return root ? fs.realpathSync(root) : null;
      } catch {
        return null;
      }
    })();
    const realOf = (p: string) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return p;
      }
    };
    this.folders = [...new Set([root, real, ...extra, ...extra.map(realOf)].filter((x): x is string => !!x))];
    this.writeLock();
    return { port: this.port, token: this.token };
  }

  private listen(): Promise<void> {
    this.token = randomUUID();
    const server = http.createServer((_req, res) => {
      res.writeHead(426);
      res.end("Upgrade Required");
    });
    const wss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => (protocols.has("mcp") ? "mcp" : false) });
    server.on("upgrade", (req, socket, head) => {
      const given = req.headers["x-claude-code-ide-authorization"];
      if (given !== this.token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.onClient(ws));
    });
    this.server = server;
    this.wss = wss;
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        this.port = (server.address() as { port: number }).port;
        resolve();
      });
    });
  }

  private writeLock() {
    try {
      cleanStaleLocks(this.port);
      fs.mkdirSync(lockDir(), { recursive: true, mode: 0o700 });
      this.lockFile = path.join(lockDir(), `${this.port}.lock`);
      fs.writeFileSync(this.lockFile, JSON.stringify({ pid: process.pid, workspaceFolders: this.folders, ideName: "Alexel Studio", transport: "ws", runningInWindows: process.platform === "win32", authToken: this.token }), { mode: 0o600 });
    } catch (e) {
      console.warn("Gagal menulis lockfile IDE", e);
    }
  }

  private onClient(ws: WebSocket) {
    this.clients.add(ws);
    ws.on("message", (data) => {
      let msg: Rpc;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      void this.onMessage(ws, msg);
    });
    ws.on("close", () => this.dropClient(ws));
    ws.on("error", () => this.dropClient(ws));
  }

  /** Klien putus (CLI ditutup/diinterupsi): permintaannya dibatalkan dan editor menutup diff yang masih terbuka. */
  private dropClient(ws: WebSocket) {
    this.clients.delete(ws);
    for (const [id, w] of [...this.pending]) {
      if (w.ws !== ws) continue;
      this.pending.delete(id);
      w.reject(new Error("Klien terputus"));
      this.ctx.emit("ide-cancel", { id });
    }
  }

  private send(ws: WebSocket, msg: Rpc) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private async onMessage(ws: WebSocket, msg: Rpc) {
    if (msg.method === undefined) return; // respons dari klien: tidak ada request dari server
    const reply = (result: unknown) => msg.id !== undefined && this.send(ws, { jsonrpc: "2.0", id: msg.id, result });
    const fail = (code: number, message: string) => msg.id !== undefined && this.send(ws, { jsonrpc: "2.0", id: msg.id, error: { code, message } });
    switch (msg.method) {
      case "initialize":
        reply({ protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: { listChanged: true }, logging: {} }, serverInfo: { name: "alexel-studio", version: this.version } });
        // Beri tahu klien bahwa IDE siap (pola ekstensi resmi).
        return;
      case "notifications/initialized":
        return;
      case "notifications/cancelled": {
        // CLI membatalkan request (mis. pemakai menekan Esc): batalkan juga di editor.
        const rid = msg.params?.requestId;
        for (const [id, w] of [...this.pending]) {
          if (w.ws === ws && w.rpcId === rid) {
            this.pending.delete(id);
            w.reject(new Error("Dibatalkan"));
            this.ctx.emit("ide-cancel", { id });
          }
        }
        return;
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: IDE_TOOLS });
      case "resources/list":
        return reply({ resources: [] });
      case "prompts/list":
        return reply({ prompts: [] });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        if (!IDE_TOOLS.some((t) => t.name === name)) return fail(-32602, `Tool tidak dikenal: ${name}`);
        try {
          const content = await this.callRenderer(name, msg.params?.arguments ?? {}, ws, msg.id);
          reply({ content });
        } catch (e) {
          reply({ isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] });
        }
        return;
      }
      default:
        return fail(-32601, `Method not found: ${msg.method}`);
    }
  }

  /** Jalankan tool di renderer (editor): mengembalikan blok content MCP. */
  private callRenderer(tool: string, args: unknown, ws: WebSocket, rpcId?: number | string): Promise<{ type: "text"; text: string }[]> {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, ws, rpcId });
      this.ctx.emit("ide-request", { id, tool, args });
      // openDiff menunggu keputusan pemakai; tool lain harus cepat.
      if (tool !== "openDiff")
        setTimeout(() => {
          if (this.pending.delete(id)) reject(new Error(`Editor tidak menjawab (${tool})`));
        }, 30_000);
    });
  }

  reply(id: number, result: unknown, error?: string) {
    const w = this.pending.get(id);
    if (!w) return;
    this.pending.delete(id);
    if (error) w.reject(new Error(error));
    else w.resolve(result);
  }

  /** Kirim notifikasi MCP ke semua CLI yang tersambung (selection_changed, at_mentioned). */
  notify(method: string, params: unknown) {
    for (const ws of this.clients) this.send(ws, { jsonrpc: "2.0", method, params });
  }

  clientCount() {
    return this.clients.size;
  }

  stop() {
    for (const w of this.pending.values()) w.reject(new Error("IDE dihentikan"));
    this.pending.clear();
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    this.wss?.close();
    this.server?.close();
    this.server = null;
    this.wss = null;
    if (this.lockFile) {
      try {
        fs.rmSync(this.lockFile, { force: true });
      } catch {
        /* abaikan */
      }
      this.lockFile = null;
    }
  }
}

let instance: IdeServer | null = null;
export const ideServer = (ctx: Ctx, version: string) => (instance ??= new IdeServer(ctx, version));
export const stopIde = () => instance?.stop();
export const currentIde = () => instance;
