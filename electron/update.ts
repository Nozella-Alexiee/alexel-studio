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

/** Pecah "v1.2.3-rc.1+build" menjadi inti [mayor, minor, patch] dan identifier prerelease. */
function parseSemver(v: string): { core: number[]; pre: string[] } {
  const s = v.trim().replace(/^v/i, "").split("+")[0];
  const dash = s.indexOf("-");
  const coreStr = dash < 0 ? s : s.slice(0, dash);
  const preStr = dash < 0 ? "" : s.slice(dash + 1);
  const core = coreStr.split(".").slice(0, 3).map((x) => parseInt(x, 10) || 0);
  while (core.length < 3) core.push(0);
  return { core, pre: preStr ? preStr.split(".") : [] };
}

/** Bandingkan dua versi menurut aturan presedensi semver 2.0: negatif bila a < b, 0 bila sama, positif bila a > b. */
export function compareSemver(a: string, b: string): number {
  const [x, y] = [parseSemver(a), parseSemver(b)];
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  // Versi tanpa prerelease lebih tinggi daripada prerelease-nya (1.0.0-rc.2 < 1.0.0).
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) - (y.pre.length ? -1 : 0);
  const num = /^\d+$/;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]];
    if (p === undefined) return -1; // identifier lebih sedikit = lebih rendah (rc < rc.1)
    if (q === undefined) return 1;
    if (p === q) continue;
    const [pn, qn] = [num.test(p), num.test(q)];
    if (pn && qn) return Number(p) - Number(q); // numerik dibandingkan secara numerik (rc.10 > rc.2)
    if (pn !== qn) return pn ? -1 : 1; // numerik lebih rendah daripada alfanumerik
    return p < q ? -1 : 1; // leksikal ASCII (beta < rc)
  }
  return 0;
}

/**
 * Apakah `latest` layak ditawarkan kepada pengguna `current` ("0.3.0" vs "v0.4.1").
 * Belum ada kanal prerelease: pengguna versi final tidak ditawari prerelease; pengguna prerelease
 * ditawari versi yang lebih baru, termasuk versi finalnya.
 */
export function newerThan(latest: string, current: string): boolean {
  if (parseSemver(latest).pre.length && !parseSemver(current).pre.length) return false;
  return compareSemver(latest, current) > 0;
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
