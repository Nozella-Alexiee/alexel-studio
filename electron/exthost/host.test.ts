// Uji integrasi: host sungguhan (dibangun dengan esbuild, dijalankan sebagai child process Node)
// memuat ekstensi palsu; sisi "UI" dimainkan oleh uji lewat kelas Rpc yang sama.

import { fork, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Rpc, type Msg } from "./rpc";

let dir: string;
let child: ChildProcess;
let rpc: Rpc;
const events: { e: string; p: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
const uiRequests: { m: string; p: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
let quickPickAnswer: number[] | null = [1];

const waitFor = async (cond: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
};

const EXT_JS = `
const vscode = require("vscode");
exports.activate = function (context) {
  const out = vscode.window.createOutputChannel("Demo");
  out.appendLine("halo");
  context.subscriptions.push(vscode.commands.registerCommand("demo.hello", async (name) => {
    const pick = await vscode.window.showInformationMessage("Halo " + name, "Ya", "Tidak");
    return "dijawab:" + (pick || "-");
  }));
  context.subscriptions.push(vscode.commands.registerCommand("demo.config", () => vscode.workspace.getConfiguration("demo").get("greeting", "x") + "|" + vscode.workspace.getConfiguration("demo").get("nested.value")));
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider("plaintext", {
    provideCompletionItems(doc, pos) {
      const word = doc.getText(doc.getWordRangeAtPosition(pos) || new vscode.Range(pos, pos));
      const it = new vscode.CompletionItem("sugesti-" + word, vscode.CompletionItemKind.Keyword);
      it.insertText = new vscode.SnippetString("sugesti(\${1:x})");
      it.detail = "demo";
      return [it];
    }
  }, "."));
  context.subscriptions.push(vscode.languages.registerHoverProvider("plaintext", { provideHover(doc, pos) { return new vscode.Hover(new vscode.MarkdownString("**baris** " + doc.lineAt(pos.line).text)); } }));
  context.subscriptions.push(vscode.languages.registerDefinitionProvider("plaintext", { provideDefinition(doc) { return new vscode.Location(doc.uri, new vscode.Range(0, 0, 0, 3)); } }));
  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider("plaintext", { provideDocumentFormattingEdits(doc) { return [vscode.TextEdit.replace(new vscode.Range(0, 0, 0, 1), doc.getText().slice(0,1).toUpperCase())]; } }));
  const diags = vscode.languages.createDiagnosticCollection("demo");
  const lint = (doc) => {
    const out = [];
    doc.getText().split("\\n").forEach((l, i) => { const j = l.indexOf("TODO"); if (j >= 0) out.push(new vscode.Diagnostic(new vscode.Range(i, j, i, j + 4), "ada TODO", vscode.DiagnosticSeverity.Warning)); });
    diags.set(doc.uri, out);
  };
  vscode.workspace.onDidOpenTextDocument(lint);
  vscode.workspace.onDidChangeTextDocument((e) => lint(e.document));
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
  item.text = "demo aktif"; item.command = "demo.hello"; item.show();
  context.subscriptions.push(vscode.commands.registerCommand("demo.pick", async () => {
    const r = await vscode.window.showQuickPick([{ label: "a" }, { label: "b" }, { label: "c" }]);
    return r && r.label;
  }));
  context.subscriptions.push(vscode.commands.registerCommand("demo.state", async () => {
    const n = (context.globalState.get("n") || 0) + 1; await context.globalState.update("n", n); return n;
  }));
  context.subscriptions.push(vscode.commands.registerCommand("demo.fs", async () => {
    const f = vscode.Uri.joinPath(vscode.Uri.file(context.extensionPath), "package.json");
    const bytes = await vscode.workspace.fs.readFile(f);
    return JSON.parse(Buffer.from(bytes).toString()).name + "|" + f.scheme + "|" + vscode.env.appName;
  }));
  context.subscriptions.push(vscode.commands.registerCommand("demo.edit", async () => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(require("path").join(context.extensionPath, "package.json")));
    const we = new vscode.WorkspaceEdit(); we.insert(doc.uri, new vscode.Position(0, 0), "X");
    return await vscode.workspace.applyEdit(we);
  }));
  return { ping: () => "pong" };
};
exports.deactivate = function () {};
`;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "alexel-host-"));
  const bundle = path.join(dir, "host.cjs");
  await build({ entryPoints: [path.resolve(__dirname, "host.ts")], outfile: bundle, bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "silent" });
  const extDir = path.join(dir, "ext");
  fs.mkdirSync(extDir);
  const manifest = {
    name: "demo",
    publisher: "me",
    version: "1.0.0",
    main: "./extension.js",
    activationEvents: ["onLanguage:plaintext", "onCommand:demo.hello"],
    contributes: { configuration: { properties: { "demo.greeting": { default: "hai" }, "demo.nested.value": { default: 5 } } }, commands: [{ command: "demo.config", title: "Config" }] },
  };
  fs.writeFileSync(path.join(extDir, "package.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(extDir, "extension.js"), EXT_JS);

  child = fork(bundle, [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  child.stderr?.on("data", (d) => process.stderr.write(d));
  rpc = new Rpc((m) => child.send(m));
  rpc.requests.set("ui/message", (p) => {
    uiRequests.push({ m: "ui/message", p });
    return p.items.length ? 0 : null;
  });
  rpc.requests.set("ui/quickPick", (p) => {
    uiRequests.push({ m: "ui/quickPick", p });
    return quickPickAnswer;
  });
  rpc.requests.set("ui/applyEdit", (p) => {
    uiRequests.push({ m: "ui/applyEdit", p });
    return true;
  });
  rpc.fallback = async (m, p) => {
    uiRequests.push({ m, p });
    return null;
  };
  child.on("message", (m: Msg) => {
    if (m.t === "evt") events.push({ e: m.m!, p: m.p });
    rpc.receive(m);
  });
  await waitFor(() => events.some((e) => e.e === "ready"));
  await rpc.request("init", { extensions: [{ id: "me.demo", dir: extDir, manifest }], root: dir, userData: path.join(dir, "ud"), settings: {} });
});

afterAll(async () => {
  await rpc.request("shutdown").catch(() => {});
  child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

const uri = () => "file://" + path.join(dir, "a.txt").replace(/\\/g, "/");

describe("extension host", () => {
  it("aktivasi lewat onCommand dan perintah mengembalikan hasil; pesan UI ditanyakan ke renderer", async () => {
    const r = await rpc.request("command/execute", { id: "demo.hello", args: ["Dunia"] });
    expect(r).toBe("dijawab:Ya");
    expect(uiRequests.find((u) => u.m === "ui/message")?.p).toMatchObject({ level: "info", text: "Halo Dunia", items: ["Ya", "Tidak"] });
    expect(events.some((e) => e.e === "ui/output" && e.p.channel === "Demo" && e.p.text === "halo\n")).toBe(true);
    expect(events.some((e) => e.e === "ui/statusItem" && e.p.text === "demo aktif" && e.p.visible)).toBe(true);
  });

  it("pengaturan: bawaan dari contributes.configuration dan nilai pemakai", async () => {
    expect(await rpc.request("command/execute", { id: "demo.config" })).toBe("hai|5");
    rpc.notify("config/set", { settings: { "demo.greeting": "halo", "demo.nested.value": 9 } });
    await new Promise((r) => setTimeout(r, 50));
    expect(await rpc.request("command/execute", { id: "demo.config" })).toBe("halo|9");
  });

  it("dokumen dibuka → aktivasi onLanguage, provider didaftarkan ke UI, diagnostik muncul", async () => {
    rpc.notify("doc/open", { uri: uri(), languageId: "plaintext", version: 1, text: "halo dunia\nTODO beres\n", eol: 1 });
    await waitFor(() => events.some((e) => e.e === "ui/diagnostics" && e.p.items?.length));
    const d = events.filter((e) => e.e === "ui/diagnostics").at(-1)!.p;
    expect(d.owner).toBe("me.demo:demo");
    expect(d.items[0]).toMatchObject({ message: "ada TODO", severity: 1, range: { s: { l: 1, c: 0 }, e: { l: 1, c: 4 } } });
    expect(events.filter((e) => e.e === "ui/providerRegistered").map((e) => e.p.kind)).toEqual(expect.arrayContaining(["completion", "hover", "definition", "formatting"]));
    expect(events.find((e) => e.e === "ui/providerRegistered" && e.p.kind === "completion")!.p.triggerCharacters).toEqual(["."]);
  });

  it("perubahan dokumen disinkronkan (offset) dan memicu ulang diagnostik", async () => {
    // Ganti "TODO" di baris 2 menjadi "ok  ".
    rpc.notify("doc/change", { uri: uri(), version: 2, changes: [{ start: 11, end: 15, text: "ok" }] });
    await waitFor(() => events.filter((e) => e.e === "ui/diagnostics").at(-1)!.p.items.length === 0);
  });

  it("completion, hover, definition, formatting lewat provide", async () => {
    const c = (await rpc.request("provide", { kind: "completion", uri: uri(), pos: { l: 0, c: 2 }, opts: { character: "." } })) as { items: any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(c.items[0]).toMatchObject({ label: "sugesti-halo", detail: "demo", snippet: true, insert: "sugesti(${1:x})" });
    const h = (await rpc.request("provide", { kind: "hover", uri: uri(), pos: { l: 0, c: 1 } })) as { contents: string[] };
    expect(h.contents[0]).toBe("**baris** halo dunia");
    const def = (await rpc.request("provide", { kind: "definition", uri: uri(), pos: { l: 0, c: 1 } })) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(def[0].range).toEqual({ s: { l: 0, c: 0 }, e: { l: 0, c: 3 } });
    const f = (await rpc.request("provide", { kind: "formatting", uri: uri(), opts: { tabSize: 2 } })) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(f).toEqual([{ range: { s: { l: 0, c: 0 }, e: { l: 0, c: 1 } }, newText: "H" }]);
  });

  it("quick pick, memento, fs, applyEdit, dan exports ekstensi", async () => {
    expect(await rpc.request("command/execute", { id: "demo.pick" })).toBe("b");
    expect(await rpc.request("command/execute", { id: "demo.state" })).toBe(1);
    expect(await rpc.request("command/execute", { id: "demo.state" })).toBe(2);
    expect(await rpc.request("command/execute", { id: "demo.fs" })).toBe("demo|file|Alexel Studio");
    expect(await rpc.request("command/execute", { id: "demo.edit" })).toBe(true);
    expect(uiRequests.find((u) => u.m === "ui/applyEdit")!.p.files[0].edits[0]).toEqual({ range: { s: { l: 0, c: 0 }, e: { l: 0, c: 0 } }, newText: "X" });
  });

  it("perintah bawaan editor diteruskan ke UI; modul vscode tak dikenal tidak membuat crash", async () => {
    await rpc.request("command/execute", { id: "editor.action.formatDocument" });
    expect(uiRequests.some((u) => u.m === "ui/executeCommand" && u.p.command === "editor.action.formatDocument")).toBe(true);
  });
});
