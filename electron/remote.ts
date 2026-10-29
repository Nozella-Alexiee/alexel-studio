// Remote SSH lite lewat OpenSSH sistem (`ssh`): memakai ~/.ssh/config, agent, kunci, known_hosts,
// dan ProxyJump milik pengguna. Operasi berkas = perintah shell POSIX di server lewat satu koneksi
// master (ControlMaster) yang dipakai ulang. Berkas dibuka sebagai salinan lokal di userData/remote
// dan diunggah kembali saat disimpan.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findExecutable, isWin, runCapture, type Ctx } from "./util";

export interface RemoteHost {
  /** Alias di ~/.ssh/config atau `user@host[:port]`. */
  target: string;
  hostname?: string;
  user?: string;
  port?: number;
  source: "config" | "saved";
}

export interface RemoteEntry {
  name: string;
  dir: boolean;
}

const MAX_FILE = 20 * 1024 * 1024;
/** Hanya untuk uji otomatis: config ssh terpisah supaya ~/.ssh milik pengguna tidak disentuh. */
const TEST_CONFIG = process.env.NOZEL_SSH_CONFIG || null;

/** Host dari ~/.ssh/config (tanpa pola wildcard). */
export function parseSshConfig(text: string): RemoteHost[] {
  const out: RemoteHost[] = [];
  let cur: RemoteHost[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^(\w+)\s*=?\s*(.+)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim().replace(/^"|"$/g, "");
    if (key === "host") {
      cur = val.split(/\s+/).filter((h) => !/[*?!]/.test(h)).map((h) => ({ target: h, source: "config" as const }));
      out.push(...cur);
    } else if (key === "match") cur = [];
    else if (key === "hostname") cur.forEach((h) => (h.hostname = val));
    else if (key === "user") cur.forEach((h) => (h.user = val));
    else if (key === "port") cur.forEach((h) => (h.port = Number(val) || undefined));
  }
  return out;
}

const savedFile = (ctx: Ctx) => path.join(ctx.userData, "remote-hosts.json");

export function listHosts(ctx: Ctx): RemoteHost[] {
  let config: RemoteHost[] = [];
  try {
    config = parseSshConfig(fs.readFileSync(TEST_CONFIG ?? path.join(os.homedir(), ".ssh", "config"), "utf8"));
  } catch {
    /* tidak ada config */
  }
  let saved: string[] = [];
  try {
    saved = JSON.parse(fs.readFileSync(savedFile(ctx), "utf8"));
  } catch {
    /* kosong */
  }
  return [...config, ...saved.filter((t) => validTarget(t) && !config.some((c) => c.target === t)).map((t) => ({ target: t, source: "saved" as const }))];
}

export function saveHost(ctx: Ctx, target: string, remove = false) {
  if (!validTarget(target)) throw new Error("Format: user@host atau user@host:port (atau alias dari ~/.ssh/config).");
  let saved: string[] = [];
  try {
    saved = JSON.parse(fs.readFileSync(savedFile(ctx), "utf8"));
  } catch {
    /* kosong */
  }
  saved = remove ? saved.filter((t) => t !== target) : [...new Set([...saved, target])];
  fs.mkdirSync(ctx.userData, { recursive: true });
  fs.writeFileSync(savedFile(ctx), JSON.stringify(saved));
}

/** Tidak boleh diawali "-" (dianggap opsi ssh) dan hanya karakter host/alias biasa. */
export const validTarget = (t: string) => /^(?!-)[\w.@%+-]+(:\d{1,5})?$/.test(t) && t.length < 200;

/** Kutip tunggal untuk shell POSIX di server. */
export const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function controlDir(): string | null {
  if (isWin) return null; // OpenSSH Windows tidak mendukung ControlMaster.
  // Path socket unix dibatasi ~104 karakter: pakai /tmp, folder pribadi 0700.
  const dir = path.join("/tmp", `alexel-ssh-${process.getuid?.() ?? "u"}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  return dir;
}

/** Opsi koneksi bersama: tanpa prompt (BatchMode) dan koneksi master yang dipakai ulang. */
export function sshOptions(target: string): string[] {
  const [host, port] = target.includes(":") ? [target.slice(0, target.lastIndexOf(":")), target.slice(target.lastIndexOf(":") + 1)] : [target, null];
  const ctl = controlDir();
  return [
    ...(TEST_CONFIG ? ["-F", TEST_CONFIG] : []),
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=30",
    ...(ctl ? ["-o", "ControlMaster=auto", "-o", `ControlPath=${ctl}/%C`, "-o", "ControlPersist=15m"] : []),
    ...(port ? ["-p", port] : []),
    host,
  ];
}

/** Perintah terminal interaktif (bisa minta password / konfirmasi host key) yang sekaligus membuka koneksi master. */
export function terminalCommand(target: string, dir?: string): string {
  if (!validTarget(target)) throw new Error("Host tidak valid.");
  const opts = sshOptions(target).filter((x, i, a) => x !== "BatchMode=yes" && !(x === "-o" && a[i + 1] === "BatchMode=yes"));
  const q = (s: string) => (/^[\w./:=%@+-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
  return ["ssh", "-t", ...opts.map(q), ...(dir ? [q(`cd ${sq(dir)} 2>/dev/null; exec "$SHELL" -l`)] : [])].join(" ");
}

async function ssh(target: string, cmd: string, opts: { input?: string; timeoutMs?: number } = {}): Promise<string> {
  if (!validTarget(target)) throw new Error("Host tidak valid.");
  const bin = findExecutable("ssh");
  if (!bin) throw new Error("Perintah ssh tidak ditemukan (pasang OpenSSH client).");
  const r = await runCapture(bin, [...sshOptions(target), "--", cmd], { input: opts.input, timeoutMs: opts.timeoutMs ?? 30_000 });
  if (r.timedOut) throw new Error("Server SSH tidak merespons (batas waktu).");
  if (!r.success) {
    const err = r.stderr.trim();
    if (r.code === 255) {
      if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(err)) throw new Error(`SSH_HOSTKEY:${err.split("\n").slice(-1)[0]}`);
      if (/Permission denied|publickey|password|passphrase|Too many authentication/i.test(err)) throw new Error(`SSH_AUTH:${err.split("\n").slice(-1)[0]}`);
      throw new Error(err.split("\n").slice(-2).join(" ") || "Koneksi SSH gagal.");
    }
    throw new Error(err || `Perintah gagal (kode ${r.code}).`);
  }
  return r.stdout;
}

export async function connect(target: string): Promise<{ home: string; system: string }> {
  const out = await ssh(target, 'printf "%s\\n" "$HOME"; uname -s 2>/dev/null || echo ?', { timeoutMs: 20_000 });
  const [home, system] = out.split("\n");
  return { home: home || "/", system: system || "?" };
}

export async function listDir(target: string, dir: string): Promise<RemoteEntry[]> {
  const out = await ssh(target, `cd -- ${sq(dir)} && LC_ALL=C ls -1Ap`);
  return out
    .split("\n")
    .filter((n) => n && n !== "./" && n !== "../")
    .map((n) => ({ name: n.replace(/\/$/, ""), dir: n.endsWith("/") }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

const mirrorRoot = (ctx: Ctx) => path.join(ctx.userData, "remote");
/** Salinan lokal: userData/remote/<target>/<path remote>. */
export function mirrorPath(ctx: Ctx, target: string, remote: string): string {
  const rel = path.posix.normalize(remote).replace(/^\/+/, "");
  if (rel.split("/").includes("..")) throw new Error("Path tidak valid.");
  return path.join(mirrorRoot(ctx), encodeURIComponent(target), ...rel.split("/"));
}

/** Kebalikan mirrorPath, atau null bila bukan salinan remote. */
export function fromMirror(ctx: Ctx, local: string): { target: string; remote: string } | null {
  const rel = path.relative(mirrorRoot(ctx), path.resolve(local));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const [t, ...rest] = rel.split(path.sep);
  const target = decodeURIComponent(t);
  return validTarget(target) && rest.length ? { target, remote: "/" + rest.join("/") } : null;
}

/** Unduh berkas teks ke salinan lokal; kembalikan path lokal untuk dibuka di editor. */
export async function openRemote(ctx: Ctx, target: string, remote: string): Promise<string> {
  const size = Number((await ssh(target, `wc -c < ${sq(remote)}`)).trim());
  if (size > MAX_FILE) throw new Error("Berkas lebih dari 20 MB.");
  const text = await ssh(target, `cat -- ${sq(remote)}`, { timeoutMs: 120_000 });
  if (text.includes("\u0000")) throw new Error("Berkas biner tidak bisa diedit lewat Remote SSH.");
  const local = mirrorPath(ctx, target, remote);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, text);
  return local;
}

/** Unggah salinan lokal ke server (dipanggil setelah berkas remote disimpan). */
export async function pushMirror(ctx: Ctx, local: string): Promise<{ target: string; remote: string } | null> {
  const m = fromMirror(ctx, local);
  if (!m) return null;
  const text = fs.readFileSync(local, "utf8");
  // Tulis ke berkas sementara lalu rename: berkas tidak pernah setengah tertulis.
  await ssh(m.target, `t=${sq(m.remote)}.alexel-tmp-$$ && cat > "$t" && { chmod --reference=${sq(m.remote)} "$t" 2>/dev/null || true; } && mv -f -- "$t" ${sq(m.remote)}`, { input: text, timeoutMs: 120_000 });
  return m;
}

export async function remoteOp(target: string, op: "mkdir" | "touch" | "rm" | "mv", a: string, b?: string) {
  if (op === "mkdir") await ssh(target, `mkdir -p -- ${sq(a)}`);
  else if (op === "touch") await ssh(target, `[ -e ${sq(a)} ] && { echo exists >&2; exit 3; }; : > ${sq(a)}`);
  else if (op === "rm") {
    // Pengaman: tidak pernah menghapus "/", "/home", "~", atau path relatif.
    if (!a.startsWith("/") || path.posix.normalize(a).split("/").filter(Boolean).length < 2) throw new Error("Menolak menghapus folder tingkat atas.");
    await ssh(target, `rm -rf -- ${sq(a)}`);
  } else if (op === "mv" && b) await ssh(target, `mv -- ${sq(a)} ${sq(b)}`);
}

export function closeMaster(target: string) {
  const bin = findExecutable("ssh");
  if (!bin || isWin || !validTarget(target)) return;
  void runCapture(bin, [...sshOptions(target).slice(0, -1), "-O", "exit", sshOptions(target).slice(-1)[0]], { timeoutMs: 5000 }).catch(() => {});
}
