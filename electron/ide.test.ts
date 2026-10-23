import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { IdeServer, lockDir } from "./ide";
import type { Ctx } from "./util";

let server: IdeServer;
let cfg: string;
const calls: { tool: string; args: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  cfg = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-ide-")));
  process.env.CLAUDE_CONFIG_DIR = cfg;
  const ctx = {
    userData: cfg,
    emit: (event: string, p: { id: number; tool: string; args: unknown }) => {
      if (event !== "ide-request") return;
      calls.push({ tool: p.tool, args: p.args });
      // Renderer palsu menjawab asinkron.
      setTimeout(() => {
        if (p.tool === "openDiff") server.reply(p.id, [{ type: "text", text: "FILE_SAVED" }, { type: "text", text: "isi baru" }]);
        else if (p.tool === "getDiagnostics") server.reply(p.id, [{ type: "text", text: JSON.stringify([{ uri: "file:///a.ts", diagnostics: [] }]) }]);
        else server.reply(p.id, undefined, "gagal");
      }, 5);
    },
  } as unknown as Ctx;
  server = new IdeServer(ctx, "9.9.9");
  await server.start("/proj");
});

afterAll(() => {
  server.stop();
  fs.rmSync(cfg, { recursive: true, force: true });
});

const connect = (token: string | null) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, ["mcp"], { headers: token ? { "x-claude-code-ide-authorization": token } : {} });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    ws.once("unexpected-response", (_r, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });

const rpc = (ws: WebSocket, method: string, params?: unknown) =>
  new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const id = Math.floor(Math.random() * 1e9);
    const on = (d: WebSocket.RawData) => {
      const m = JSON.parse(String(d));
      if (m.id === id) {
        ws.off("message", on);
        resolve(m);
      }
    };
    ws.on("message", on);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });

describe("server IDE (MCP)", () => {
  it("lockfile berisi format yang dicari CLI, token acak, dan hanya loopback", () => {
    const f = path.join(lockDir(), `${server.port}.lock`);
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    expect(j).toMatchObject({ pid: process.pid, workspaceFolders: ["/proj"], ideName: "Alexel Studio", transport: "ws", runningInWindows: false, authToken: server.token });
    expect(server.token).toMatch(/^[0-9a-f-]{36}$/);
    if (process.platform !== "win32") expect(fs.statSync(f).mode & 0o077).toBe(0);
  });

  it("tanpa token atau token salah ditolak (401)", async () => {
    await expect(connect(null)).rejects.toThrow(/401/);
    await expect(connect("salah")).rejects.toThrow(/401/);
  });

  it("initialize, tools/list, dan subprotokol mcp", async () => {
    const ws = await connect(server.token);
    expect(ws.protocol).toBe("mcp");
    const init = await rpc(ws, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "claude-code", version: "2" } });
    expect(init.result).toMatchObject({ protocolVersion: "2025-03-26", serverInfo: { name: "alexel-studio", version: "9.9.9" } });
    const list = await rpc(ws, "tools/list");
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(["openDiff", "getDiagnostics", "getOpenEditors", "getCurrentSelection", "openFile", "close_tab", "closeAllDiffTabs", "checkDocumentDirty", "saveDocument", "getWorkspaceFolders", "getLatestSelection"]));
    ws.close();
  });

  it("tools/call diteruskan ke editor; openDiff menunggu jawaban pemakai", async () => {
    const ws = await connect(server.token);
    const d = await rpc(ws, "tools/call", { name: "getDiagnostics", arguments: { uri: "file:///a.ts" } });
    expect(JSON.parse(d.result.content[0].text)[0].uri).toBe("file:///a.ts");
    const diff = await rpc(ws, "tools/call", { name: "openDiff", arguments: { old_file_path: "/a", new_file_path: "/a", new_file_contents: "x", tab_name: "t" } });
    expect(diff.result.content.map((c: { text: string }) => c.text)).toEqual(["FILE_SAVED", "isi baru"]);
    expect(calls.at(-1)).toMatchObject({ tool: "openDiff", args: { new_file_contents: "x" } });
    ws.close();
  });

  it("galat dari editor menjadi hasil isError; tool dan method asing ditolak", async () => {
    const ws = await connect(server.token);
    const e = await rpc(ws, "tools/call", { name: "openFile", arguments: { filePath: "/x" } });
    expect(e.result).toMatchObject({ isError: true });
    expect((await rpc(ws, "tools/call", { name: "hapusSemua", arguments: {} })).error.code).toBe(-32602);
    expect((await rpc(ws, "foo/bar")).error.code).toBe(-32601);
    ws.close();
  });

  it("notify mengirim notifikasi ke klien tersambung; stop menghapus lockfile", async () => {
    const ws = await connect(server.token);
    const got = new Promise<any>((r) => ws.once("message", (d) => r(JSON.parse(String(d))))); // eslint-disable-line @typescript-eslint/no-explicit-any
    server.notify("selection_changed", { filePath: "/a.ts", text: "hi" });
    expect(await got).toEqual({ jsonrpc: "2.0", method: "selection_changed", params: { filePath: "/a.ts", text: "hi" } });
    ws.close();
    const f = path.join(lockDir(), `${server.port}.lock`);
    server.stop();
    expect(fs.existsSync(f)).toBe(false);
  });
});

describe("lockfile basi", () => {
  it("lockfile Alexel Studio dengan pid mati dibersihkan; milik IDE lain tidak disentuh", async () => {
    const { cleanStaleLocks } = await import("./ide");
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "1111.lock"), JSON.stringify({ pid: 999999, ideName: "Alexel Studio" }));
    fs.writeFileSync(path.join(dir, "2222.lock"), JSON.stringify({ pid: 999999, ideName: "Visual Studio Code" }));
    fs.writeFileSync(path.join(dir, "3333.lock"), JSON.stringify({ pid: process.pid, ideName: "Alexel Studio" }));
    cleanStaleLocks();
    expect(fs.existsSync(path.join(dir, "1111.lock"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "2222.lock"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "3333.lock"))).toBe(true);
  });
});
