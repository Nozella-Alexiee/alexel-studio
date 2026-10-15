// Panel Output: log per saluran (Claude Code, Server bahasa, Git, Alexel Studio), seperti VS Code.

import { create } from "zustand";

export const CHANNELS = ["Alexel Studio", "Agen AI", "Server bahasa", "Git", "Debug"] as const;
export type Channel = (typeof CHANNELS)[number];

const MAX = 2000;

export const useOutput = create<{ lines: Record<string, string[]>; channel: Channel }>(() => ({ lines: {}, channel: "Alexel Studio" }));

/** Tambah baris ke saluran Output (dengan jam). */
export function logOutput(channel: Channel, text: string) {
  const t = new Date();
  const stamp = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
  const add = text.replace(/\s+$/, "").split("\n").map((l, i) => (i === 0 ? `[${stamp}] ${l}` : `           ${l}`));
  useOutput.setState((s) => {
    const cur = s.lines[channel] ?? [];
    const next = cur.length + add.length > MAX ? [...cur.slice(cur.length + add.length - MAX), ...add] : [...cur, ...add];
    return { lines: { ...s.lines, [channel]: next } };
  });
}

export function clearOutput(channel: Channel) {
  useOutput.setState((s) => ({ lines: { ...s.lines, [channel]: [] } }));
}
