// Konteks @ di kotak pesan agen selain berkas: @problems, @terminal, @git-diff, @open-editors, @db.
// Mention tetap berupa teks di pesan; saat dikirim, isinya disusun sebagai bagian konteks.

import { tl } from "../i18n";
import { api } from "../lib/ipc";
import { relative } from "../lib/paths";
import { getState } from "../state/store";

export interface ContextMention {
  id: "problems" | "terminal" | "git-diff" | "open-editors" | "db";
  label: string;
  hint: string;
}

export const MENTIONS: ContextMention[] = [
  { id: "problems", label: "@problems", hint: tl("Error & peringatan di panel Masalah") },
  { id: "terminal", label: "@terminal", hint: tl("Output terakhir terminal aktif") },
  { id: "git-diff", label: "@git-diff", hint: tl("Perubahan yang belum di-commit") },
  { id: "open-editors", label: "@open-editors", hint: tl("Daftar berkas yang sedang terbuka") },
  { id: "db", label: "@db", hint: tl("Skema database yang tersambung (tanpa data & password)") },
];

const MENTION_RE = /(^|\s)@(problems|terminal|git-diff|open-editors|db)(?=$|[\s.,;:!?)])/g;

/** Mention konteks di pesan, urut & tanpa duplikat. */
export function parseMentions(prompt: string): ContextMention["id"][] {
  const out: ContextMention["id"][] = [];
  for (const m of prompt.matchAll(MENTION_RE)) if (!out.includes(m[2] as ContextMention["id"])) out.push(m[2] as ContextMention["id"]);
  return out;
}

const MAX_PROBLEMS = 100;
const MAX_PROBLEMS_CHARS = 8_000;
const MAX_TERMINAL_CHARS = 6_000;
const MAX_DIFF_CHARS = 40_000;

/** Daftar masalah sebagai teks ringkas `berkas:baris:kolom tingkat pesan (sumber)`. */
export function formatProblems(problems: Record<string, { line: number; col: number; message: string; severity: string; source?: string }[]>, root: string): string {
  const lines: string[] = [];
  const order = { error: 0, warning: 1, info: 2 } as Record<string, number>;
  const all = Object.entries(problems).flatMap(([p, list]) => list.map((x) => ({ p, ...x })));
  all.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  for (const x of all.slice(0, MAX_PROBLEMS)) lines.push(`${relative(root, x.p)}:${x.line}:${x.col} ${x.severity} ${x.message.replace(/\s+/g, " ")}${x.source ? ` (${x.source})` : ""}`);
  let text = lines.join("\n");
  if (text.length > MAX_PROBLEMS_CHARS) text = text.slice(0, MAX_PROBLEMS_CHARS) + "\n…";
  if (all.length > MAX_PROBLEMS) text += `\n… +${all.length - MAX_PROBLEMS}`;
  return text;
}

/** Isi tiap mention konteks. Mention tanpa isi (mis. tidak ada masalah) dilewati dengan catatan. */
export async function resolveMentions(prompt: string): Promise<{ label: string; body: string }[]> {
  const ids = parseMentions(prompt);
  if (!ids.length) return [];
  const s = getState();
  const root = s.root ?? "";
  const out: { label: string; body: string }[] = [];
  for (const id of ids) {
    if (id === "problems") {
      const text = formatProblems(s.problems, root);
      out.push({ label: tl("Masalah di project (@problems)"), body: text ? "```\n" + text + "\n```" : tl("(tidak ada masalah)") });
    } else if (id === "terminal") {
      const key = s.activeTerminal ?? s.terminals[s.terminals.length - 1]?.key;
      const { recentOutput } = await import("../terminal/terminals");
      const sess = s.terminals.find((t) => t.key === key);
      const text = key ? recentOutput(key, MAX_TERMINAL_CHARS) : "";
      out.push({ label: `${tl("Output terminal")}${sess?.command ? ` (${sess.command})` : ""} (@terminal)`, body: text ? "```\n" + text + "\n```" : tl("(terminal kosong)") });
    } else if (id === "git-diff") {
      const repo = s.git?.root || root;
      let body = tl("(bukan repo git)");
      if (repo && s.git?.is_repo) {
        const c = await api.gitCommitContext(repo).catch(() => null);
        const diff = c?.diff ? (c.diff.length > MAX_DIFF_CHARS ? c.diff.slice(0, MAX_DIFF_CHARS) + "\n…" : c.diff) : "";
        body = diff ? "```diff\n" + diff + "\n```" : tl("(tidak ada perubahan)");
      }
      out.push({ label: tl("Perubahan git yang belum di-commit (@git-diff)"), body });
    } else if (id === "db") {
      const { useDb } = await import("../db/state");
      const conns = useDb.getState().conns.filter((c) => c.connected);
      const parts: string[] = [];
      for (const c of conns.slice(0, 4)) {
        const text = await api.dbSchemaText(c.id, 8000).catch(() => "");
        if (text) parts.push(`### ${c.name} (${c.kind}${c.readOnly ? ", read-only" : ""})\n\`\`\`\n${text}\n\`\`\``);
      }
      out.push({ label: tl("Skema database (@db)"), body: parts.join("\n\n") || tl("(tidak ada database yang tersambung)") });
    } else {
      const tabs = Object.values(s.tabs).filter((t) => t.kind === "text");
      out.push({ label: tl("Berkas yang sedang terbuka (@open-editors)"), body: tabs.map((t) => `- ${relative(root, t.id)}${t.dirty ? ` ${tl("(belum disimpan)")}` : ""}`).join("\n") || tl("(tidak ada)") });
    }
  }
  return out;
}
