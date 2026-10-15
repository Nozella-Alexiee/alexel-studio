// Daftar agen AI yang bisa dipakai di panel "Agen AI". Setiap agen dipasang seperti ekstensi
// (lihat panel Ekstensi → Agen AI) dan berbicara lewat protokolnya sendiri:
// Claude Code (stream-json), Codex (app-server JSON-RPC), Gemini & agen lain (ACP).

import type { ClaudePermMode } from "../lib/types";

export type AgentId = "claude" | "codex" | "gemini" | "acp";

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
  { id: "default", label: "Tanya dulu", hint: "Agen meminta izin di panel sebelum mengedit berkas atau menjalankan perintah." },
  { id: "acceptEdits", label: "Edit otomatis", hint: "Edit berkas langsung diterapkan. Perintah shell tetap ditanyakan dulu." },
  { id: "plan", label: "Rencana", hint: "Agen hanya membaca dan menyusun rencana, tanpa mengubah apa pun." },
];

export const CODEX_MODES: AgentMode[] = [
  { id: "untrusted", label: "Tanya dulu", hint: "Codex meminta izin sebelum menjalankan perintah atau mengubah berkas." },
  { id: "on-request", label: "Otomatis di folder ini", hint: "Codex boleh mengedit dan menjalankan perintah di folder project; di luar itu tetap bertanya." },
  { id: "read-only", label: "Hanya baca", hint: "Codex hanya membaca dan menjawab, tanpa mengubah apa pun." },
];

export const AGENTS: AgentInfo[] = [
  {
    id: "claude",
    name: "Claude Code",
    short: "Claude",
    vendor: "Anthropic",
    openVsx: { namespace: "anthropic", name: "claude-code" },
    description: "Agen coding dari Anthropic. Masuk dengan akun Claude Pro atau Max.",
    caps: { models: true, effort: true, modes: CLAUDE_MODES, history: true, images: true },
  },
  {
    id: "codex",
    name: "Codex",
    short: "Codex",
    vendor: "OpenAI",
    openVsx: { namespace: "openai", name: "chatgpt" },
    description: "Agen coding dari OpenAI. Masuk dengan akun ChatGPT atau API key OpenAI.",
    caps: { models: true, effort: true, modes: CODEX_MODES, history: true, images: true },
  },
  {
    id: "gemini",
    name: "Gemini",
    short: "Gemini",
    vendor: "Google",
    description: "Agen coding dari Google (Gemini CLI). Masuk dengan akun Google.",
    caps: { models: true, effort: false, modes: [], history: false, images: true },
  },
  {
    id: "acp",
    name: "Agen ACP",
    short: "ACP",
    vendor: "Agent Client Protocol",
    description: "Agen lain yang mendukung Agent Client Protocol. Atur perintahnya di Pengaturan.",
    caps: { models: true, effort: false, modes: [], history: false, images: false },
  },
];

export const agentInfo = (id: string): AgentInfo => AGENTS.find((a) => a.id === id) ?? AGENTS[0];
