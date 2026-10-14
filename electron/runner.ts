// Smart Run: perintah untuk berkas aktif + deteksi target dari package.json, Cargo.toml,
// Makefile, composer.json, go.mod, deno.json, docker compose. Dijalankan di terminal PTY.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shellQuote } from "./util";

export interface RunTarget {
  id: string;
  label: string;
  command: string;
  cwd: string;
  kind: string;
  detail: string;
}

const tempBin = (stem: string) => path.join(os.tmpdir(), `nozel-run-${stem.replace(/[^A-Za-z0-9_]/g, "")}-${process.pid}`);

function findUp(start: string, name: string, stop: string): string | null {
  let cur = start;
  for (;;) {
    if (fs.existsSync(path.join(cur, name))) return cur;
    if (cur === stop) return null;
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

export function packageManager(dir: string): "bun" | "pnpm" | "yarn" | "npm" {
  if (fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock"))) return "bun";
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

/** Perintah untuk menjalankan satu berkas. Semua path di-quote (aman dari injeksi lewat nama berkas). */
export function commandForFile(file: string, project?: string | null): RunTarget {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("Simpan berkas dulu sebelum dijalankan.");
  const ext = path.extname(file).slice(1).toLowerCase();
  const name = path.basename(file);
  const stem = path.basename(file, path.extname(file));
  const q = shellQuote(file);
  const dir = path.dirname(file);
  const root = project || dir;
  let cwd = dir;
  let command: string;
  switch (ext) {
    case "py":
      command = `python3 ${q}`;
      break;
    case "js":
    case "mjs":
    case "cjs":
      command = `node ${q}`;
      break;
    case "ts":
    case "mts":
    case "cts":
    case "tsx":
      command = fs.existsSync(path.join(root, "deno.json")) || fs.existsSync(path.join(root, "deno.jsonc")) ? `deno run -A ${q}` : `npx tsx ${q}`;
      break;
    case "php":
      command = `php ${q}`;
      break;
    case "rb":
      command = `ruby ${q}`;
      break;
    case "go":
      command = `go run ${q}`;
      break;
    case "lua":
      command = `lua ${q}`;
      break;
    case "pl":
      command = `perl ${q}`;
      break;
    case "swift":
      command = `swift ${q}`;
      break;
    case "java":
      command = `java ${q}`;
      break;
    case "kt":
    case "kts":
      command = `kotlinc -script ${q}`;
      break;
    case "dart":
      command = `dart run ${q}`;
      break;
    case "sh":
    case "bash":
      command = `bash ${q}`;
      break;
    case "zsh":
      command = `zsh ${q}`;
      break;
    case "rs": {
      const cargo = findUp(dir, "Cargo.toml", root);
      if (cargo) {
        cwd = cargo;
        const relToCargo = path.relative(cargo, file).split(path.sep).join("/");
        const bin = /^src\/bin\/([^/]+)\.rs$/.exec(relToCargo)?.[1] ?? /^src\/bin\/([^/]+)\/main\.rs$/.exec(relToCargo)?.[1];
        const example = /^examples\/([^/]+)\.rs$/.exec(relToCargo)?.[1];
        command = bin ? `cargo run --bin ${shellQuote(bin)}` : example ? `cargo run --example ${shellQuote(example)}` : "cargo run";
      } else {
        const b = shellQuote(tempBin(stem));
        command = `rustc --edition 2021 ${q} -o ${b} && ${b}`;
      }
      break;
    }
    case "c": {
      const b = shellQuote(tempBin(stem));
      command = `clang -std=c17 -Wall ${q} -o ${b} && ${b}`;
      break;
    }
    case "cpp":
    case "cc":
    case "cxx": {
      const b = shellQuote(tempBin(stem));
      command = `clang++ -std=c++20 -Wall ${q} -o ${b} && ${b}`;
      break;
    }
    case "html":
    case "htm":
    case "svg":
      command = process.platform === "win32" ? `start "" ${q}` : `open ${q}`;
      break;
    default:
      if (name === "Makefile") command = "make";
      else if (name === "package.json") command = `${packageManager(dir)} run dev`;
      else throw new Error(`Belum ada runner untuk berkas .${ext}. Pakai Smart Run di toolbar atau jalankan lewat terminal.`);
  }
  return { id: `file:${file}`, label: `Jalankan ${name}`, command, cwd, kind: "file", detail: name };
}

const target = (kind: string, label: string, command: string, cwd: string, detail: string): RunTarget => ({ id: `${kind}:${cwd}:${label}`, label, command, cwd, kind, detail });

function readJson(p: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function detectTargets(root: string): RunTarget[] {
  const out: RunTarget[] = [];
  const pkg = readJson(path.join(root, "package.json"));
  const scripts = pkg?.scripts as Record<string, string> | undefined;
  if (scripts && typeof scripts === "object") {
    const pm = packageManager(root);
    const rank = (n: string) => ({ dev: 0, start: 1, build: 2, test: 3 })[n as "dev"] ?? 9;
    for (const n of Object.keys(scripts).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) {
      const cmd = pm === "npm" ? (n === "start" || n === "test" ? `npm ${shellQuote(n)}` : `npm run ${shellQuote(n)}`) : `${pm} run ${shellQuote(n)}`;
      out.push(target("npm", `${pm} ${n}`, cmd, root, String(scripts[n] ?? "")));
    }
  }
  if (fs.existsSync(path.join(root, "Cargo.toml"))) {
    for (const c of ["cargo run", "cargo test", "cargo build --release", "cargo clippy"]) out.push(target("cargo", c, c, root, "Cargo.toml"));
  }
  try {
    const mk = fs.readFileSync(path.join(root, "Makefile"), "utf8");
    const seen = new Set<string>();
    for (const m of mk.matchAll(/^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?!=)/gm)) {
      if (!seen.has(m[1]) && seen.size < 20) {
        seen.add(m[1]);
        out.push(target("make", `make ${m[1]}`, `make ${shellQuote(m[1])}`, root, "Makefile"));
      }
    }
  } catch {
    /* tidak ada Makefile */
  }
  const composer = readJson(path.join(root, "composer.json"))?.scripts as Record<string, unknown> | undefined;
  if (composer) for (const n of Object.keys(composer)) out.push(target("composer", `composer ${n}`, `composer run-script ${shellQuote(n)}`, root, "composer.json"));
  if (fs.existsSync(path.join(root, "artisan"))) out.push(target("php", "php artisan serve", "php artisan serve", root, "Laravel"));
  if (fs.existsSync(path.join(root, "manage.py"))) out.push(target("python", "django runserver", "python3 manage.py runserver", root, "manage.py"));
  for (const f of ["main.py", "app.py"]) if (fs.existsSync(path.join(root, f))) out.push(target("python", `python ${f}`, `python3 ${f}`, root, f));
  if (fs.existsSync(path.join(root, "pyproject.toml")) && fs.existsSync(path.join(root, "tests"))) out.push(target("python", "pytest", "python3 -m pytest", root, "pyproject.toml"));
  if (fs.existsSync(path.join(root, "go.mod"))) {
    out.push(target("go", "go run .", "go run .", root, "go.mod"));
    out.push(target("go", "go test ./...", "go test ./...", root, "go.mod"));
  }
  for (const f of ["deno.json", "deno.jsonc"]) {
    const tasks = readJson(path.join(root, f))?.tasks as Record<string, unknown> | undefined;
    if (tasks) for (const n of Object.keys(tasks)) out.push(target("deno", `deno task ${n}`, `deno task ${shellQuote(n)}`, root, f));
  }
  for (const f of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    if (fs.existsSync(path.join(root, f))) {
      out.push(target("docker", "docker compose up", "docker compose up", root, f));
      break;
    }
  }
  return out;
}
