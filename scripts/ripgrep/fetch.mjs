// Unduh ripgrep (pin SHA-256) ke vendor/ripgrep/<os>-<arch>/ untuk dibundel installer lewat extraResources.
// Pemakaian: node scripts/ripgrep/fetch.mjs [mac|win|linux|all]   (bawaan: OS mesin ini)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TARGETS, urlFor, VERSION } from "./targets.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const host = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";
const want = process.argv[2] ?? host;
const keys = Object.keys(TARGETS).filter((k) => want === "all" || k.startsWith(`${want}-`));
if (!keys.length) {
  console.error(`OS tidak dikenal: ${want}`);
  process.exit(1);
}

for (const key of keys) {
  const out = path.join(root, "vendor", "ripgrep", key);
  const exe = path.join(out, key.startsWith("win") ? "rg.exe" : "rg");
  const stamp = path.join(out, ".version");
  if (fs.existsSync(exe) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === VERSION) {
    console.log(`ripgrep ${key}: sudah ada`);
    continue;
  }
  const t = TARGETS[key];
  const res = await fetch(urlFor(t));
  if (!res.ok) throw new Error(`Unduh ripgrep ${key} gagal: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== t.sha256) throw new Error(`SHA-256 ripgrep ${key} tidak cocok (dapat ${got})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rg-"));
  try {
    const archive = path.join(tmp, t.asset);
    fs.writeFileSync(archive, buf);
    if (t.asset.endsWith(".zip")) {
      // .zip dibuka di Node: `tar` di Windows bisa milik Git Bash, yang membaca "C:" sebagai nama host.
      const { unzipSync } = await import("fflate");
      for (const [name, data] of Object.entries(unzipSync(new Uint8Array(buf)))) {
        if (name.endsWith("/") || name.split("/").includes("..")) continue;
        const dest = path.join(tmp, ...name.split("/"));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, data);
      }
    } else {
      // .tar.gz hanya untuk macOS/Linux (bsdtar / GNU tar).
      execFileSync("tar", ["-xzf", archive, "-C", tmp], { stdio: "inherit" });
    }
    const dir = fs.readdirSync(tmp).find((n) => n.startsWith("ripgrep-") && fs.statSync(path.join(tmp, n)).isDirectory());
    if (!dir) throw new Error("Isi arsip ripgrep tidak dikenal");
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const name = key.startsWith("win") ? "rg.exe" : "rg";
    fs.copyFileSync(path.join(tmp, dir, name), exe);
    if (!key.startsWith("win")) fs.chmodSync(exe, 0o755);
    for (const lic of ["LICENSE-MIT", "UNLICENSE", "COPYING"]) if (fs.existsSync(path.join(tmp, dir, lic))) fs.copyFileSync(path.join(tmp, dir, lic), path.join(out, lic));
    fs.writeFileSync(stamp, VERSION);
    console.log(`ripgrep ${key}: ${VERSION} terpasang`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
