// Temukan folder project di komputer pengguna untuk halaman Welcome.
// Sengaja tidak menyentuh Desktop/Documents/Downloads: folder itu dilindungi macOS dan
// membacanya memunculkan dialog izin yang mengejutkan saat app baru dibuka.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isWithin } from "./util";

export interface FoundProject {
  path: string;
  name: string;
  kind: string;
  mtimeMs: number;
  git: boolean;
}

const BASES = ["Project-Alex", "Projects", "projects", "Developer", "dev", "code", "Code", "src", "Sites", "GitHub", "repos", "workspace", "Workspace"];

/** Penanda jenis project (urutan = prioritas label). */
const MARKERS: [string, string][] = [
  ["artisan", "Laravel"],
  ["Cargo.toml", "Rust"],
  ["go.mod", "Go"],
  ["pubspec.yaml", "Flutter"],
  ["composer.json", "PHP"],
  ["pyproject.toml", "Python"],
  ["requirements.txt", "Python"],
  ["package.json", "Node"],
  ["Gemfile", "Ruby"],
  ["pom.xml", "Java"],
  ["build.gradle", "Java"],
  ["CMakeLists.txt", "C/C++"],
  ["Makefile", "Make"],
  ["index.html", "Web"],
  ["index.php", "PHP"],
];

function inspect(dir: string): FoundProject | null {
  let names: Set<string>;
  try {
    names = new Set(fs.readdirSync(dir));
  } catch {
    return null;
  }
  const git = names.has(".git");
  const marker = MARKERS.find(([f]) => names.has(f));
  if (!git && !marker) return null;
  let mtimeMs = 0;
  try {
    // Waktu ubah terakhir: folder itu sendiri atau .git (berubah tiap commit/checkout).
    mtimeMs = Math.max(fs.statSync(dir).mtimeMs, git ? fs.statSync(path.join(dir, ".git")).mtimeMs : 0);
  } catch {
    /* abaikan */
  }
  return { path: dir, name: path.basename(dir), kind: marker?.[1] ?? "Git", mtimeMs, git };
}

/** Project di folder kerja umum + saudara folder project terakhir. Maks `limit`, terbaru dulu. */
export function discoverProjects(extraParents: string[] = [], limit = 60): FoundProject[] {
  const home = os.homedir();
  const parents = new Set<string>();
  for (const b of BASES) parents.add(path.join(home, b));
  for (const p of extraParents) if (p && path.isAbsolute(p) && isWithin(home, p)) parents.add(p);
  const seen = new Set<string>();
  const out: FoundProject[] = [];
  for (const parent of parents) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(parent, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
      const dir = path.join(parent, e.name);
      if (seen.has(dir)) continue;
      seen.add(dir);
      const p = inspect(dir);
      if (p) out.push(p);
      if (seen.size > 600) break;
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}
