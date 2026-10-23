// Server bahasa terkurasi yang bisa dipasang sekali klik. Daftar ini statis dan di-pin (versi +
// SHA-256 vsix dari Open VSX): tidak ada pemasangan dari URL bebas. Yang diekstrak hanya berkas
// server dari paket, lalu dijalankan sebagai proses anak oleh Node bawaan Electron
// (ELECTRON_RUN_AS_NODE) setelah pemakai mengonfirmasi. Kode ekstensi VS Code-nya (extension.js)
// tidak pernah diekstrak apalagi dijalankan.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import type { Ctx } from "./util";

export interface ManagedServer {
  id: string;
  name: string;
  /** Id bahasa (src/editor/languages.ts) yang dilayani. */
  langs: string[];
  vsix: { namespace: string; name: string; version: string; sha256: string };
  /** Awalan di dalam vsix yang diekstrak (relatif terhadap `extension/`). */
  extract: string[];
  /** Berkas utama server, relatif terhadap folder pemasangan. */
  entry: string;
  args: string[];
  /** `initializationOptions` untuk server ini, dihitung dari folder pemasangan. */
  init?: (dir: string) => unknown;
  /** Jawaban `workspace/configuration` per bagian (nama seksi → nilai). */
  settings?: Record<string, unknown>;
  /** Ekstensi Open VSX yang memakai server ini (untuk lencana di katalog). */
  extensionIds: string[];
}

export const MANAGED: ManagedServer[] = [
  {
    id: "yaml",
    name: "YAML (Red Hat)",
    langs: ["yaml", "yml"],
    vsix: { namespace: "redhat", name: "vscode-yaml", version: "2.1.2026102108", sha256: "cbc517239dda7998fe0f0a41132970cc5f38c25ee5ebbe284c45db26c6a854d9" },
    // Server + dua chunk webpack-nya + l10n; extension.js (klien VS Code) sengaja tidak ikut.
    extract: ["dist/languageserver.js", "dist/397.js", "dist/vendors-node_modules_node-fetch_lib_index_mjs.js", "dist/l10n/"],
    entry: "dist/languageserver.js",
    args: ["--stdio"],
    // Server mencari terjemahan di ../../l10n (struktur vsix); di sini ada di dist/l10n.
    init: (dir) => ({ l10nPath: path.join(dir, "dist", "l10n") }),
    settings: { yaml: { validate: true, completion: true, hover: true, format: { enable: true }, schemas: {}, schemaStore: { enable: false } }, redhat: { telemetry: { enabled: false } } },
    extensionIds: ["redhat.vscode-yaml"],
  },
  {
    id: "prisma",
    name: "Prisma",
    langs: ["prisma"],
    vsix: { namespace: "Prisma", name: "prisma", version: "31.13.0", sha256: "6ab57f90c40280df753740fd78e2655f3f767fc1dd2cc5b536a764c43f742eb9" },
    extract: ["dist/language-server/"],
    entry: "dist/language-server/bin.js",
    args: ["--stdio"],
    settings: { prisma: { enableDiagnostics: true, enableCodeLens: false, scriptRunner: "npx" } },
    extensionIds: ["Prisma.prisma"],
  },
  {
    id: "dockerfile",
    name: "Dockerfile",
    langs: ["dockerfile"],
    vsix: { namespace: "docker", name: "docker", version: "0.18.0", sha256: "6b95e564bee313160f873d473830a0bf0dbd2537fb0cdc9404541661efb87660" },
    extract: ["dist/dockerfile-language-server-nodejs/"],
    entry: "dist/dockerfile-language-server-nodejs/lib/server.js",
    args: ["--stdio"],
    extensionIds: ["docker.docker", "ms-azuretools.vscode-docker"],
  },
];

const MAX_VSIX = 60 * 1024 * 1024;
const MAX_FILES = 5000;
const MAX_BYTES = 150 * 1024 * 1024;
const API = "https://open-vsx.org/api";

const root = (ctx: Ctx) => path.join(ctx.userData, "servers");
export const managedById = (id: string) => MANAGED.find((s) => s.id === id);
const dirOf = (ctx: Ctx, s: ManagedServer) => path.join(root(ctx), `${s.id}-${s.vsix.version}`);

/** Folder pemasangan bila server terpasang dan lengkap (berkas utama ada), kalau tidak null. */
export function managedInstalled(ctx: Ctx, s: ManagedServer): { dir: string; entry: string } | null {
  const dir = dirOf(ctx, s);
  const entry = path.join(dir, s.entry);
  return fs.existsSync(path.join(dir, ".installed")) && fs.existsSync(entry) ? { dir, entry } : null;
}

/** Ekstrak hanya awalan yang diizinkan; path di luar folder tujuan ditolak. Mengembalikan jumlah berkas. */
export function extractServer(buf: Uint8Array, dir: string, prefixes: string[]): number {
  const want = prefixes.map((p) => `extension/${p}`);
  const files = unzipSync(buf, { filter: (f) => !f.name.endsWith("/") && want.some((p) => f.name.startsWith(p)) });
  const names = Object.keys(files);
  if (!names.length) throw new Error("Paket tidak berisi berkas server.");
  if (names.length > MAX_FILES) throw new Error("Paket server terlalu besar.");
  let total = 0;
  for (const name of names) {
    const rel = path.posix.normalize(name.slice("extension/".length));
    const out = path.join(dir, ...rel.split("/"));
    if (rel.startsWith("..") || path.isAbsolute(rel) || !out.startsWith(dir + path.sep)) throw new Error("Paket memuat path yang tidak aman.");
    if ((total += files[name].length) > MAX_BYTES) throw new Error("Paket server terlalu besar.");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, files[name]);
  }
  return names.length;
}

export async function managedInstall(ctx: Ctx, id: string): Promise<{ version: string }> {
  const s = managedById(id);
  if (!s) throw new Error("Server bahasa tidak dikenal.");
  const final = dirOf(ctx, s);
  if (managedInstalled(ctx, s)) return { version: s.vsix.version };
  const { namespace, name, version, sha256 } = s.vsix;
  const meta = (await (await fetch(`${API}/${namespace}/${name}/${version}`, { signal: AbortSignal.timeout(20_000) })).json()) as { files?: { download?: string } };
  const url = meta.files?.download;
  if (!url?.startsWith("https://open-vsx.org/")) throw new Error("Paket server tidak tersedia.");
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Gagal mengunduh server (${r.status}).`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > MAX_VSIX) throw new Error("Paket server terlalu besar.");
  // Pin: hanya biner persis yang sudah ditinjau yang dijalankan.
  if (createHash("sha256").update(buf).digest("hex") !== sha256) throw new Error("Checksum paket server tidak cocok dengan yang di-pin; dibatalkan.");
  fs.mkdirSync(root(ctx), { recursive: true });
  const tmp = path.join(root(ctx), `.tmp-${s.id}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    extractServer(buf, tmp, s.extract);
    if (!fs.existsSync(path.join(tmp, s.entry))) throw new Error("Berkas utama server tidak ditemukan di paket.");
    fs.writeFileSync(path.join(tmp, ".installed"), JSON.stringify({ version, sha256, at: Date.now() }));
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(tmp, final);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  return { version };
}

export function managedRemove(ctx: Ctx, id: string) {
  const s = managedById(id);
  if (!s) throw new Error("Server bahasa tidak dikenal.");
  // Semua versi server ini (termasuk sisa pemasangan lama).
  let names: string[] = [];
  try {
    names = fs.readdirSync(root(ctx));
  } catch {
    return;
  }
  for (const n of names) if (n === s.id || n.startsWith(`${s.id}-`) || n.startsWith(`.tmp-${s.id}-`)) fs.rmSync(path.join(root(ctx), n), { recursive: true, force: true });
}
