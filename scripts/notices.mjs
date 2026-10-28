// Buat THIRD_PARTY_NOTICES.md: lisensi paket yang ikut di aplikasi (dibundel atau disalin).
// Pemakaian: npm run notices
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
// Alat build & tes tidak ikut ke aplikasi.
const TOOLING = /^(@types\/|typescript$|vite$|vitest$|esbuild$|electron-builder$|@vitejs\/)/;
const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].filter((n) => !TOOLING.test(n)).sort();

const rows = [];
for (const name of names) {
  const dir = path.join(root, "node_modules", name);
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    continue;
  }
  const license = (typeof meta.license === "string" ? meta.license : meta.license?.type ?? (meta.licenses ?? []).map((l) => l.type).join(", ")) || "lihat paket";
  const repo = typeof meta.repository === "string" ? meta.repository : meta.repository?.url ?? meta.homepage ?? "";
  const url = repo.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\//, "https://").replace(/^github:/, "https://github.com/");
  rows.push(`| ${meta.name === name ? name : `${name} (${meta.name})`} | ${meta.version} | ${license} | ${url} |`);
}

// Biner yang dibundel dari luar npm (lihat scripts/ripgrep/targets.mjs).
const { VERSION: RG } = await import("./ripgrep/targets.mjs");
rows.push(`| ripgrep (binary) | ${RG} | MIT OR Unlicense | https://github.com/BurntSushi/ripgrep |`);

const out = `# Third-party notices

Alexel Studio includes the following open source packages. Their license texts are available in
each package's repository and in the \`node_modules\` folder of a source checkout.

Debug adapters and AI agents that Alexel Studio downloads on request (js-debug, Claude Code,
Codex, Gemini CLI) are distributed by their owners under their own licenses and are not part
of this package.

| Package | Version | License | Source |
|---|---|---|---|
${rows.join("\n")}
`;
fs.writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), out);
console.log(`THIRD_PARTY_NOTICES.md: ${rows.length} paket`);
