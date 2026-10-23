// Bagian murni dari pembaruan dalam aplikasi: baca feed `latest*.yml` buatan electron-builder dan
// pilih berkas pemasang yang cocok dengan OS/arsitektur. Terpisah dari updater.ts supaya bisa diuji.

export interface FeedFile {
  url: string;
  sha512: string;
  size: number;
}

export interface Feed {
  version: string;
  files: FeedFile[];
}

/** Baca subset YAML yang dihasilkan electron-builder (version + daftar files url/sha512/size). */
export function parseFeed(text: string): Feed {
  const unquote = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, "$2");
  let version = "";
  const files: FeedFile[] = [];
  let inFiles = false;
  let cur: Partial<FeedFile> | null = null;
  const flush = () => {
    if (cur?.url && cur.sha512 && Number.isFinite(cur.size)) files.push(cur as FeedFile);
    cur = null;
  };
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      flush();
      inFiles = /^files:\s*$/.test(line);
      const v = /^version:\s*(.+)$/.exec(line);
      if (v) version = unquote(v[1]);
      continue;
    }
    if (!inFiles) continue;
    const m = /^\s*(-\s+)?(url|sha512|size):\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    if (m[1]) {
      flush();
      cur = {};
    }
    if (!cur) continue;
    if (m[2] === "size") cur.size = Number(unquote(m[3]));
    else cur[m[2] as "url" | "sha512"] = unquote(m[3]);
  }
  flush();
  return { version, files };
}

export type UpdateKind = "nsis" | "mac-zip" | "appimage";

export const feedName = (platform: NodeJS.Platform): string => (platform === "win32" ? "latest.yml" : platform === "darwin" ? "latest-mac.yml" : "latest-linux.yml");

/**
 * Berkas pemasang untuk pembaruan otomatis. Windows: pemasang NSIS; macOS: zip .app (dmg dipakai
 * pemasangan manual); Linux: hanya AppImage (deb/rpm dikelola paket manager, jadi manual).
 */
export function pickInstaller(feed: Feed, o: { platform: NodeJS.Platform; arch: string; appImage: boolean }): { file: FeedFile; kind: UpdateKind } | null {
  const find = (re: RegExp) => feed.files.find((f) => re.test(f.url));
  if (o.platform === "win32") {
    const file = find(new RegExp(`-win-${o.arch}\\.exe$`));
    return file ? { file, kind: "nsis" } : null;
  }
  if (o.platform === "darwin") {
    const file = find(new RegExp(`-mac-${o.arch}\\.zip$`));
    return file ? { file, kind: "mac-zip" } : null;
  }
  if (o.platform === "linux" && o.appImage && o.arch === "x64") {
    const file = find(/\.AppImage$/);
    return file ? { file, kind: "appimage" } : null;
  }
  return null;
}

/** Nama berkas aman dari URL feed (tanpa direktori), atau null. */
export const safeName = (url: string): string | null => (/^[\w.+-]+$/.test(url) && !url.includes("..") ? url : null);
