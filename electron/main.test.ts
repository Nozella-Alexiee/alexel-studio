// Test main process (port dari test Rust). Tidak butuh Electron: modul menerima Ctx.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as F from "./fsOps";
import { gitStatus, parseStatus, git } from "./git";
import { snapshotIn, _test as H } from "./history";
import { resolvePreview, setOverride, setRoot } from "./preview";
import { commandForFile, detectTargets } from "./runner";
import { buildRegex, parseTodoLine, scanTodos, searchProject, walkFiles } from "./search";
import { validKey } from "./store";
import { parseLsof, parsePmset } from "./system";
import { ensureCleanPath, runCapture, shellQuote, type Ctx } from "./util";
import { classify } from "./watcher";

const tmp = (name: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `nozel-${name}-`));
  return fs.realpathSync(d);
};
const ctx = (dir: string): Ctx => ({ userData: dir, emit: () => {}, trash: async (p) => fs.rmSync(p, { recursive: true, force: true }), reveal: () => {} });

/** Tes yang bergantung pada shell & path POSIX (sh, quoting '…'); dilewati di Windows. */
const posix = process.platform === "win32" ? it.skip : it;

describe("util", () => {
  posix("quote shell aman", () => {
    expect(shellQuote("/usr/bin/node")).toBe("/usr/bin/node");
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote("$(rm -rf ~)")).toBe("'$(rm -rf ~)'");
    expect(shellQuote("")).toBe("''");
  });
  posix("runCapture: timeout & stdin tertutup", async () => {
    const t = await runCapture("/bin/sh", ["-c", "sleep 5"], { timeoutMs: 200 });
    expect(t.timedOut).toBe(true);
    const r = await runCapture("/bin/sh", ["-c", "read x; echo got:$x"], { timeoutMs: 5000 });
    expect(r.timedOut).toBe(false);
    expect(r.stdout).toContain("got:");
  });
  posix("menolak path dengan ..", () => {
    expect(() => ensureCleanPath("/a/../b")).toThrow();
    expect(() => ensureCleanPath("rel/a")).toThrow();
    expect(() => ensureCleanPath("/a/b")).not.toThrow();
  });
});

describe("fsOps", () => {
  it("tulis atomik, baca, deteksi CRLF", async () => {
    const d = tmp("rw");
    const f = path.join(d, "a.txt");
    await F.writeAtomic(f, "halo\r\ndunia");
    const t = await F.readText(f);
    expect(t.content).toBe("halo\r\ndunia");
    expect(t.eol).toBe("crlf");
    expect(fs.readdirSync(d)).toEqual(["a.txt"]);
  });
  it("menolak biner & non-UTF-8", async () => {
    const d = tmp("bin");
    fs.writeFileSync(path.join(d, "x.bin"), Buffer.from([0, 1, 2]));
    await expect(F.readText(path.join(d, "x.bin"))).rejects.toThrow(/^BINARY/);
    fs.writeFileSync(path.join(d, "x.txt"), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    await expect(F.readText(path.join(d, "x.txt"))).rejects.toThrow(/^ENCODING/);
  });
  it("listDir: folder dulu, .DS_Store disembunyikan; duplikat & createFile", async () => {
    const d = tmp("ls");
    fs.writeFileSync(path.join(d, "b.rs"), "");
    fs.writeFileSync(path.join(d, ".DS_Store"), "");
    fs.mkdirSync(path.join(d, "z_dir"));
    const l = await F.listDir(d);
    expect(l.map((x) => x.name)).toEqual(["z_dir", "b.rs"]);
    expect(l[1].extension).toBe("rs");
    expect(path.basename(await F.duplicateEntry(path.join(d, "b.rs")))).toBe("b copy.rs");
    await expect(F.createFile(path.join(d, "b.rs"))).rejects.toThrow(/Sudah ada/);
  });
  it("simpan mencatat time-travel", async () => {
    const d = tmp("hist");
    const f = path.join(d, "a.ts");
    await F.writeText(ctx(d), f, "satu");
    await F.writeText(ctx(d), f, "dua");
    await F.writeText(ctx(d), f, "dua");
    const { historyList } = await import("./history");
    expect(historyList(ctx(d), f).length).toBe(2);
  });
});

describe("history", () => {
  it("dedupe & dibatasi", () => {
    const dir = tmp("cap");
    snapshotIn(dir, "/tmp/x.ts", "a");
    snapshotIn(dir, "/tmp/x.ts", "a");
    expect(H.listSorted(dir).length).toBe(1);
    for (let i = 0; i < H.MAX_SNAPSHOTS_PER_FILE + 5; i++) snapshotIn(dir, "/tmp/x.ts", `v${i}`);
    const all = H.listSorted(dir);
    expect(all.length).toBe(H.MAX_SNAPSHOTS_PER_FILE);
    expect(fs.readFileSync(all[all.length - 1].p, "utf8")).toBe(`v${H.MAX_SNAPSHOTS_PER_FILE + 4}`);
  });
});

describe("git", () => {
  it("parse status porcelain", () => {
    const s = parseStatus("## main...origin/main [ahead 2, behind 1]\0 M src/a.ts\0A  new.rs\0?? notes.md\0R  b.rs\0old.rs\0UU conflict.txt\0");
    expect(s.branch).toBe("main");
    expect(s.upstream).toBe("origin/main");
    expect([s.ahead, s.behind]).toEqual([2, 1]);
    expect(s.files.length).toBe(5);
    expect(s.files[0].unstaged && !s.files[0].staged).toBe(true);
    expect(s.files[1].staged && !s.files[1].unstaged).toBe(true);
    expect(s.files[2].untracked).toBe(true);
    expect(s.files[3].orig_path).toBe("old.rs");
    expect(s.files[4].conflicted).toBe(true);
    expect(parseStatus("## No commits yet on main\0?? a\0").branch).toBe("main");
  });
  it("alur stage → commit", async () => {
    const d = tmp("git");
    await git(d, ["init", "-q"], "init");
    await git(d, ["config", "user.email", "t@t"], "cfg");
    await git(d, ["config", "user.name", "t"], "cfg");
    fs.writeFileSync(path.join(d, "a.txt"), "1");
    await git(d, ["add", "-A"], "add");
    let st = await gitStatus(d);
    expect(st.is_repo).toBe(true);
    expect(st.root).toBe(d);
    expect(st.files[0].staged).toBe(true);
    await git(d, ["commit", "-q", "-m", "x"], "commit");
    st = await gitStatus(d);
    expect(st.files).toEqual([]);
  });
});

describe("search & TODO", () => {
  const fixture = (name: string) => {
    const d = tmp(name);
    fs.mkdirSync(path.join(d, "src"));
    fs.mkdirSync(path.join(d, "node_modules/x"), { recursive: true });
    fs.mkdirSync(path.join(d, "build-out"));
    fs.writeFileSync(path.join(d, ".gitignore"), "build-out/\n*.log\n");
    fs.writeFileSync(path.join(d, "src/a.ts"), "const a = 1; // TODO: rapikan\nfoo(a)\n");
    fs.writeFileSync(path.join(d, "src/b.rs"), "fn foo() {}\n/* FIXME pindah ke modul */\n");
    fs.writeFileSync(path.join(d, "node_modules/x/i.js"), "foo TODO jangan muncul");
    fs.writeFileSync(path.join(d, "build-out/x.js"), "foo");
    fs.writeFileSync(path.join(d, "debug.log"), "foo");
    return d;
  };
  it("melewati folder berat & .gitignore", async () => {
    const d = fixture("walk");
    const files = (await walkFiles(d)).map((p) => path.relative(d, p)).sort();
    expect(files).toEqual([".gitignore", "src/a.ts", "src/b.rs"]);
  });
  it("menemukan kecocokan dengan posisi tepat", async () => {
    const d = fixture("search");
    const r = await searchProject(d, "foo", { isRegex: false, caseSensitive: true, wholeWord: true });
    expect(r.matches.length).toBe(2);
    const a = r.matches.find((m) => m.rel.endsWith("a.ts"))!;
    expect([a.line, a.col, a.len]).toEqual([2, 1, 3]);
    expect((await searchProject(d, "fn\\s+\\w+", { isRegex: true, caseSensitive: true, wholeWord: false, include: "*.rs" })).matches.length).toBe(1);
    expect(() => buildRegex("(", true, true, false)).toThrow();
  });
  it("TODO diparse", async () => {
    const d = fixture("todo");
    const t = await scanTodos(d);
    expect(t.length).toBe(2);
    expect(t.find((x) => x.tag === "FIXME")!.text).toBe("pindah ke modul");
    expect(t.find((x) => x.tag === "TODO")!.text).toBe("rapikan");
    expect(parseTodoLine("<!-- NOTE: catatan -->")).toEqual({ tag: "NOTE", text: "catatan" });
    expect(parseTodoLine("const todos = []")).toBeNull();
  });
});

describe("runner", () => {
  posix("nama berkas berbahaya di-quote", () => {
    const d = tmp("q");
    const f = path.join(d, "a $(touch x) 'b'.py");
    fs.writeFileSync(f, "print(1)");
    const t = commandForFile(f);
    expect(t.command).toMatch(/^(py -3|python3?) '/);
    expect(t.command).toContain("'\\''b'\\''");
  });
  it("Rust memakai cargo, --bin untuk src/bin", () => {
    const d = tmp("rs");
    fs.mkdirSync(path.join(d, "src/bin"), { recursive: true });
    fs.writeFileSync(path.join(d, "Cargo.toml"), "[package]");
    fs.writeFileSync(path.join(d, "src/main.rs"), "fn main(){}");
    fs.writeFileSync(path.join(d, "src/bin/alat.rs"), "fn main(){}");
    expect(commandForFile(path.join(d, "src/main.rs"), d).command).toBe("cargo run");
    expect(commandForFile(path.join(d, "src/bin/alat.rs"), d).command).toBe("cargo run --bin alat");
    expect(() => commandForFile(path.join(d, "Cargo.toml"))).toThrow();
  });
  it("deteksi npm (pnpm), make, cargo", () => {
    const d = tmp("det");
    fs.writeFileSync(path.join(d, "package.json"), '{"scripts":{"test":"vitest","dev":"vite","lint":"eslint ."}}');
    fs.writeFileSync(path.join(d, "pnpm-lock.yaml"), "");
    fs.writeFileSync(path.join(d, "Makefile"), "build:\n\tcc x.c\nVAR := 1\nclean: build\n");
    fs.writeFileSync(path.join(d, "Cargo.toml"), "");
    const t = detectTargets(d);
    expect(t[0].label).toBe("pnpm dev");
    expect(t[0].command).toBe("pnpm run dev");
    expect(t.some((x) => x.command === "make build")).toBe(true);
    expect(t.some((x) => x.command === "make clean")).toBe(true);
    expect(t.some((x) => x.command.includes("VAR"))).toBe(false);
    expect(t.some((x) => x.command === "cargo test")).toBe(true);
  });
});

describe("system, watcher, preview, store", () => {
  it("pmset & lsof", () => {
    const b = parsePmset("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t76%; discharging; 4:12 remaining");
    expect([b.on_battery, b.percent, b.charging]).toEqual([true, 76, false]);
    const a = parsePmset("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t90%; charging; 0:40 remaining");
    expect([a.on_battery, a.charging]).toEqual([false, true]);
    const p = parseLsof("p501\ncnode\nn*:3000\nn[::1]:3000\np777\ncphp\nn127.0.0.1:8000\n");
    expect(p.map((x) => [x.port, x.process])).toEqual([
      [3000, "node"],
      [8000, "php"],
    ]);
    expect(p[1].address).toBe("127.0.0.1");
  });
  it("klasifikasi event watcher", () => {
    expect(classify("/p/src/a.ts")).toEqual([false, false]);
    expect(classify("/p/node_modules/x/a.js")).toEqual([true, false]);
    expect(classify("/p/.git/index")).toEqual([true, true]);
    expect(classify("/p/.git/refs/heads/main")).toEqual([true, true]);
    expect(classify("/p/.git/objects/ab/cd")).toEqual([true, false]);
    expect(classify("/p/.a.ts.nozel-tmp-12")).toEqual([true, false]);
  });
  it("pratinjau hanya melayani folder project", () => {
    const d = tmp("prev");
    fs.writeFileSync(path.join(d, "index.html"), "<h1>hai</h1>");
    setRoot(null);
    expect(resolvePreview(path.join(d, "index.html")).status).toBe(403);
    setRoot(d);
    expect(resolvePreview(encodeURI(path.join(d, "index.html"))).status).toBe(200);
    expect(resolvePreview(d).status).toBe(200);
    expect(resolvePreview("/etc/passwd").status).toBe(403);
    expect(resolvePreview(path.join(d, "..", "x")).status).toBe(403);
    setOverride(path.join(d, "index.html"), "<h1>baru</h1>");
    expect(String(resolvePreview(path.join(d, "index.html")).body)).toBe("<h1>baru</h1>");
  });
  it("kunci store dibatasi", () => {
    expect(validKey("settings")).toBe(true);
    expect(validKey("session_v2")).toBe(true);
    expect(validKey("../x")).toBe(false);
    expect(validKey("A")).toBe(false);
  });
});

describe("lsp framing", async () => {
  const { frame, parseFrames } = await import("./lsp");
  it("membingkai & memecah pesan, termasuk potongan dan unicode", () => {
    const a = frame('{"id":1,"result":"✓ pinguin"}');
    const b = frame('{"id":2}');
    const all = Buffer.from(a + b);
    const first = parseFrames(all.subarray(0, all.length - 3));
    expect(first.messages).toEqual(['{"id":1,"result":"✓ pinguin"}']);
    const second = parseFrames(Buffer.concat([first.rest, all.subarray(all.length - 3)]));
    expect(second.messages).toEqual(['{"id":2}']);
    expect(second.rest.length).toBe(0);
  });
});

describe("extensions: aset ikon", () => {
  it("hanya svg/png di dalam folder ekstensi", async () => {
    const { extAsset } = await import("./extensions");
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), "nozel-ext-"));
    const dir = path.join(ud, "extensions", "a.icons", "icons");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ts.svg"), "<svg/>");
    fs.writeFileSync(path.join(ud, "secret.svg"), "<svg/>");
    const ctx = { userData: ud, emit: () => {}, trash: async () => {}, reveal: () => {} };
    expect(extAsset(ctx, "/a.icons/icons/ts.svg").status).toBe(200);
    expect(extAsset(ctx, "/a.icons/icons/ts.svg").mime).toBe("image/svg+xml");
    expect(extAsset(ctx, "/a.icons/../../secret.svg").status).toBe(403);
    expect(extAsset(ctx, "/a.icons/%2e%2e/%2e%2e/secret.svg").status).toBe(403);
    expect(extAsset(ctx, "/a.icons/nozel-manifest.json").status).toBe(403);
    expect(extAsset(ctx, "/a.icons/icons/none.svg").status).toBe(404);
  });
});

describe("system: port lintas OS", () => {
  it("netstat Windows (bahasa apa pun) dan ss Linux", async () => {
    const { parseNetstat, parseSs } = await import("./system");
    const ns = parseNetstat("  Proto  Alamat Lokal   Alamat Asing  Status\r\n  TCP    0.0.0.0:3000   0.0.0.0:0     ABHÖREN   4321\r\n  TCP    127.0.0.1:5000  127.0.0.1:62000  HERGESTELLT  99\r\n  TCP    [::]:8080      [::]:0        LISTENING  77\r\n");
    expect(ns.map((p) => [p.port, p.pid])).toEqual([[3000, 4321], [8080, 77]]);
    const ss = parseSs('LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=1234,fd=21))\nLISTEN 0 128 [::]:22 [::]:* users:(("sshd",pid=1,fd=4))\n');
    expect(ss).toEqual([
      { pid: 1, process: "sshd", port: 22, address: "::", command: "" },
      { pid: 1234, process: "node", port: 5173, address: "127.0.0.1", command: "" },
    ]);
  });
});
