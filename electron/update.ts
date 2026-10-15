// Cek versi baru lewat GitHub Releases (tanpa telemetri: satu permintaan GET ke api.github.com,
// hanya saat pengguna memintanya atau sekali sehari bila diizinkan di Pengaturan).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/** "owner/repo" dari package.json (diisi workflow rilis), atau null. */
export function repoSlug(): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")) as { repository?: string | { url?: string } };
    const url = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? "";
    const m = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(url);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Bandingkan versi semver sederhana ("0.3.0" vs "v0.4.1"). */
export function newerThan(latest: string, current: string): boolean {
  const n = (v: string) => v.replace(/^v/, "").split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
  const [a, b] = [n(latest), n(current)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export async function checkUpdate(): Promise<{ repo: string | null; current: string; latest: string | null; url: string | null; newer: boolean }> {
  const current = app.getVersion();
  const repo = repoSlug();
  if (!repo) return { repo: null, current, latest: null, url: null, newer: false };
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Alexel-Studio" }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 404) return { repo, current, latest: null, url: `https://github.com/${repo}/releases`, newer: false };
  if (!r.ok) throw new Error(`GitHub menjawab ${r.status}.`);
  const j = (await r.json()) as { tag_name?: string; html_url?: string };
  const latest = j.tag_name ?? null;
  return { repo, current, latest, url: j.html_url ?? `https://github.com/${repo}/releases`, newer: !!latest && newerThan(latest, current) };
}
