// Backend tiruan untuk mode pratinjau browser (npm run dev tanpa Tauri).
// Hanya dimuat saat import.meta.env.DEV dan bukan di dalam aplikasi Tauri.

import type { FileEntry, GitFile, RunTarget, SearchMatch, Snapshot, TodoItem } from "./types";

const ROOT = "/Users/demo/nozel-project";

const SEED: Record<string, string> = {
  "src/index.tsx": `import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDebounce } from "./hooks/useDebounce";

type EditorProps = { path: string; initial: string };

export function Editor({ path, initial }: EditorProps) {
  const [doc, setDoc] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const debounced = useDebounce(doc, 2000);

  // TODO: tampilkan indikator "menyimpan…"
  useEffect(() => {
    if (!dirty) return;
    invoke("write_file_text", { path, content: debounced });
    setDirty(false);
  }, [debounced]);

  return <Pane value={doc} onChange={setDoc} />;
}
`,
  "src/hooks/useDebounce.ts": `import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
`,
  "src-tauri/src/api.rs": `use std::fs;
use std::path::Path;

#[tauri::command]
pub fn write_file_text(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // FIXME: tulis atomik lewat berkas sementara
    fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}
`,
  "scripts/analyze.py": `import json
from pathlib import Path


def count_lines(root: str) -> dict:
    totals = {}
    for f in Path(root).rglob("*"):
        if f.suffix in (".ts", ".rs", ".py"):
            n = len(f.read_text().splitlines())
            totals[f.suffix] = totals.get(f.suffix, 0) + n
    return totals


if __name__ == "__main__":
    print(json.dumps(count_lines("."), indent=2))
`,
  "public/index.html": `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Halo Nozel</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="card">
    <h1>Halo dari Nozel Code</h1>
    <p>Edit berkas ini, pratinjau ikut berubah.</p>
  </main>
</body>
</html>
`,
  "public/style.css": `body {
  margin: 0;
  font-family: -apple-system, sans-serif;
  display: grid;
  place-items: center;
  min-height: 100vh;
  background: #f4f1ea;
}

.card {
  padding: 32px 40px;
  border-radius: 16px;
  background: white;
}
`,
  "README.md": `# Nozel Project

Contoh project untuk mencoba **Nozel Code** di browser.

- Tekan \`⌘P\` untuk membuka berkas
- Tekan \`⌘K\` untuk palette perintah
- Ganti desain di Pengaturan

| Fitur | Shortcut |
| --- | --- |
| Cari di project | ⌘⇧F |
| Terminal | ⌃\` |
`,
  "package.json": `{
  "name": "nozel-project",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run"
  }
}
`,
  "Cargo.toml": `[package]
name = "nozel-project"
version = "0.1.0"
edition = "2021"
`,
};

export function createMockBackend(emit: (event: string, payload: unknown) => void) {
  const files = new Map<string, string>();
  const head = new Map<string, string>();
  for (const [rel, c] of Object.entries(SEED)) {
    files.set(`${ROOT}/${rel}`, c);
    head.set(`${ROOT}/${rel}`, c);
  }
  // Satu berkas dimodifikasi dan satu berkas baru supaya panel Git ada isinya.
  files.set(`${ROOT}/src/index.tsx`, SEED["src/index.tsx"].replace("2000", "1500"));
  files.set(`${ROOT}/notes.md`, "# Catatan\n\n- NOTE: coba fitur time-travel\n");
  const dirs = new Set<string>();
  const mtimes = new Map<string, number>();
  const staged = new Set<string>();
  const history = new Map<string, { t: number; c: string }[]>();
  const commits = [
    { sha: "c2fb9e0a", short: "c2fb9e0", subject: "feat: minimap dan garis error", author: "Nozel", time_s: Date.now() / 1000 - 7200, refs: "HEAD -> main, origin/main" },
    { sha: "e7b0e8e1", short: "e7b0e8e", subject: "feat: highlight PHP 8", author: "Nozel", time_s: Date.now() / 1000 - 86400, refs: "" },
    { sha: "1175bf73", short: "1175bf7", subject: "feat: panel Git Bot", author: "Nozel", time_s: Date.now() / 1000 - 172800, refs: "" },
  ];
  const now = () => Date.now();
  const rebuildDirs = () => {
    dirs.clear();
    dirs.add(ROOT);
    for (const p of files.keys()) {
      let d = p.slice(0, p.lastIndexOf("/"));
      while (d.length >= ROOT.length) {
        dirs.add(d);
        d = d.slice(0, d.lastIndexOf("/"));
      }
    }
  };
  rebuildDirs();
  const extraDirs = new Set<string>();
  const rel = (p: string) => p.slice(ROOT.length + 1);
  const changed = () => emit("fs-changed", { root: ROOT, paths: [], git: true });

  const ptys = new Map<number, { cwd: string; line: string }>();
  let ptyNext = 1;
  const prompt = (id: number) => emit("pty-data", { id, data: "\r\n\x1b[32m~/nozel-project\x1b[0m \x1b[35mmain\x1b[0m ❯ " });

  const gitFiles = (): GitFile[] => {
    const out: GitFile[] = [];
    for (const [p, c] of files) {
      const h = head.get(p);
      if (h === c) continue;
      const isStaged = staged.has(p);
      const untracked = h === undefined;
      out.push({
        path: rel(p),
        xy: untracked ? (isStaged ? "A " : "??") : isStaged ? "M " : " M",
        staged: isStaged,
        unstaged: !isStaged,
        untracked: untracked && !isStaged,
        conflicted: false,
      });
    }
    for (const p of head.keys()) {
      if (!files.has(p)) out.push({ path: rel(p), xy: " D", staged: false, unstaged: true, untracked: false, conflicted: false });
    }
    return out;
  };

  const handlers: Record<string, (a: any) => unknown> = {
    list_dir: ({ dirPath }) => {
      const out: FileEntry[] = [];
      const seen = new Set<string>();
      for (const d of [...dirs, ...extraDirs]) {
        if (d !== dirPath && d.startsWith(dirPath + "/") && !d.slice(dirPath.length + 1).includes("/") && !seen.has(d)) {
          seen.add(d);
          out.push({ name: d.slice(dirPath.length + 1), path: d, is_dir: true, is_symlink: false });
        }
      }
      for (const [p, c] of files) {
        if (p.startsWith(dirPath + "/") && !p.slice(dirPath.length + 1).includes("/")) {
          const name = p.slice(dirPath.length + 1);
          out.push({ name, path: p, is_dir: false, is_symlink: false, size: c.length, extension: name.split(".").pop() });
        }
      }
      return out.sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name));
    },
    read_file_text: ({ path }) => {
      const c = files.get(path);
      if (c === undefined) throw new Error(`Berkas tidak ditemukan: ${path}`);
      return { content: c, mtime_ms: mtimes.get(path) ?? 1, eol: "lf" };
    },
    read_file_image: () => ({
      data_url:
        "data:image/svg+xml;base64," +
        btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" rx="16" fill="#7aa2f7"/><text x="160" y="110" font-size="28" text-anchor="middle" fill="#0e1016" font-family="sans-serif">Nozel</text></svg>`),
      size_bytes: 1200,
      format: "svg",
    }),
    write_file_text: ({ path, content }) => {
      files.set(path, content);
      const t = now();
      mtimes.set(path, t);
      const h = history.get(path) ?? [];
      if (h[h.length - 1]?.c !== content) h.push({ t, c: content });
      history.set(path, h.slice(-80));
      rebuildDirs();
      return t;
    },
    write_file_base64: () => undefined,
    file_mtime: ({ path }) => mtimes.get(path) ?? 1,
    create_file: ({ path }) => {
      if (files.has(path)) throw new Error("Sudah ada berkas dengan nama itu.");
      files.set(path, "");
      rebuildDirs();
      changed();
    },
    create_dir: ({ path }) => {
      extraDirs.add(path);
      changed();
    },
    delete_entry: ({ path }) => {
      for (const p of [...files.keys()]) if (p === path || p.startsWith(path + "/")) files.delete(p);
      extraDirs.delete(path);
      rebuildDirs();
      changed();
    },
    rename_entry: ({ oldPath, newPath }) => {
      for (const [p, c] of [...files]) {
        if (p === oldPath || p.startsWith(oldPath + "/")) {
          files.delete(p);
          files.set(newPath + p.slice(oldPath.length), c);
        }
      }
      rebuildDirs();
      changed();
    },
    duplicate_entry: ({ path }) => {
      const i = path.lastIndexOf(".");
      const np = i > path.lastIndexOf("/") ? `${path.slice(0, i)} copy${path.slice(i)}` : `${path} copy`;
      files.set(np, files.get(path) ?? "");
      rebuildDirs();
      changed();
      return np;
    },
    reveal_in_finder: () => undefined,
    history_list: ({ path }): Snapshot[] =>
      [...(history.get(path) ?? [])].reverse().map((s) => ({ id: String(s.t), time_ms: s.t, size: s.c.length, lines: s.c.split("\n").length })),
    history_read: ({ path, id }) => history.get(path)?.find((s) => String(s.t) === id)?.c ?? "",
    list_project_files: () => [...files.keys()].map(rel).sort(),
    search_project: ({ query, isRegex, caseSensitive, wholeWord }) => {
      if (!query) return { matches: [], files_searched: 0, truncated: false };
      let src = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (wholeWord) src = `\\b(?:${src})\\b`;
      const re = new RegExp(src, caseSensitive ? "g" : "gi");
      const matches: SearchMatch[] = [];
      for (const [p, c] of files) {
        c.split("\n").forEach((line, i) => {
          for (const m of line.matchAll(re)) {
            if (!m[0]) continue;
            matches.push({ path: p, rel: rel(p), line: i + 1, col: (m.index ?? 0) + 1, len: m[0].length, text: line });
          }
        });
      }
      return { matches, files_searched: files.size, truncated: false };
    },
    replace_in_files: ({ paths, query, replacement, isRegex, caseSensitive }) => {
      const re = new RegExp(isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
      let n = 0;
      for (const p of paths) {
        const c = files.get(p);
        if (!c) continue;
        n += [...c.matchAll(re)].length;
        files.set(p, c.replace(re, replacement));
      }
      changed();
      return n;
    },
    scan_todos: () => {
      const out: TodoItem[] = [];
      const re = /(?:^|[^A-Za-z0-9_])(TODO|FIXME|HACK|BUG|XXX|NOTE)\b[:\s(]*(.*)/;
      for (const [p, c] of files) {
        c.split("\n").forEach((line, i) => {
          const m = line.match(re);
          if (m) out.push({ path: p, rel: rel(p), line: i + 1, tag: m[1], text: m[2].replace(/\*\/|-->/g, "").trim() });
        });
      }
      return out;
    },
    project_overview: () => {
      const by = new Map<string, { files: number; bytes: number }>();
      let total = 0;
      for (const [p, c] of files) {
        const ext = p.includes(".") ? p.split(".").pop()! : "lainnya";
        const e = by.get(ext) ?? { files: 0, bytes: 0 };
        e.files++;
        e.bytes += c.length;
        by.set(ext, e);
        total += c.length;
      }
      return {
        name: "nozel-project",
        file_count: files.size,
        total_bytes: total,
        languages: [...by].map(([ext, v]) => ({ ext, ...v })).sort((a, b) => b.bytes - a.bytes),
        last_modified_ms: now() - 60_000,
        last_modified_file: "src/index.tsx",
        truncated: false,
      };
    },
    git_status: () => ({ is_repo: true, root: ROOT, branch: "main", upstream: "origin/main", ahead: 1, behind: 0, files: gitFiles() }),
    git_stage: ({ paths }) => {
      const list = paths.length ? paths.map((p: string) => `${ROOT}/${p}`) : gitFiles().map((f) => `${ROOT}/${f.path}`);
      list.forEach((p: string) => staged.add(p));
    },
    git_unstage: ({ paths }) => {
      if (!paths.length) staged.clear();
      paths.forEach((p: string) => staged.delete(`${ROOT}/${p}`));
    },
    git_discard: ({ paths, untracked }) => {
      paths.forEach((p: string) => {
        const h = head.get(`${ROOT}/${p}`);
        if (h !== undefined) files.set(`${ROOT}/${p}`, h);
      });
      untracked.forEach((p: string) => files.delete(`${ROOT}/${p}`));
      rebuildDirs();
      changed();
    },
    git_commit: ({ message }) => {
      if (!staged.size) throw new Error("Commit gagal: tidak ada perubahan yang di-stage.");
      for (const p of staged) head.set(p, files.get(p) ?? "");
      staged.clear();
      const sha = Math.random().toString(16).slice(2, 9);
      commits.unshift({ sha, short: sha, subject: message, author: "Kamu", time_s: Date.now() / 1000, refs: "HEAD -> main" });
      changed();
      return sha;
    },
    git_push: () => "To github.com:demo/nozel-project.git\n   c2fb9e0..a91c3d2  main -> main",
    git_pull: () => "Already up to date.",
    git_log: () => commits,
    git_branches: () => ({ current: "main", local: ["main", "fitur/tema"] }),
    git_checkout: () => undefined,
    git_init: () => undefined,
    git_head_content: ({ path }) => head.get(path) ?? null,
    git_diff_file: () => "",
    git_auto_commit_file: () => "Commit a91c3d2 (mode pratinjau)",
    pty_spawn: ({ command }) => {
      const id = ptyNext++;
      ptys.set(id, { cwd: ROOT, line: "" });
      setTimeout(() => {
        emit("pty-data", { id, data: "\x1b[2mMode pratinjau browser: terminal tiruan. Di aplikasi Nozel ini shell zsh sungguhan.\x1b[0m" });
        if (command) {
          emit("pty-data", { id, data: `\r\n\x1b[36m$ ${command}\x1b[0m\r\nVITE v8.0.16  ready in 312 ms\r\n➜  Local: http://localhost:1420/\r\n` });
          if (!/dev|serve|watch/.test(command)) {
            setTimeout(() => emit("pty-exit", { id, code: 0, elapsed_ms: 840 }), 600);
          }
        } else prompt(id);
      }, 50);
      return id;
    },
    pty_write: ({ id, data }) => {
      const s = ptys.get(id);
      if (!s) return;
      for (const ch of data as string) {
        if (ch === "\r") {
          const cmd = s.line.trim();
          s.line = "";
          let out = "";
          if (cmd === "ls") out = "README.md  Cargo.toml  package.json  public  scripts  src  src-tauri";
          else if (cmd === "pwd") out = s.cwd;
          else if (cmd.startsWith("echo ")) out = cmd.slice(5);
          else if (cmd === "clear") emit("pty-data", { id, data: "\x1b[2J\x1b[H" });
          else if (cmd) out = `zsh: perintah tiruan "${cmd}" selesai`;
          if (out) emit("pty-data", { id, data: "\r\n" + out });
          prompt(id);
        } else if (ch === "\x7f") {
          if (s.line) {
            s.line = s.line.slice(0, -1);
            emit("pty-data", { id, data: "\b \b" });
          }
        } else if (ch === "\x03") {
          s.line = "";
          emit("pty-data", { id, data: "^C" });
          prompt(id);
        } else if (ch >= " ") {
          s.line += ch;
          emit("pty-data", { id, data: ch });
        }
      }
    },
    pty_resize: () => undefined,
    pty_kill: ({ id }) => {
      ptys.delete(id);
      emit("pty-exit", { id, code: 130, elapsed_ms: 0 });
    },
    command_for_file: ({ filePath }): RunTarget => {
      const ext = filePath.split(".").pop();
      const map: Record<string, string> = { py: "python3", ts: "npx tsx", tsx: "npx tsx", js: "node", rs: "cargo run", php: "php", html: "open" };
      const bin = map[ext ?? ""];
      if (!bin) throw new Error(`Belum ada runner untuk berkas .${ext}.`);
      return { id: "file", label: "Jalankan", command: bin === "cargo run" ? bin : `${bin} '${filePath}'`, cwd: ROOT, kind: "file", detail: "" };
    },
    detect_run_targets: (): RunTarget[] => [
      { id: "npm:dev", label: "npm dev", command: "npm run dev", cwd: ROOT, kind: "npm", detail: "vite" },
      { id: "npm:build", label: "npm build", command: "npm run build", cwd: ROOT, kind: "npm", detail: "tsc && vite build" },
      { id: "npm:test", label: "npm test", command: "npm test", cwd: ROOT, kind: "npm", detail: "vitest run" },
      { id: "cargo:run", label: "cargo run", command: "cargo run", cwd: ROOT, kind: "cargo", detail: "Cargo.toml" },
      { id: "cargo:test", label: "cargo test", command: "cargo test", cwd: ROOT, kind: "cargo", detail: "Cargo.toml" },
    ],
    claude_detect: () => ({ installed: true, path: "/Users/demo/.local/bin/claude", version: "2.1.0 (Claude Code) — pratinjau", error: null }),
    claude_run: ({ runId, prompt }) => {
      const sid = "demo-session";
      const reply =
        "Ini jawaban tiruan dari mode pratinjau browser.\n\n" +
        `Kamu mengirim ${prompt.length} karakter. Di aplikasi Nozel, permintaan ini dijalankan oleh Claude Code CLI dengan langganan Pro/Max kamu.\n\n` +
        "```ts\nconst debounced = useDebounce(doc, 2000);\n```";
      const send = (o: unknown) => emit("claude-event", { run_id: runId, line: JSON.stringify(o) });
      setTimeout(() => send({ type: "system", subtype: "init", session_id: sid, model: "claude-opus-5-5" }), 100);
      setTimeout(() => send({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "src/index.tsx" } }] } }), 500);
      setTimeout(() => send({ type: "assistant", message: { content: [{ type: "text", text: reply }] } }), 1200);
      setTimeout(() => send({ type: "result", subtype: "success", session_id: sid, duration_ms: 1300, result: reply }), 1300);
      setTimeout(() => emit("claude-done", { run_id: runId, code: 0, stderr: "" }), 1350);
    },
    claude_cancel: ({ runId }) => emit("claude-done", { run_id: runId, code: 130, stderr: "dibatalkan" }),
    discover_projects: () => [
      { path: "/Users/demo/Projects/toko-online", name: "toko-online", kind: "Laravel", mtimeMs: Date.now() - 3600e3, git: true },
      { path: "/Users/demo/Projects/portofolio", name: "portofolio", kind: "Node", mtimeMs: Date.now() - 86400e3, git: true },
    ],
    system_footprint: () => ({ core_mb: 41.2 + Math.random() * 2, cpu_percent: Math.round(Math.random() * 30) / 10, uptime_s: 120 }),
    power_status: () => ({ on_battery: false, percent: 86, charging: true, low_power_mode: false }),
    list_ports: () => [
      { pid: 4123, process: "node", port: 1420, address: "127.0.0.1", command: "node node_modules/.bin/vite" },
      { pid: 5170, process: "php", port: 8000, address: "127.0.0.1", command: "php artisan serve" },
    ],
    kill_process: () => undefined,
    store_load: ({ key }) => localStorage.getItem(`nozel-demo:${key}`),
    store_save: ({ key, json }) => localStorage.setItem(`nozel-demo:${key}`, json),
    watch_project: () => undefined,
    unwatch_project: () => undefined,
    preview_set_root: () => undefined,
    preview_set_override: () => undefined,
  };
  return handlers;
}
