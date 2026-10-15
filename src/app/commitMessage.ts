// Pesan commit buatan AI: diff (yang di-stage, atau semua perubahan) dikirim ke agen yang dipilih
// dalam mode baca saja; jawabannya dibersihkan lalu diisi ke kotak pesan commit.

import { tl, lang } from "../i18n";
import { stripFences } from "../lib/text";

export interface CommitContext {
  staged: boolean;
  files: string[];
  diff: string;
  truncated: boolean;
  recent: string[];
}

/** Gaya pesan commit project: Conventional Commits bila mayoritas commit terakhir memakainya. */
export function usesConventional(recent: string[]): boolean {
  const n = recent.filter((s) => /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\([^)]*\))?!?:\s/.test(s)).length;
  return recent.length > 0 && n * 2 >= recent.length;
}

/** Bahasa pesan commit: ikut commit sebelumnya bila jelas, kalau tidak bahasa antarmuka. */
export function commitLanguage(recent: string[], ui: "id" | "en" = lang): "id" | "en" {
  const text = recent.join(" ").toLowerCase();
  const id = (text.match(/\b(dan|untuk|yang|tambah|perbaiki|ubah|hapus|dengan|di|ke)\b/g) ?? []).length;
  const en = (text.match(/\b(and|for|the|add|fix|update|remove|with|to|in)\b/g) ?? []).length;
  if (id > en * 1.5 && id >= 2) return "id";
  if (en > id * 1.5 && en >= 2) return "en";
  return ui;
}

export function buildCommitPrompt(c: CommitContext, draft = ""): string {
  const language = commitLanguage(c.recent) === "id" ? "Indonesian" : "English";
  const style = usesConventional(c.recent)
    ? "Use the Conventional Commits format (type(scope): summary) like the recent commits."
    : "Match the style of the recent commits.";
  return [
    "Write a git commit message for the changes below.",
    `- Write it in ${language}. ${style}`,
    "- First line: at most 72 characters, imperative mood, no trailing period.",
    "- If the change is not trivial, add a blank line and 1-5 short bullet points explaining what changed and why.",
    "- Reply with the commit message only: no explanation, no quotes, no code fences, no trailers such as Co-Authored-By or Signed-off-by.",
    c.recent.length ? `\nRecent commit subjects (style reference):\n${c.recent.map((s) => `- ${s}`).join("\n")}` : "",
    draft.trim() ? `\nThe user's draft (keep its intent):\n${draft.trim()}` : "",
    `\n${c.staged ? "Staged changes" : "Uncommitted changes (nothing staged yet)"}${c.truncated ? " (diff truncated)" : ""}:\n${c.diff}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Bersihkan jawaban: buang blok kode, tanda kutip, label "Commit message:", spasi berlebih. */
export function cleanCommitMessage(text: string): string {
  let t = stripFences(text.trim()).trim();
  t = t.replace(/^(commit message|pesan commit)\s*:\s*/i, "");
  if (/^(["'`]).*\1$/s.test(t)) t = t.slice(1, -1).trim();
  // Trailer yang ditambahkan agen sendiri (Co-Authored-By, "Generated with …") dibuang.
  const lines = t
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => !/^(co-authored-by|signed-off-by):/i.test(l) && !/^(?:🤖\s*)?generated with/iu.test(l));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  // Rapatkan baris kosong berlebih; subjek tanpa titik di akhir.
  const out: string[] = [];
  for (const l of lines) if (l || out[out.length - 1] !== "") out.push(l);
  if (out[0]) out[0] = out[0].replace(/\.$/, "");
  return out.join("\n").trim();
}

export const noChangesMessage = () => tl("Belum ada perubahan untuk di-commit.");
