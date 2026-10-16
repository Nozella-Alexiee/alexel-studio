// Smart Run: perintah untuk berkas aktif + deteksi target dari package.json, Cargo.toml,
// Makefile, composer.json, go.mod, deno.json, docker compose. Dijalankan di terminal PTY.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findExecutable, psQuote, shellQuote } from "./util";

export type Platform = NodeJS.Platform;

/** Helper perintah per platform: dipisah dari `process.platform` supaya cabang PowerShell bisa dites di OS mana pun. */
function shellOps(platform: Platform) {
  const win = platform === "win32";
  return {
    win,
    /** Quote untuk shell terminal: PowerShell di Windows, POSIX di macOS/Linux. */
    sq: (s: string) => (win ? psQuote(s) : shellQuote(s)),
    /** Jalankan B hanya bila A berhasil; `&&` tidak ada di Windows PowerShell 5.1. */
    andThen: (a: string, b: string) => (win ? `${a}; if ($?) { ${b} }` : `${a} && ${b}`),
    /** Menjalankan program dari path (PowerShell butuh operator &). */
    exec: (p: string) => (win ? `& ${p}` : p),
  };
}

/** Program yang dibutuhkan tidak ada: pesan pasang per OS, ditampilkan sebelum perintah dijalankan. */
export interface MissingTool {
  tool: string;
  install: string;
}

const INSTALL: Record<string, Record<"win32" | "darwin" | "linux", string>> = {
  python: { win32: "winget install Python.Python.3.12", darwin: "brew install python", linux: "sudo apt install python3" },
  node: { win32: "winget install OpenJS.NodeJS.LTS", darwin: "brew install node", linux: "sudo apt install nodejs npm" },
  go: { win32: "winget install GoLang.Go", darwin: "brew install go", linux: "sudo apt install golang" },
  rust: { win32: "winget install Rustlang.Rustup", darwin: "brew install rustup && rustup-init", linux: "curl https://sh.rustup.rs -sSf | sh" },
  cc: { win32: "winget install LLVM.LLVM  (atau MSYS2: winget install MSYS2.MSYS2)", darwin: "xcode-select --install", linux: "sudo apt install build-essential" },
  java: { win32: "winget install EclipseAdoptium.Temurin.21.JDK", darwin: "brew install openjdk", linux: "sudo apt install default-jdk" },
  dotnet: { win32: "winget install Microsoft.DotNet.SDK.9", darwin: "brew install dotnet", linux: "sudo apt install dotnet-sdk-9.0" },
  php: { win32: "winget install PHP.PHP", darwin: "brew install php", linux: "sudo apt install php-cli" },
  ruby: { win32: "winget install RubyInstallerTeam.Ruby.3.3", darwin: "brew install ruby", linux: "sudo apt install ruby" },
  deno: { win32: "winget install DenoLand.Deno", darwin: "brew install deno", linux: "curl -fsSL https://deno.land/install.sh | sh" },
  bash: { win32: "winget install Git.Git  (Git Bash) atau aktifkan WSL", darwin: "(bash sudah ada di macOS)", linux: "sudo apt install bash" },
};
const installHint = (key: string, platform: Platform) => INSTALL[key]?.[platform === "win32" ? "win32" : platform === "darwin" ? "darwin" : "linux"] ?? "";

/** Python 3 yang dipakai Run: venv project, lalu `py -3` / python asli (bukan stub Microsoft Store) / python3. */
export function pythonFor(platform: Platform, root: string, has: (name: string) => string | null = (n) => findExecutable(n)): { cmd: string; missing?: MissingTool } {
  const ops = shellOps(platform);
  for (const v of [".venv", "venv", "env"]) {
    const bin = ops.win ? path.join(root, v, "Scripts", "python.exe") : path.join(root, v, "bin", "python");
    if (root && fs.existsSync(bin)) return { cmd: ops.exec(ops.sq(bin)) };
  }
  if (ops.win) {
    if (has("py")) return { cmd: "py -3" };
    // "python" di PATH sering hanya stub Microsoft Store (WindowsApps) yang membuka Store, bukan Python.
    const py = has("python");
    if (py && !/[\\/]WindowsApps[\\/]/i.test(py)) return { cmd: "python" };
    if (has("python3") && !/[\\/]WindowsApps[\\/]/i.test(has("python3") ?? "")) return { cmd: "python3" };
    return { cmd: "py -3", missing: { tool: "Python 3", install: installHint("python", platform) } };
  }
  if (has("python3")) return { cmd: "python3" };
  if (has("python")) return { cmd: "python" };
  return { cmd: "python3", missing: { tool: "Python 3", install: installHint("python", platform) } };
}

/** Kompiler C/C++: Windows mendahulukan gcc (MinGW/MSYS2) lalu clang; lainnya clang lalu gcc. */
export function compilerFor(platform: Platform, cxx: boolean, has: (name: string) => string | null = (n) => findExecutable(n)): { cmd: string; missing?: MissingTool } {
  const clang = cxx ? "clang++" : "clang";
  const gcc = cxx ? "g++" : "gcc";
  const order = platform === "win32" ? [gcc, clang] : [clang, gcc];
  for (const c of order) if (has(c)) return { cmd: c };
  return { cmd: order[0], missing: { tool: cxx ? "C++ compiler" : "C compiler", install: installHint("cc", platform) } };
}

export interface RunTarget {
  id: string;
  label: string;
  command: string;
  cwd: string;
  kind: string;
  detail: string;
  /** Program yang dibutuhkan belum terpasang (Run ditahan, pengguna diberi perintah pasang). */
  missing?: MissingTool;
}

let runSeq = 0;
/** Biner sementara untuk C/C++/Rust. Nama unik per Run: di Windows .exe yang masih berjalan terkunci. */
const tempBin = (stem: string, win: boolean) => path.join(os.tmpdir(), `nozel-run-${stem.replace(/[^A-Za-z0-9_]/g, "")}-${process.pid}-${++runSeq}${win ? ".exe" : ""}`);

/** Hapus biner sementara lama (sisa Run sebelumnya). */
export function cleanTempBins(maxAgeMs = 3600_000) {
  try {
    for (const n of fs.readdirSync(os.tmpdir())) {
      if (!n.startsWith("nozel-run-")) continue;
      const f = path.join(os.tmpdir(), n);
      try {
        if (Date.now() - fs.statSync(f).mtimeMs > maxAgeMs) fs.rmSync(f, { force: true });
      } catch {
        /* sedang dipakai */
      }
    }
  } catch {
    /* tmpdir tidak terbaca */
  }
}

/** Letak bash.exe milik Git for Windows (dari lokasi git.exe), bila terpasang. */
function gitBash(): string | null {
  const git = findExecutable("git");
  const cands = [git ? path.join(path.dirname(path.dirname(git)), "bin", "bash.exe") : "", "C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files (x86)\\Git\\bin\\bash.exe"];
  return cands.find((c) => c && fs.existsSync(c)) ?? null;
}

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
export function commandForFile(file: string, project?: string | null, platform: Platform = process.platform): RunTarget {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("Simpan berkas dulu sebelum dijalankan.");
  const ops = shellOps(platform);
  const { sq, andThen, exec } = ops;
  const ext = path.extname(file).slice(1).toLowerCase();
  const name = path.basename(file);
  const stem = path.basename(file, path.extname(file));
  const q = sq(file);
  const dir = path.dirname(file);
  const root = project || dir;
  let cwd = dir;
  let command: string;
  let missing: MissingTool | undefined;
  /** Program yang harus ada di PATH agar Run berhasil; kalau tidak, Run ditahan dengan petunjuk pasang. */
  const need = (bin: string, tool: string, key: string) => {
    if (!findExecutable(bin)) missing = { tool, install: installHint(key, platform) };
  };
  switch (ext) {
    case "py": {
      const py = pythonFor(platform, root);
      command = `${py.cmd} ${q}`;
      missing = py.missing;
      break;
    }
    case "js":
    case "mjs":
    case "cjs":
      command = `node ${q}`;
      need("node", "Node.js", "node");
      break;
    case "ts":
    case "mts":
    case "cts":
    case "tsx": {
      const deno = fs.existsSync(path.join(root, "deno.json")) || fs.existsSync(path.join(root, "deno.jsonc"));
      command = deno ? `deno run -A ${q}` : `npx tsx ${q}`;
      if (deno) need("deno", "Deno", "deno");
      else need("npx", "Node.js (npx)", "node");
      break;
    }
    case "php":
      command = `php ${q}`;
      need("php", "PHP", "php");
      break;
    case "rb":
      command = `ruby ${q}`;
      need("ruby", "Ruby", "ruby");
      break;
    case "go":
      command = `go run ${q}`;
      need("go", "Go", "go");
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
      need("java", "Java (JDK)", "java");
      break;
    case "kt":
    case "kts":
      command = `kotlinc -script ${q}`;
      break;
    case "dart":
      command = `dart run ${q}`;
      break;
    case "cs":
    case "csx":
      command = `dotnet run ${q}`;
      need("dotnet", ".NET SDK", "dotnet");
      break;
    case "ps1":
      // Windows PowerShell menjalankan skrip lewat operator &; ExecutionPolicy Bypass sudah diset di pty.ts.
      command = ops.win ? exec(q) : `pwsh -NoProfile -File ${q}`;
      break;
    case "bat":
    case "cmd":
      if (!ops.win) throw new Error(`Berkas .${ext} hanya bisa dijalankan di Windows.`);
      command = exec(q);
      break;
    case "sh":
    case "bash":
    case "zsh": {
      const shell = ext === "zsh" ? "zsh" : "bash";
      if (ops.win) {
        // `bash` di PATH Windows biasanya launcher WSL (atau tidak ada); pakai Git Bash bila terpasang.
        const gb = platform === process.platform ? gitBash() : null;
        if (gb) command = `${exec(sq(gb))} ${q}`;
        else {
          command = `bash ${q}`;
          if (platform === process.platform) missing = { tool: "Bash", install: installHint("bash", platform) };
        }
      } else command = `${shell} ${q}`;
      break;
    }
    case "rs": {
      const cargo = findUp(dir, "Cargo.toml", root);
      if (cargo) {
        cwd = cargo;
        const relToCargo = path.relative(cargo, file).split(path.sep).join("/");
        const bin = /^src\/bin\/([^/]+)\.rs$/.exec(relToCargo)?.[1] ?? /^src\/bin\/([^/]+)\/main\.rs$/.exec(relToCargo)?.[1];
        const example = /^examples\/([^/]+)\.rs$/.exec(relToCargo)?.[1];
        command = bin ? `cargo run --bin ${sq(bin)}` : example ? `cargo run --example ${sq(example)}` : "cargo run";
        need("cargo", "Rust (cargo)", "rust");
      } else {
        const b = sq(tempBin(stem, ops.win));
        command = andThen(`rustc --edition 2021 ${q} -o ${b}`, exec(b));
        need("rustc", "Rust (rustc)", "rust");
      }
      break;
    }
    case "c": {
      const b = sq(tempBin(stem, ops.win));
      const c = compilerFor(platform, false);
      command = andThen(`${c.cmd} -std=c17 -Wall ${q} -o ${b}`, exec(b));
      missing = c.missing;
      break;
    }
    case "cpp":
    case "cc":
    case "cxx": {
      const b = sq(tempBin(stem, ops.win));
      const c = compilerFor(platform, true);
      command = andThen(`${c.cmd} -std=c++20 -Wall ${q} -o ${b}`, exec(b));
      missing = c.missing;
      break;
    }
    case "html":
    case "htm":
    case "svg":
      command = ops.win ? `Start-Process ${q}` : platform === "darwin" ? `open ${q}` : `xdg-open ${q}`;
      break;
    default:
      if (name === "Makefile") command = "make";
      else if (name === "package.json") command = `${packageManager(dir)} run dev`;
      else throw new Error(`Belum ada runner untuk berkas .${ext}. Pakai Smart Run (palet perintah: "!") atau jalankan lewat terminal.`);
  }
  return { id: `file:${file}`, label: `Jalankan ${name}`, command, cwd, kind: "file", detail: name, ...(missing ? { missing } : {}) };
}

const target = (kind: string, label: string, command: string, cwd: string, detail: string): RunTarget => ({ id: `${kind}:${cwd}:${label}`, label, command, cwd, kind, detail });

function readJson(p: string): Record<string, unknown> | null {
  try {
    // File dari editor Windows sering berawalan BOM; JSON.parse menolaknya.
    return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

export function detectTargets(root: string, platform: Platform = process.platform): RunTarget[] {
  const { sq } = shellOps(platform);
  const python = () => pythonFor(platform, root).cmd;
  const out: RunTarget[] = [];
  const pkg = readJson(path.join(root, "package.json"));
  const scripts = pkg?.scripts as Record<string, string> | undefined;
  if (scripts && typeof scripts === "object") {
    const pm = packageManager(root);
    const rank = (n: string) => ({ dev: 0, start: 1, build: 2, test: 3 })[n as "dev"] ?? 9;
    for (const n of Object.keys(scripts).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) {
      const cmd = pm === "npm" ? (n === "start" || n === "test" ? `npm ${sq(n)}` : `npm run ${sq(n)}`) : `${pm} run ${sq(n)}`;
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
        out.push(target("make", `make ${m[1]}`, `make ${sq(m[1])}`, root, "Makefile"));
      }
    }
  } catch {
    /* tidak ada Makefile */
  }
  const composer = readJson(path.join(root, "composer.json"))?.scripts as Record<string, unknown> | undefined;
  if (composer) for (const n of Object.keys(composer)) out.push(target("composer", `composer ${n}`, `composer run-script ${sq(n)}`, root, "composer.json"));
  if (fs.existsSync(path.join(root, "artisan"))) out.push(target("php", "php artisan serve", "php artisan serve", root, "Laravel"));
  if (fs.existsSync(path.join(root, "manage.py"))) out.push(target("python", "django runserver", `${python()} manage.py runserver`, root, "manage.py"));
  for (const f of ["main.py", "app.py"]) if (fs.existsSync(path.join(root, f))) out.push(target("python", `python ${f}`, `${python()} ${f}`, root, f));
  if (fs.existsSync(path.join(root, "pyproject.toml")) && fs.existsSync(path.join(root, "tests"))) out.push(target("python", "pytest", `${python()} -m pytest`, root, "pyproject.toml"));
  if (fs.existsSync(path.join(root, "go.mod"))) {
    out.push(target("go", "go run .", "go run .", root, "go.mod"));
    out.push(target("go", "go test ./...", "go test ./...", root, "go.mod"));
  }
  for (const f of ["deno.json", "deno.jsonc"]) {
    const tasks = readJson(path.join(root, f))?.tasks as Record<string, unknown> | undefined;
    if (tasks) for (const n of Object.keys(tasks)) out.push(target("deno", `deno task ${n}`, `deno task ${sq(n)}`, root, f));
  }
  for (const f of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    if (fs.existsSync(path.join(root, f))) {
      out.push(target("docker", "docker compose up", "docker compose up", root, f));
      break;
    }
  }
  return out;
}
