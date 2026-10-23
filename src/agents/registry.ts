// Daftar agen AI yang bisa dipakai di panel "Agen AI". Setiap agen dipasang seperti ekstensi
// (lihat panel Ekstensi → Agen AI) dan berbicara lewat protokolnya sendiri:
// Claude Code (stream-json), Codex (app-server JSON-RPC), Gemini & agen lain (ACP).

import type { ClaudePermMode } from "../lib/types";
import { tl } from "../i18n";

export type AgentId = "claude" | "codex" | "gemini" | "antigravity" | "acp";

export interface AgentMode {
  id: string;
  label: string;
  hint: string;
}

export interface AgentInfo {
  id: AgentId;
  /** Nama tampilan, mis. "Claude Code". */
  name: string;
  /** Nama pendek untuk status bar & tombol. */
  short: string;
  vendor: string;
  /** Ekstensi Open VSX asal biner agen (bila ada). */
  openVsx?: { namespace: string; name: string };
  description: string;
  caps: {
    models: boolean;
    effort: boolean;
    modes: AgentMode[];
    history: boolean;
    images: boolean;
  };
}

export const CLAUDE_MODES: { id: ClaudePermMode; label: string; hint: string }[] = [
  { id: "default", label: tl("Tanya dulu"), hint: tl("Agen meminta izin di panel sebelum mengedit berkas atau menjalankan perintah.") },
  { id: "acceptEdits", label: tl("Edit otomatis"), hint: tl("Edit berkas langsung diterapkan. Perintah shell tetap ditanyakan dulu.") },
  { id: "plan", label: tl("Rencana"), hint: tl("Agen hanya membaca dan menyusun rencana, tanpa mengubah apa pun.") },
  { id: "auto", label: tl("Otomatis"), hint: tl("Claude memutuskan sendiri mana yang aman dijalankan tanpa bertanya; yang berisiko tetap ditanyakan.") },
];

/** Hanya muncul bila pengguna menyalakannya di Pengaturan → Izinkan mode berbahaya. */
export const CLAUDE_BYPASS_MODE: { id: ClaudePermMode; label: string; hint: string } = {
  id: "bypassPermissions",
  label: tl("Lewati semua izin"),
  hint: tl("Semua edit dan perintah langsung dijalankan tanpa bertanya. Hanya untuk sandbox tanpa data penting."),
};

export const CODEX_MODES: AgentMode[] = [
  { id: "untrusted", label: tl("Tanya dulu"), hint: tl("Codex meminta izin sebelum menjalankan perintah atau mengubah berkas.") },
  { id: "on-request", label: tl("Otomatis di folder ini"), hint: tl("Codex boleh mengedit dan menjalankan perintah di folder project; di luar itu tetap bertanya.") },
  { id: "read-only", label: tl("Hanya baca"), hint: tl("Codex hanya membaca dan menjawab, tanpa mengubah apa pun.") },
];

export const ANTIGRAVITY_MODES: AgentMode[] = [
  { id: "accept-edits", label: tl("Edit otomatis"), hint: tl("Antigravity boleh mengedit berkas. Mode headless tidak bisa bertanya; aksi lain yang butuh izin ditolak.") },
  { id: "auto", label: tl("Otomatis"), hint: tl("Antigravity memutuskan sendiri aksi mana yang aman; yang butuh izin tetap ditolak di mode headless.") },
  { id: "plan", label: tl("Rencana"), hint: tl("Antigravity hanya membaca dan menyusun rencana.") },
  { id: "strict", label: tl("Ketat"), hint: tl("Semua aksi yang butuh izin ditolak otomatis.") },
];

export const AGENTS: AgentInfo[] = [
  {
    id: "claude",
    name: "Claude Code",
    short: "Claude",
    vendor: "Anthropic",
    openVsx: { namespace: "anthropic", name: "claude-code" },
    description: tl("Agen coding dari Anthropic. Masuk dengan akun Claude Pro atau Max."),
    caps: { models: true, effort: true, modes: CLAUDE_MODES, history: true, images: true },
  },
  {
    id: "codex",
    name: "Codex",
    short: "Codex",
    vendor: "OpenAI",
    openVsx: { namespace: "openai", name: "chatgpt" },
    description: tl("Agen coding dari OpenAI. Masuk dengan akun ChatGPT atau API key OpenAI."),
    caps: { models: true, effort: true, modes: CODEX_MODES, history: true, images: true },
  },
  {
    id: "gemini",
    name: "Gemini",
    short: "Gemini",
    vendor: "Google",
    description: tl("Agen coding dari Google (Gemini CLI). Masuk dengan akun Google atau API key Gemini."),
    caps: { models: true, effort: false, modes: [], history: false, images: true },
  },
  {
    id: "antigravity",
    name: "Antigravity",
    short: "Antigravity",
    vendor: "Google",
    description: tl("Agen dari Google Antigravity (CLI agy). Bisa memakai model Gemini, Claude, dan GPT-OSS."),
    caps: { models: true, effort: true, modes: ANTIGRAVITY_MODES, history: false, images: false },
  },
  {
    id: "acp",
    name: tl("Agen ACP"),
    short: "ACP",
    vendor: "Agent Client Protocol",
    description: tl("Agen lain yang mendukung Agent Client Protocol. Atur perintahnya di Pengaturan."),
    caps: { models: true, effort: false, modes: [], history: false, images: false },
  },
];

export const agentInfo = (id: string): AgentInfo => AGENTS.find((a) => a.id === id) ?? AGENTS[0];
