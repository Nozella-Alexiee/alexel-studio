// Pasang agen AI seperti ekstensi: unduh paket VSIX resmi dari Open VSX untuk platform ini,
// cocokkan SHA-256 dari Open VSX, lalu ekstrak HANYA biner agen (mis. resources/native-binary/claude,
// bin/<os-arch>/codex). JavaScript ekstensinya tidak pernah diekstrak apalagi dijalankan.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import zlib from "node:zlib";
import { isWithin, type Ctx } from "../util";

const API = "https://open-vsx.org/api";

export interface AgentPackage {
  namespace: string;
  name: string;
  /** Awalan entri zip yang diambil (berkas atau folder), relatif terhadap "extension/". */
  pick: (target: string) => string[];
  /** Path biner utama relatif terhadap folder pasang. */
  binary: (target: string) => string;
}

const exe = (target: string) => (target.startsWith("win32") ? ".exe" : "");
const codexDir = (target: string) =>
  ({ "darwin-arm64": "macos-aarch64", "darwin-x64": "macos-x86_64", "linux-x64": "linux-x86_64", "linux-arm64": "linux-aarch64", "win32-x64": "windows-x86_64", "win32-arm64": "windows-aarch64" })[target] ?? target;

export const PACKAGES: Record<string, AgentPackage> = {
  claude: {
    namespace: "anthropic",
    name: "claude-code",
    pick: (t) => [`resources/native-binary/claude${exe(t)}`],
    binary: (t) => `resources/native-binary/claude${exe(t)}`,
  },
  codex: {
    namespace: "openai",
    name: "chatgpt",
    pick: (t) => [`bin/${codexDir(t)}/`],
    binary: (t) => `bin/${codexDir(t)}/codex${exe(t)}`,
  },
};

/** Target platform Open VSX untuk komputer ini. */
export function openVsxTarget(platform = process.platform, arch = process.arch): string {
  const a = arch === "arm64" ? "arm64" : "x64";
  return `${platform === "win32" ? "win32" : platform === "darwin" ? "darwin" : "linux"}-${a}`;
}

const agentRoot = (ctx: Ctx, agent: string) => path.join(ctx.userData, "agents", agent);

export interface InstalledAgent {
  version: string;
  target: string;
  binary: string;
  installedAt: number;
}

export function installedAgent(ctx: Ctx, agent: string): InstalledAgent | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(agentRoot(ctx, agent), "current.json"), "utf8")) as InstalledAgent;
    return fs.existsSync(m.binary) ? m : null;
  } catch {
    return null;
  }
}

// ---------------- Pembaca zip (akses acak, tanpa memuat seluruh berkas) ----------------

interface ZipEntry {
  name: string;
  method: number;
  csize: number;
  usize: number;
  offset: number;
  mode: number;
}

export function readZipEntries(fd: number, size: number): ZipEntry[] {
  const tailLen = Math.min(size, 70_000);
  const tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Paket rusak (bukan zip).");
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOff = tail.readUInt32LE(eocd + 16);
  if (cdOff === 0xffffffff) throw new Error("Paket zip64 belum didukung.");
  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOff);
  const out: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const method = cd.readUInt16LE(p + 10);
    const csize = cd.readUInt32LE(p + 20);
    const usize = cd.readUInt32LE(p + 24);
    const n = cd.readUInt16LE(p + 28);
    const e = cd.readUInt16LE(p + 30);
    const c = cd.readUInt16LE(p + 32);
    const attr = cd.readUInt32LE(p + 38);
    const offset = cd.readUInt32LE(p + 42);
    out.push({ name: cd.subarray(p + 46, p + 46 + n).toString("utf8"), method, csize, usize, offset, mode: (attr >>> 16) & 0o777 });
    p += 46 + n + e + c;
  }
  return out;
}

/** Nama entri arsip aman: relatif, tanpa `..`, tanpa huruf drive/`:` (pemisah / maupun \\). */
export function safeEntryName(n: string): boolean {
  if (!n || /^[\\/]/.test(n) || n.includes(":") || n.includes("\0")) return false;
  return !n.split(/[\\/]/).some((seg) => seg === "..");
}

/** Gabungkan folder tujuan + nama entri; tolak bila hasilnya keluar folder. */
export function safeJoin(dest: string, name: string): string {
  const out = path.join(dest, name);
  if (!isWithin(dest, out)) throw new Error("Paket berisi path tidak aman.");
  return out;
}

/** Versi dari registry dipakai sebagai nama folder: hanya karakter versi biasa. */
const VERSION_RE = /^[\w.+-]{1,64}$/;
export function checkVersion(v: unknown): string {
  if (typeof v !== "string" || !VERSION_RE.test(v) || v === "." || v === "..") throw new Error("Versi paket tidak valid.");
  return v;
}

/** Hapus folder tanpa melempar error (Windows: biner yang sedang berjalan tidak bisa dihapus). */
function rmQuiet(p: string) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* dicoba lagi saat pemasangan berikutnya */
  }
}

async function extractEntry(file: string, fd: number, e: ZipEntry, dest: string) {
  const lh = Buffer.alloc(30);
  fs.readSync(fd, lh, 0, 30, e.offset);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error("Paket rusak (header lokal).");
  const start = e.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Biner (tanpa ekstensi atau .exe) bisa dijalankan; berkas lain tidak.
  const executable = /\.exe$/i.test(dest) || !path.basename(dest).includes(".") || (e.mode & 0o111) !== 0;
  if (e.csize === 0) {
    if (e.usize !== 0) throw new Error("Paket rusak (ukuran entri).");
    fs.writeFileSync(dest, "", { mode: executable ? 0o755 : 0o644 });
    return;
  }
  const src = fs.createReadStream(file, { start, end: start + e.csize - 1 });
  const out = fs.createWriteStream(dest, { mode: executable ? 0o755 : 0o644 });
  if (e.method === 0) await pipeline(src, out);
  else if (e.method === 8) await pipeline(src, zlib.createInflateRaw(), out);
  else throw new Error(`Metode kompresi ${e.method} tidak didukung.`);
  if (fs.statSync(dest).size !== e.usize) throw new Error("Ukuran hasil ekstrak tidak cocok.");
}

/** Entri yang diambil: cocok persis, atau berada di dalam folder yang dipilih. Path aman saja. */
export function pickEntries(entries: { name: string }[], picks: string[]): string[] {
  return entries
    .map((e) => e.name)
    .filter((n) => n.startsWith("extension/") && !n.endsWith("/") && safeEntryName(n))
    .filter((n) => {
      const rel = n.slice("extension/".length);
      return picks.some((p) => (p.endsWith("/") ? rel.startsWith(p) : rel === p));
    });
}

// ---------------- Pasang / hapus ----------------

const busy = new Set<string>();

export async function installAgentPackage(ctx: Ctx, agent: string): Promise<InstalledAgent> {
  const pkg = PACKAGES[agent];
  if (!pkg) throw new Error("Agen ini tidak dipasang dari Open VSX.");
  if (busy.has(agent)) throw new Error("Pemasangan sedang berjalan.");
  busy.add(agent);
  const progress = (phase: string, pct?: number) => ctx.emit("agent-install-progress", { agent, phase, pct: pct ?? null });
  const root = agentRoot(ctx, agent);
  const tmp = path.join(root, `download-${Date.now()}.vsix`);
  try {
    const target = openVsxTarget();
    progress("Mencari paket…");
    const metaRes = await fetch(`${API}/${pkg.namespace}/${pkg.name}/${target}/latest`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (metaRes.status === 404) throw new Error(`Paket untuk ${target} tidak tersedia di Open VSX.`);
    if (!metaRes.ok) throw new Error(`Open VSX menjawab ${metaRes.status}.`);
    const meta = (await metaRes.json()) as { version: string; files: { download: string; sha256?: string } };
    if (!/^https:\/\/open-vsx\.org\//.test(meta.files.download)) throw new Error("Alamat unduhan tidak dikenal.");
    let expected: string | null = null;
    if (meta.files.sha256) {
      const h = await fetch(meta.files.sha256, { signal: AbortSignal.timeout(20_000) });
      if (h.ok) expected = (await h.text()).trim().split(/\s+/)[0].toLowerCase();
    }
    if (!expected || !/^[0-9a-f]{64}$/.test(expected)) throw new Error("Checksum paket tidak tersedia; pemasangan dibatalkan.");

    fs.mkdirSync(root, { recursive: true });
    const res = await fetch(meta.files.download, { signal: AbortSignal.timeout(15 * 60_000) });
    if (!res.ok || !res.body) throw new Error(`Unduhan gagal (${res.status}).`);
    const total = Number(res.headers.get("content-length")) || 0;
    const hash = createHash("sha256");
    let got = 0;
    let lastPct = -1;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        got += chunk.length;
        const pct = total ? Math.floor((got / total) * 100) : null;
        if (pct !== null && pct !== lastPct) {
          lastPct = pct;
          progress("Mengunduh…", pct);
        }
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body as never), counter, fs.createWriteStream(tmp));
    if (hash.digest("hex") !== expected) throw new Error("Checksum paket tidak cocok; berkas dibuang.");

    progress("Memasang…");
    // Folder baru setiap pemasangan: versi yang sama bisa sedang berjalan (Windows mengunci bineri).
    const dir = path.join(root, `${checkVersion(meta.version)}-${target}-${Date.now().toString(36)}`);
    const fd = fs.openSync(tmp, "r");
    try {
      const entries = readZipEntries(fd, fs.fstatSync(fd).size);
      const wanted = new Set(pickEntries(entries, pkg.pick(target)));
      if (!wanted.size) throw new Error("Biner agen tidak ditemukan di paket.");
      for (const e of entries) if (wanted.has(e.name)) await extractEntry(tmp, fd, e, safeJoin(dir, e.name.slice("extension/".length)));
    } finally {
      fs.closeSync(fd);
    }
    const binary = path.join(dir, pkg.binary(target));
    if (!fs.existsSync(binary)) throw new Error("Biner agen tidak ditemukan setelah ekstrak.");
    fs.chmodSync(binary, 0o755);
    const info: InstalledAgent = { version: meta.version, target, binary, installedAt: Date.now() };
    fs.writeFileSync(path.join(root, "current.json"), JSON.stringify(info, null, 2));
    // Versi lama dibersihkan.
    for (const d of fs.readdirSync(root)) if (d !== path.basename(dir) && d !== "current.json" && !d.startsWith("download-")) rmQuiet(path.join(root, d));
    progress("Selesai", 100);
    return info;
  } finally {
    fs.rmSync(tmp, { force: true });
    busy.delete(agent);
  }
}

export function removeAgentPackage(ctx: Ctx, agent: string) {
  if (!PACKAGES[agent]) throw new Error("Agen ini tidak dipasang dari Open VSX.");
  fs.rmSync(agentRoot(ctx, agent), { recursive: true, force: true });
}


// ---------------- Paket npm (Gemini CLI) ----------------

export interface NpmAgent {
  pkg: string;
  /** Berkas yang dijalankan dengan Node bawaan Electron, relatif terhadap folder paket. */
  entry: string;
}

export const NPM_PACKAGES: Record<string, NpmAgent> = {
  gemini: { pkg: "@google/gemini-cli", entry: "bundle/gemini.js" },
};

/** Baca arsip tar (sudah di-gunzip) dan tulis entri yang lolos filter. Path aman saja. */
export function extractTar(buf: Buffer, dest: string, keep: (name: string) => boolean): number {
  let p = 0;
  let n = 0;
  let longName: string | null = null;
  while (p + 512 <= buf.length) {
    const h = buf.subarray(p, p + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a: number, b: number) => h.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(345, 500);
    let name = longName ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
    longName = null;
    const body = buf.subarray(p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = body.toString("utf8").replace(/\0.*$/s, "");
      continue;
    }
    if (type === "x" || type === "g") {
      const m = /\d+ path=([^\n]+)\n/.exec(body.toString("utf8"));
      if (m) longName = m[1];
      continue;
    }
    if (type !== "0" && type !== "\0") continue; // hanya berkas biasa (tanpa symlink/hardlink)
    name = name.replace(/^\.\//, "");
    if (!safeEntryName(name) || !keep(name)) continue;
    const out = safeJoin(dest, name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, body);
    n++;
  }
  return n;
}

export async function installNpmAgent(ctx: Ctx, agent: string): Promise<InstalledAgent> {
  const def = NPM_PACKAGES[agent];
  if (!def) throw new Error("Agen ini tidak dipasang dari npm.");
  if (busy.has(agent)) throw new Error("Pemasangan sedang berjalan.");
  busy.add(agent);
  const progress = (phase: string, pct?: number) => ctx.emit("agent-install-progress", { agent, phase, pct: pct ?? null });
  const root = agentRoot(ctx, agent);
  try {
    progress("Mencari paket…");
    const metaRes = await fetch(`https://registry.npmjs.org/${def.pkg.replace("/", "%2F")}/latest`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!metaRes.ok) throw new Error(`Registry npm menjawab ${metaRes.status}.`);
    const meta = (await metaRes.json()) as { version: string; dist: { tarball: string; integrity?: string } };
    if (!/^https:\/\/registry\.npmjs\.org\//.test(meta.dist.tarball)) throw new Error("Alamat unduhan tidak dikenal.");
    const integrity = /^sha512-(.+)$/.exec(meta.dist.integrity ?? "")?.[1];
    if (!integrity) throw new Error("Checksum paket tidak tersedia; pemasangan dibatalkan.");
    const res = await fetch(meta.dist.tarball, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!res.ok || !res.body) throw new Error(`Unduhan gagal (${res.status}).`);
    const total = Number(res.headers.get("content-length")) || 0;
    const chunks: Buffer[] = [];
    let got = 0;
    let last = -1;
    for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(c));
      got += c.length;
      const pct = total ? Math.floor((got / total) * 100) : null;
      if (pct !== null && pct !== last) progress("Mengunduh…", (last = pct));
    }
    const tgz = Buffer.concat(chunks);
    if (createHash("sha512").update(tgz).digest("base64") !== integrity) throw new Error("Checksum paket tidak cocok; berkas dibuang.");
    progress("Memasang…");
    const dir = path.join(root, `${checkVersion(meta.version)}-${Date.now().toString(36)}`);
    const count = extractTar(zlib.gunzipSync(tgz), dir, (n) => n === "package/package.json" || n.startsWith("package/bundle/") || n === "package/LICENSE");
    const entry = path.join(dir, "package", def.entry);
    if (!count || !fs.existsSync(entry)) throw new Error("Berkas agen tidak ditemukan di paket.");
    const info: InstalledAgent = { version: meta.version, target: "node", binary: entry, installedAt: Date.now() };
    fs.writeFileSync(path.join(root, "current.json"), JSON.stringify(info, null, 2));
    for (const d of fs.readdirSync(root)) if (d !== path.basename(dir) && d !== "current.json") rmQuiet(path.join(root, d));
    progress("Selesai", 100);
    return info;
  } finally {
    busy.delete(agent);
  }
}

export function removeNpmAgent(ctx: Ctx, agent: string) {
  if (!NPM_PACKAGES[agent]) throw new Error("Agen ini tidak dipasang dari npm.");
  fs.rmSync(agentRoot(ctx, agent), { recursive: true, force: true });
}
