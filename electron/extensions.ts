// Ekstensi dari Open VSX — HANYA kontribusi data: tema warna, snippet, grammar TextMate,
// dan definisi bahasa. Kode JavaScript ekstensi tidak pernah diekstrak apalagi dijalankan.
// (Pengecualian terkurasi: server bahasa pilihan di managedServers.ts, di-pin SHA-256.)

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { classifyManifest, type Compatibility } from "./extCompat";
import type { Ctx } from "./util";

const API = "https://open-vsx.org/api";
const MAX_VSIX = 60 * 1024 * 1024;
const DATA_EXT = /\.(json|jsonc|tmLanguage|plist|tmTheme)$/i;
/** Gambar ikon berkas; hanya yang dirujuk tema ikon yang disalin. */
const ICON_EXT = /\.(svg|png)$/i;
const MAX_ICON_FILES = 5000;
const MAX_ICON_BYTES = 40 * 1024 * 1024;

export interface ExtSummary {
  id: string;
  namespace: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  downloads: number;
  icon: string | null;
  verified: boolean;
  rating: number | null;
  reviews: number;
  /** URL package.json versi ini, untuk pemeriksaan kecocokan sebelum diunduh. */
  manifestUrl: string | null;
}

export interface SearchOpts {
  query?: string;
  category?: string | null;
  sortBy?: "relevance" | "downloadCount" | "averageRating" | "timestamp";
  offset?: number;
  size?: number;
}

export interface SearchResult {
  items: ExtSummary[];
  total: number;
  offset: number;
}

export interface InstalledExt {
  id: string;
  namespace?: string;
  name?: string;
  displayName: string;
  version: string;
  description: string;
  themes: { label: string; uiTheme: string; path: string }[];
  iconThemes: { id: string; label: string; path: string }[];
  snippets: { language: string; path: string }[];
  grammars: { language?: string; scopeName: string; path: string; embeddedLanguages?: Record<string, string>; injectTo?: string[] }[];
  languages: { id: string; aliases?: string[]; extensions?: string[]; filenames?: string[]; configuration?: string }[];
  installedAt: number;
}

const extRoot = (ctx: Ctx) => path.join(ctx.userData, "extensions");
const validId = (id: string) => /^[A-Za-z0-9][\w.-]*$/.test(id) && !id.includes("..");

async function getJson(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Open VSX menjawab ${r.status}`);
  return r.json();
}

const SORTS = new Set(["relevance", "downloadCount", "averageRating", "timestamp"]);

/** package.json versi ini ada di samping vsix: `.../file/<nama>.vsix` → `.../file/package.json`. */
const manifestOf = (download: unknown): string | null => (typeof download === "string" && download.startsWith("https://") ? download.replace(/\/file\/[^/]+$/, "/file/package.json") : null);

export async function extSearch(opts: SearchOpts): Promise<SearchResult> {
  const u = new URL(`${API}/-/search`);
  u.searchParams.set("query", opts.query ?? "");
  u.searchParams.set("size", String(Math.min(Math.max(opts.size ?? 30, 1), 50)));
  u.searchParams.set("offset", String(Math.max(opts.offset ?? 0, 0)));
  const sort = opts.sortBy && SORTS.has(opts.sortBy) ? opts.sortBy : "relevance";
  u.searchParams.set("sortBy", sort);
  if (sort !== "relevance") u.searchParams.set("sortOrder", "desc");
  if (opts.category) u.searchParams.set("category", opts.category);
  const j = (await getJson(u.toString())) as { extensions?: Record<string, any>[]; totalSize?: number; offset?: number }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const items = (j.extensions ?? [])
    .filter((e) => !e.deprecated)
    .map((e) => ({
      id: `${e.namespace}.${e.name}`,
      namespace: e.namespace,
      name: e.name,
      version: e.version,
      displayName: e.displayName || e.name,
      description: e.description || "",
      downloads: e.downloadCount || 0,
      icon: e.files?.icon ?? null,
      verified: !!e.verified,
      rating: typeof e.averageRating === "number" ? e.averageRating : null,
      reviews: e.reviewCount || 0,
      manifestUrl: manifestOf(e.files?.download),
    }));
  return { items, total: j.totalSize ?? items.length, offset: j.offset ?? 0 };
}

const manifestCache = new Map<string, Compatibility>();

/** Cek kecocokan satu ekstensi dari package.json-nya saja (kecil), tanpa mengunduh vsix. */
export async function extInspect(namespace: string, name: string, manifestUrl: string): Promise<Compatibility> {
  if (!validId(namespace) || !validId(name)) throw new Error("Nama ekstensi tidak valid.");
  if (!manifestUrl.startsWith(`${API}/`)) throw new Error("URL manifest tidak valid.");
  const hit = manifestCache.get(manifestUrl);
  if (hit) return hit;
  const r = await fetch(manifestUrl, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Open VSX menjawab ${r.status}`);
  const text = await r.text();
  if (text.length > 2_000_000) throw new Error("Manifest terlalu besar.");
  const c = classifyManifest(JSON.parse(text), `${namespace}.${name}`);
  manifestCache.set(manifestUrl, c);
  if (manifestCache.size > 500) manifestCache.delete(manifestCache.keys().next().value as string);
  return c;
}

export interface ExtDetails {
  id: string;
  displayName: string;
  description: string;
  version: string;
  versions: string[];
  rating: number | null;
  reviews: number;
  downloads: number;
  verified: boolean;
  license: string | null;
  homepage: string | null;
  repository: string | null;
  categories: string[];
  tags: string[];
  publisher: string;
  readme: string;
  changelog: string;
  compat: Compatibility;
}

async function getText(url: string | undefined, max = 400_000): Promise<string> {
  if (!url?.startsWith("https://")) return "";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return "";
    return (await r.text()).slice(0, max);
  } catch {
    return "";
  }
}

/** Halaman detail: README, changelog, versi, rating, dan kecocokan. */
export async function extDetails(namespace: string, name: string): Promise<ExtDetails> {
  if (!validId(namespace) || !validId(name)) throw new Error("Nama ekstensi tidak valid.");
  const m = (await getJson(`${API}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [readme, changelog, manifest] = await Promise.all([getText(m.files?.readme), getText(m.files?.changelog), getText(m.files?.manifest, 2_000_000)]);
  let compat: Compatibility = { level: "none", data: [], code: false, needs: [], alt: null, server: null };
  try {
    compat = classifyManifest(JSON.parse(manifest), `${namespace}.${name}`);
  } catch {
    /* manifest tidak terbaca */
  }
  const versions = Object.keys(m.allVersions ?? {}).filter((v) => /^\d/.test(v));
  return {
    id: `${namespace}.${name}`,
    displayName: m.displayName || name,
    description: m.description || "",
    version: m.version,
    versions,
    rating: typeof m.averageRating === "number" ? m.averageRating : null,
    reviews: m.reviewCount || 0,
    downloads: m.downloadCount || 0,
    verified: !!m.verified,
    license: m.license ?? null,
    homepage: m.homepage ?? null,
    repository: m.repository ?? null,
    categories: Array.isArray(m.categories) ? m.categories : [],
    tags: Array.isArray(m.tags) ? m.tags.slice(0, 20) : [],
    publisher: m.namespaceDisplayName || namespace,
    readme,
    changelog,
    compat,
  };
}

/** Bandingkan versi semver sederhana: >0 bila a lebih baru dari b. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export interface ExtUpdate {
  id: string;
  installed: string;
  latest: string;
}

/** Ekstensi terpasang yang punya versi lebih baru di Open VSX. Gagal jaringan = dilewati. */
export async function extUpdates(ctx: Ctx): Promise<ExtUpdate[]> {
  const list = extList(ctx).filter((e) => e.namespace && e.name && e.namespace !== "vscode");
  const out: ExtUpdate[] = [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const e = list[i++];
      try {
        const m = (await getJson(`${API}/${encodeURIComponent(e.namespace!)}/${encodeURIComponent(e.name!)}`)) as { version?: string };
        if (m.version && cmpVersion(m.version, e.version) > 0) out.push({ id: e.id, installed: e.version, latest: m.version });
      } catch {
        /* lewati */
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

/** Normalisasi path di dalam vsix: "./themes/a.json" → "extension/themes/a.json". */
const inPkg = (p: string) => path.posix.join("extension", p.replace(/^\.\//, ""));

/** Pasang atomik: tulis ke folder sementara, baru gantikan versi lama setelah semuanya sukses. */
export async function extInstall(ctx: Ctx, namespace: string, name: string, version?: string | null): Promise<InstalledExt> {
  if (!validId(namespace) || !validId(name)) throw new Error("Nama ekstensi tidak valid.");
  const id = `${namespace}.${name}`;
  fs.mkdirSync(extRoot(ctx), { recursive: true });
  const tmp = path.join(extRoot(ctx), `.tmp-${id}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const m = await installInto(tmp, namespace, name, version);
    const finalDir = path.join(extRoot(ctx), id);
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.renameSync(tmp, finalDir);
    return m;
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

async function installInto(dir: string, namespace: string, name: string, version?: string | null): Promise<InstalledExt> {
  if (version && !/^[\w.+-]+$/.test(version)) throw new Error("Versi tidak valid.");
  const meta = (await getJson(`${API}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}${version ? `/${encodeURIComponent(version)}` : ""}`)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const url: string | undefined = meta.files?.download;
  if (!url?.startsWith("https://")) throw new Error("Berkas ekstensi tidak tersedia.");
  const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`Gagal mengunduh ekstensi (${r.status}).`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > MAX_VSIX) throw new Error("Ekstensi terlalu besar.");
  // Verifikasi checksum bila Open VSX menyediakannya.
  if (meta.files?.sha256) {
    const expect = String(await fetch(meta.files.sha256).then((x) => x.text())).trim().split(/\s+/)[0];
    const got = createHash("sha256").update(buf).digest("hex");
    if (expect && /^[0-9a-f]{64}$/i.test(expect) && expect.toLowerCase() !== got) throw new Error("Checksum ekstensi tidak cocok, pemasangan dibatalkan.");
  }
  const files = unzipSync(buf, { filter: (f) => f.name === "extension/package.json" || DATA_EXT.test(f.name) });
  const pkgRaw = files["extension/package.json"];
  if (!pkgRaw) throw new Error("Paket ekstensi tidak valid.");
  const pkg = JSON.parse(new TextDecoder().decode(pkgRaw));
  const c = pkg.contributes ?? {};
  const id = `${namespace}.${name}`;
  const copy = (rel: string, data: Uint8Array | undefined = files[inPkg(rel)]): string | null => {
    if (!data) return null;
    const out = path.join(dir, path.posix.normalize(rel.replace(/^\.\//, "")));
    if (!out.startsWith(dir + path.sep)) return null;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
    return path.relative(dir, out).split(path.sep).join("/");
  };

  // Tema bisa meng-"include" tema lain; salin semua berkas data supaya include tetap jalan.
  for (const k of Object.keys(files)) if (k.startsWith("extension/") && k !== "extension/package.json" && DATA_EXT.test(k)) copy(k.slice("extension/".length));

  const themes = (c.themes ?? []).filter((t: { path?: string }) => t.path && files[inPkg(t.path)]).map((t: { label?: string; uiTheme?: string; path: string; id?: string }) => ({ label: t.label || t.id || name, uiTheme: t.uiTheme || "vs-dark", path: t.path.replace(/^\.\//, "") }));
  // Tema ikon: salin gambar yang dirujuk iconDefinitions. Tema ikon berbasis font (fontCharacter)
  // belum didukung dan dilewati.
  const iconThemes: InstalledExt["iconThemes"] = [];
  const wantIcons = new Set<string>();
  for (const t of (c.iconThemes ?? []) as { id?: string; label?: string; path?: string }[]) {
    if (!t.path || !files[inPkg(t.path)]) continue;
    let json: { iconDefinitions?: Record<string, { iconPath?: string }> };
    try {
      json = JSON.parse(new TextDecoder().decode(files[inPkg(t.path)]));
    } catch {
      continue;
    }
    const base = path.posix.dirname(t.path.replace(/^\.\//, ""));
    let n = 0;
    for (const d of Object.values(json.iconDefinitions ?? {})) {
      if (typeof d?.iconPath !== "string" || !ICON_EXT.test(d.iconPath)) continue;
      const key = path.posix.normalize(path.posix.join("extension", base, d.iconPath));
      if (key.startsWith("extension/")) {
        wantIcons.add(key);
        n++;
      }
    }
    if (n) iconThemes.push({ id: t.id || t.label || name, label: t.label || t.id || name, path: t.path.replace(/^\.\//, "") });
  }
  if (wantIcons.size) {
    if (wantIcons.size > MAX_ICON_FILES) throw new Error("Tema ikon terlalu besar.");
    const imgs = unzipSync(buf, { filter: (f) => wantIcons.has(f.name) });
    let total = 0;
    for (const [k, data] of Object.entries(imgs)) {
      if ((total += data.length) > MAX_ICON_BYTES) throw new Error("Tema ikon terlalu besar.");
      copy(k.slice("extension/".length), data);
    }
  }
  const snippets = (c.snippets ?? []).filter((s: { path?: string }) => s.path && files[inPkg(s.path)]).map((s: { language: string; path: string }) => ({ language: s.language, path: s.path.replace(/^\.\//, "") }));
  const grammars = (c.grammars ?? []).filter((g: { path?: string; scopeName?: string }) => g.path && g.scopeName && files[inPkg(g.path)]).map((g: { language?: string; scopeName: string; path: string; embeddedLanguages?: Record<string, string>; injectTo?: string[] }) => ({ language: g.language, scopeName: g.scopeName, path: g.path.replace(/^\.\//, ""), embeddedLanguages: g.embeddedLanguages, injectTo: Array.isArray(g.injectTo) ? g.injectTo : undefined }));
  const languages = (c.languages ?? []).map((l: { id: string; aliases?: string[]; extensions?: string[]; filenames?: string[]; configuration?: string }) => ({
    id: l.id,
    aliases: l.aliases,
    extensions: l.extensions,
    filenames: l.filenames,
    configuration: typeof l.configuration === "string" && files[inPkg(l.configuration)] ? l.configuration.replace(/^\.\//, "") : undefined,
  }));
  if (!themes.length && !iconThemes.length && !snippets.length && !grammars.length && !languages.some((l: { configuration?: string }) => l.configuration)) {
    throw new Error("Ekstensi ini tidak berisi tema, tema ikon, snippet, grammar, atau konfigurasi bahasa. Alexel Studio tidak menjalankan kode ekstensi.");
  }
  const manifest: InstalledExt = { id, namespace, name, displayName: pkg.displayName || name, version: pkg.version || meta.version, description: pkg.description || "", themes, iconThemes, snippets, grammars, languages, installedAt: Date.now() };
  fs.writeFileSync(path.join(dir, "nozel-manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

export function extList(ctx: Ctx): InstalledExt[] {
  const root = extRoot(ctx);
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: InstalledExt[] = [];
  for (const n of names) {
    // Sisa pemasangan yang terputus.
    if (n.startsWith(".tmp-")) {
      fs.rmSync(path.join(root, n), { recursive: true, force: true });
      continue;
    }
    try {
      const m = JSON.parse(fs.readFileSync(path.join(root, n, "nozel-manifest.json"), "utf8")) as InstalledExt;
      m.iconThemes ??= []; // manifest lama (sebelum dukungan tema ikon)
      out.push(m);
    } catch {
      /* folder rusak */
    }
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function extRemove(ctx: Ctx, id: string) {
  if (!validId(id)) throw new Error("ID ekstensi tidak valid.");
  fs.rmSync(path.join(extRoot(ctx), id), { recursive: true, force: true });
}

/** Baca berkas data ekstensi (relatif terhadap folder ekstensi; tidak bisa keluar folder). */
export function extReadFile(ctx: Ctx, id: string, rel: string): string {
  if (!validId(id)) throw new Error("ID ekstensi tidak valid.");
  const dir = path.join(extRoot(ctx), id);
  const p = path.normalize(path.join(dir, rel));
  if (!p.startsWith(dir + path.sep)) throw new Error("Path di luar folder ekstensi.");
  return fs.readFileSync(p, "utf8");
}

const IMG_MIME: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png" };

/** Sajikan gambar ikon untuk protokol nozelext://icons/<id>/<path>. Hanya svg/png di folder ekstensi. */
export function extAsset(ctx: Ctx, urlPath: string): { status: number; body: Buffer | string; mime: string } {
  const parts = urlPath.replace(/^\/+/, "").split("/").map((x) => decodeURIComponent(x));
  const id = parts.shift() ?? "";
  const rel = parts.join("/");
  const mime = IMG_MIME[path.extname(rel).toLowerCase()];
  if (!validId(id) || !mime) return { status: 403, body: "Forbidden", mime: "text/plain" };
  const dir = path.join(extRoot(ctx), id);
  const p = path.normalize(path.join(dir, rel));
  if (!p.startsWith(dir + path.sep)) return { status: 403, body: "Forbidden", mime: "text/plain" };
  try {
    return { status: 200, body: fs.readFileSync(p), mime };
  } catch {
    return { status: 404, body: "Not found", mime: "text/plain" };
  }
}
