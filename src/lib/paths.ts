// Helper path untuk renderer. Semua path dari main process memakai "/" (Windows: "C:/Users/x").
// Path Windows dibandingkan tanpa membedakan huruf besar/kecil.

import { tl } from "../i18n";

const isDrive = (p: string) => /^[A-Za-z]:\//.test(p);
const fold = (p: string, root: string) => (isDrive(root) ? p.toLowerCase() : p);

export function basename(p: string): string {
  const s = p.replace(/\/+$/, "");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

export function dirname(p: string): string {
  const s = p.replace(/\/+$/, "");
  const i = s.lastIndexOf("/");
  if (i <= 0) return "/";
  const d = s.slice(0, i);
  return /^[A-Za-z]:$/.test(d) ? d + "/" : d;
}

export function join(...parts: string[]): string {
  const joined = parts.filter(Boolean).join("/");
  // Path UNC/WSL (//server/share, //wsl.localhost/Ubuntu) mempertahankan // di depan.
  const unc = joined.startsWith("//");
  return (unc ? "/" : "") + joined.replace(/\/{2,}/g, "/");
}

/** Path dari agen bisa memakai \\ (Windows); samakan dengan bentuk UI ("C:/Users/x/a.ts"). */
export function uiPath(p: string): string {
  if (!/^([A-Za-z]:\\|\\\\)/.test(p)) return p;
  return p.replace(/\\/g, "/").replace(/^[a-z]:/, (d) => d.toUpperCase());
}

/** Rapikan segmen "." dan ".." (path gaya UI dengan "/"). */
export function normalizePath(p: string): string {
  const lead = p.match(/^([A-Za-z]:\/|\/\/|\/)/)?.[0] ?? "";
  const out: string[] = [];
  for (const seg of p.slice(lead.length).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return lead + out.join("/");
}

/** src gambar lokal di Markdown → path absolut gaya UI (belum dirapikan), relatif terhadap `base`. */
export function localImageSrc(src: string, base: string): string {
  let p = src.replace(/&amp;/g, "&").split(/[?#]/)[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    /* bukan URL-encoded yang sah: pakai apa adanya */
  }
  p = p.replace(/\\/g, "/");
  return p.startsWith("/") || /^[A-Za-z]:\//.test(p) ? p : join(base, p);
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i + 1).toLowerCase() : "";
}

export function relative(root: string, p: string): string {
  if (!root) return p;
  const r = root.replace(/\/+$/, "");
  if (fold(p, r) === fold(r, r)) return "";
  return fold(p, r).startsWith(fold(r, r) + "/") ? p.slice(r.length + 1) : p;
}

export function isInside(root: string, p: string): boolean {
  if (!root) return false;
  const r = root.replace(/\/+$/, "");
  return fold(p, r) === fold(r, r) || fold(p, r).startsWith(fold(r, r) + "/");
}

/** Validasi nama berkas/folder baru dari input pengguna. */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return tl("Nama tidak boleh kosong.");
  if (n === "." || n === "..") return tl("Nama tidak valid.");
  if (n.includes("/")) return tl("Nama tidak boleh berisi '/'. Buat folder dulu.");
  // Karakter & nama yang tidak sah di Windows: dicegah di semua OS supaya repo tetap bisa di-clone di mana saja.
  if (/[\\<>:"|?*]/.test(n)) return tl('Nama tidak boleh berisi \\ < > : " | ? *');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) return tl("Nama itu dicadangkan Windows.");
  if (/[. ]$/.test(n)) return tl("Nama tidak boleh diakhiri titik atau spasi.");
  if (n.includes("\0")) return tl("Nama tidak valid.");
  if (n.length > 255) return tl("Nama terlalu panjang.");
  return null;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif"]);
export function isImagePath(p: string): boolean {
  return IMAGE_EXT.has(extname(p));
}

export function shortenHome(p: string, home?: string): string {
  if (home && p.startsWith(home)) return "~" + p.slice(home.length);
  return p.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\/Users\/[^/]+)/i, "~");
}
