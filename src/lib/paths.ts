// Helper path POSIX (macOS). Tidak bergantung pada Node.

export function basename(p: string): string {
  const s = p.replace(/\/+$/, "");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

export function dirname(p: string): string {
  const s = p.replace(/\/+$/, "");
  const i = s.lastIndexOf("/");
  if (i <= 0) return "/";
  return s.slice(0, i);
}

export function join(...parts: string[]): string {
  const joined = parts.filter(Boolean).join("/");
  return joined.replace(/\/{2,}/g, "/");
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i + 1).toLowerCase() : "";
}

export function relative(root: string, p: string): string {
  if (!root) return p;
  const r = root.replace(/\/+$/, "");
  if (p === r) return "";
  return p.startsWith(r + "/") ? p.slice(r.length + 1) : p;
}

export function isInside(root: string, p: string): boolean {
  const r = root.replace(/\/+$/, "");
  return p === r || p.startsWith(r + "/");
}

/** Validasi nama berkas/folder baru dari input pengguna. */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return "Nama tidak boleh kosong.";
  if (n === "." || n === "..") return "Nama tidak valid.";
  if (n.includes("/")) return "Nama tidak boleh berisi '/'. Buat folder dulu.";
  if (n.includes("\0")) return "Nama tidak valid.";
  if (n.length > 255) return "Nama terlalu panjang.";
  return null;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif"]);
export function isImagePath(p: string): boolean {
  return IMAGE_EXT.has(extname(p));
}

export function shortenHome(p: string, home?: string): string {
  if (home && p.startsWith(home)) return "~" + p.slice(home.length);
  return p.replace(/^\/Users\/[^/]+/, "~");
}
