// Kecocokan ekstensi VS Code dengan Alexel Studio, dihitung dari package.json-nya sebelum diunduh.
// Alexel Studio hanya memakai kontribusi data (tema, tema ikon, snippet, grammar, konfigurasi
// bahasa); kode JavaScript ekstensi tidak dijalankan.

import { MANAGED } from "./managedServers";

export type CompatLevel = "full" | "partial" | "none";

export interface Compatibility {
  level: CompatLevel;
  /** Kontribusi data yang akan dipakai, mis. ["themes", "snippets"]. */
  data: string[];
  /** Ekstensi membawa kode (main/browser) yang tidak dijalankan. */
  code: boolean;
  /** Bagian yang sebenarnya dicari pemakai tetapi butuh kode ekstensi, mis. ["commands"]. */
  needs: string[];
  /** Pengganti bawaan Alexel Studio bila ada (kunci terjemahan tl()). */
  alt: string | null;
  /** Server bahasa terkurasi yang bisa dipasang sekali klik untuk ekstensi ini (id server). */
  server: string | null;
}

interface Pkg {
  main?: unknown;
  browser?: unknown;
  contributes?: Record<string, unknown>;
  extensionDependencies?: unknown;
}

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v && typeof v === "object" ? Object.keys(v).length > 0 : !!v);

/** Kontribusi yang berjalan tanpa kode. `languages` dihitung hanya bila membawa konfigurasi/grammar. */
export function dataContributions(pkg: Pkg): string[] {
  const c = pkg.contributes ?? {};
  const out: string[] = [];
  if (has(c.themes)) out.push("themes");
  if (has(c.iconThemes)) out.push("iconThemes");
  if (has(c.snippets)) out.push("snippets");
  if (has(c.grammars)) out.push("grammars");
  const langs = Array.isArray(c.languages) ? (c.languages as { configuration?: unknown }[]) : [];
  if (langs.some((l) => l?.configuration)) out.push("languageConfiguration");
  return out;
}

/** Kontribusi yang butuh kode ekstensi (tidak didukung). */
export function codeContributions(pkg: Pkg): string[] {
  const c = pkg.contributes ?? {};
  const out: string[] = [];
  for (const k of ["commands", "debuggers", "taskDefinitions", "customEditors", "views", "viewsContainers", "walkthroughs", "languageModelTools", "chatParticipants", "mcpServerDefinitionProviders"]) if (has(c[k])) out.push(k);
  return out;
}

/** Penjelasan pengganti bawaan untuk ekstensi yang paling sering dicari. Kunci = id kecil `ns.name`. */
const ALTERNATIVES: Record<string, string> = {
  "esbenp.prettier-vscode": "Format dokumen bawaan memakai Prettier (Shift+Alt+F).",
  "dbaeumer.vscode-eslint": "Masalah di editor datang dari server bahasa; ESLint belum didukung.",
  "eamodio.gitlens": "Panel Git bawaan: perubahan, riwayat, blame, dan tinjau per bagian.",
  "ritwickdey.liveserver": "Pratinjau HTML bawaan (tombol Pratinjau di editor).",
  "ms-vscode.live-server": "Pratinjau HTML bawaan (tombol Pratinjau di editor).",
  "github.copilot": "Panel Agen AI: Claude Code, Codex, Gemini, Antigravity, dan agen ACP.",
  "github.copilot-chat": "Panel Agen AI: Claude Code, Codex, Gemini, Antigravity, dan agen ACP.",
  "continue.continue": "Panel Agen AI: Claude Code, Codex, Gemini, Antigravity, dan agen ACP.",
  "saoudrizwan.claude-dev": "Panel Agen AI: Claude Code, Codex, Gemini, Antigravity, dan agen ACP.",
  "anthropic.claude-code": "Sudah ada di panel Agen AI (Ekstensi → Agen AI).",
  "openai.chatgpt": "Sudah ada di panel Agen AI (Ekstensi → Agen AI).",
  "ms-python.python": "Jalankan Python lewat tombol Run; server bahasa Python diatur di Pengaturan.",
  "ms-python.vscode-pylance": "Server bahasa Python diatur di Pengaturan → Server bahasa.",
  "ms-vscode-remote.remote-ssh": "Belum didukung; gunakan terminal terpadu untuk ssh.",
  "ms-azuretools.vscode-docker": "Dockerfile didukung lewat grammar; perintah Docker lewat terminal.",
  "streetsidesoftware.code-spell-checker": "Belum ada pemeriksa ejaan bawaan.",
  "usernamehw.errorlens": "Masalah ditampilkan sebaris dengan kodenya di editor.",
  "gruntfuggly.todo-tree": "Panel TODO bawaan di sidebar.",
  "alefragnani.bookmarks": "Belum didukung.",
};

/** Server bahasa terkurasi untuk ekstensi (id kecil `ns.name`). */
export const serverFor = (id: string): string | null => MANAGED.find((s) => s.extensionIds.some((e) => e.toLowerCase() === id.toLowerCase()))?.id ?? null;

export const alternativeFor = (id: string): string | null => ALTERNATIVES[id.toLowerCase()] ?? null;

export function classifyManifest(pkg: Pkg, id = ""): Compatibility {
  const data = dataContributions(pkg);
  const code = has(pkg.main) || has(pkg.browser);
  const needs = code ? codeContributions(pkg) : [];
  const alt = alternativeFor(id);
  // Ekstensi dengan data sekaligus kode: bagian datanya jalan, fitur kodenya tidak.
  const level: CompatLevel = data.length === 0 ? "none" : code ? "partial" : "full";
  return { level, data, code, needs, alt, server: serverFor(id) };
}
