// Percakapan dengan Claude Code CLI. Setiap kiriman menampilkan dulu isi persis
// yang akan dikirim (consent gate) kecuali pengguna mematikannya di Pengaturan.

import * as docs from "../editor/documents";
import { api, errMsg, on } from "../lib/ipc";
import { basename, relative } from "../lib/paths";
import { activeTab, ask, getState, setLayout, setState, toast, type ChatMessage, type Problem } from "../state/store";

let listening = false;
let msgId = 0;
const nid = () => `m${Date.now()}-${++msgId}`;

function push(m: Omit<ChatMessage, "id" | "time">): string {
  const id = nid();
  setState((s) => ({ chat: [...s.chat, { ...m, id, time: Date.now() }] }));
  return id;
}

function update(id: string, patch: Partial<ChatMessage>) {
  setState((s) => ({ chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}

interface RunCtx {
  assistantId: string | null;
  text: string;
  started: number;
  /** Error sudah ditampilkan dari event "result"; jangan ditampilkan lagi saat proses keluar. */
  errored?: boolean;
  /** id pesan alat yang sedang berjalan, untuk menandai hasilnya (berhasil/ditolak). */
  tools: Map<string, string>;
}
const runs = new Map<string, RunCtx>();

function describeTool(name: string, input: Record<string, unknown> | undefined): string {
  const root = getState().root ?? "";
  const f = (input?.file_path ?? input?.path ?? input?.pattern ?? input?.command ?? "") as string;
  const target = typeof f === "string" && f ? ` ${relative(root, f)}` : "";
  const verbs: Record<string, string> = { Read: "Membaca", Grep: "Mencari", Glob: "Mencari berkas", Bash: "Menjalankan", Edit: "Mengedit", Write: "Menulis", WebFetch: "Membuka web", WebSearch: "Mencari di web", Task: "Menjalankan sub-agen", TodoWrite: "Mencatat rencana" };
  return `${verbs[name] ?? `Memakai ${name}`}${target}`;
}

function handleLine(runId: string, line: string) {
  const ctx = runs.get(runId);
  if (!ctx) return;
  let ev: any;
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  if (ev.type === "system" && ev.session_id) {
    setState({ chatSession: ev.session_id });
  } else if (ev.type === "assistant") {
    for (const part of ev.message?.content ?? []) {
      if (part.type === "text" && part.text) {
        ctx.text += (ctx.text ? "\n\n" : "") + part.text;
        if (ctx.assistantId) update(ctx.assistantId, { text: ctx.text });
        else ctx.assistantId = push({ role: "assistant", text: ctx.text });
      } else if (part.type === "tool_use") {
        const id = push({ role: "tool", text: describeTool(part.name, part.input) });
        if (part.id) ctx.tools.set(part.id, id);
        // Teks sesudah tool masuk ke gelembung baru.
        ctx.assistantId = null;
        ctx.text = "";
      }
    }
  } else if (ev.type === "user") {
    // Hasil alat: tampilkan bila gagal/ditolak supaya pengguna tahu kenapa berkas tidak berubah.
    for (const part of ev.message?.content ?? []) {
      if (part.type !== "tool_result" || !part.is_error) continue;
      const raw = typeof part.content === "string" ? part.content : (part.content ?? []).map((c: { text?: string }) => c.text ?? "").join(" ");
      const denied = /permission|denied|not allowed|plan mode|izin/i.test(raw);
      const msgId = ctx.tools.get(part.tool_use_id);
      const note = denied
        ? getState().settings.claudeMode === "read"
          ? "Ditolak: mode Baca saja. Ubah ke \"Boleh edit\" kalau Claude perlu mengubah berkas."
          : "Ditolak oleh izin Claude CLI."
        : `Gagal: ${raw.slice(0, 200)}`;
      if (msgId) update(msgId, { meta: note });
      else push({ role: "tool", text: note });
    }
  } else if (ev.type === "result") {
    if (ev.session_id) setState({ chatSession: ev.session_id });
    const secs = ((ev.duration_ms ?? Date.now() - ctx.started) / 1000).toFixed(1);
    const meta = `${secs} dtk${ev.num_turns ? ` · ${ev.num_turns} langkah` : ""}`;
    if (ev.is_error || ev.subtype?.startsWith("error")) {
      ctx.errored = true;
      const text = ev.result || "Claude berhenti dengan error.";
      const hint = /login|auth|credential|api key/i.test(text) ? "\n\nCoba jalankan `claude login` di terminal." : "";
      push({ role: "error", text: text + hint, meta });
      void import("../components/PenguinMascot").then((m) => m.flashPenguin("error", 6000));
    }
    else if (ctx.assistantId) update(ctx.assistantId, { meta });
    else if (ev.result) push({ role: "assistant", text: ev.result, meta });
  }
}

function ensureListeners() {
  if (listening) return;
  listening = true;
  void on<{ run_id: string; line: string }>("claude-event", ({ run_id, line }) => handleLine(run_id, line));
  void on<{ run_id: string; code: number | null; stderr: string }>("claude-done", ({ run_id, code, stderr }) => {
    const ctx = runs.get(run_id);
    runs.delete(run_id);
    if (getState().chatRunning === run_id) setState({ chatRunning: null });
    if (code === 0) void import("../components/PenguinMascot").then((m) => m.flashPenguin("sukses", 4000));
    if (code === 130) push({ role: "error", text: "Dibatalkan." });
    else if (code !== 0 && ctx && !ctx.text && !ctx.errored) {
      const hint = /login|auth|credential/i.test(stderr) ? " Coba jalankan `claude login` di terminal." : "";
      push({ role: "error", text: `Claude CLI keluar dengan kode ${code}.${hint}\n\n${stderr.trim()}`.trim() });
    }
  });
}

export async function detectClaude() {
  try {
    setState({ claude: await api.claudeDetect() });
  } catch (e) {
    setState({ claude: { installed: false, error: errMsg(e) } });
  }
}

export interface SendOptions {
  includeFile?: boolean;
  includeSelection?: boolean;
  extraContext?: { label: string; body: string };
}

const MAX_FILE_CHARS = 60_000;

/** Bangun teks persis yang akan dikirim ke CLI. */
export function buildPayload(prompt: string, o: SendOptions): { payload: string; summary: string } {
  const s = getState();
  const parts: string[] = [];
  const summary: string[] = [];
  const tab = activeTab();
  if (o.extraContext) {
    parts.push(`### ${o.extraContext.label}\n${o.extraContext.body}`);
    summary.push(o.extraContext.label);
  }
  if (tab?.kind === "text") {
    const rel = s.root ? relative(s.root, tab.id) : tab.id;
    const sel = docs.selectionText(s.focusedGroup);
    if (o.includeSelection && sel.trim()) {
      parts.push(`### Seleksi dari ${rel}\n\`\`\`\n${sel}\n\`\`\``);
      summary.push(`seleksi ${rel} (${sel.split("\n").length} baris)`);
    } else if (o.includeFile) {
      const text = docs.currentText(tab.id) ?? "";
      const cut = text.length > MAX_FILE_CHARS;
      parts.push(`### Berkas ${rel}${tab.dirty ? " (belum disimpan)" : ""}\n\`\`\`\n${cut ? text.slice(0, MAX_FILE_CHARS) + "\n…(dipotong)" : text}\n\`\`\``);
      summary.push(`${rel} (${text.split("\n").length} baris${cut ? ", dipotong" : ""})`);
    }
  }
  const payload = parts.length ? `${parts.join("\n\n")}\n\n### Permintaan\n${prompt}` : prompt;
  return { payload, summary: summary.join(", ") };
}

export async function sendToClaude(prompt: string, o: SendOptions = {}): Promise<boolean> {
  const s = getState();
  if (!prompt.trim()) return false;
  if (s.chatRunning) {
    toast("Claude masih menjawab. Tunggu atau batalkan dulu.");
    return false;
  }
  if (!s.claude?.installed) {
    await detectClaude();
    if (!getState().claude?.installed) {
      push({ role: "error", text: getState().claude?.error ?? "Claude Code CLI belum terpasang." });
      return false;
    }
  }
  const { payload, summary } = buildPayload(prompt, o);
  if (s.settings.claudeConfirm) {
    const ok = await ask({
      kind: "confirm",
      title: "Kirim ke Claude Code?",
      message: summary ? `Ikut dikirim: ${summary}. Isi lengkapnya ada di bawah.` : "Hanya pesanmu yang dikirim.",
      detail: payload,
      okLabel: "Kirim",
    });
    if (ok !== true) return false;
  }
  ensureListeners();
  setLayout({ right: true, rightView: "claude" });
  push({ role: "user", text: prompt, context: summary || undefined });
  const runId = `r${Date.now()}`;
  runs.set(runId, { assistantId: null, text: "", started: Date.now(), tools: new Map() });
  setState({ chatRunning: runId });
  try {
    await api.claudeRun(runId, s.root ?? "", payload, getState().chatSession, getState().settings.claudeMode);
    return true;
  } catch (e) {
    runs.delete(runId);
    setState({ chatRunning: null });
    push({ role: "error", text: errMsg(e) });
    return false;
  }
}

export async function cancelClaude() {
  const id = getState().chatRunning;
  if (id) await api.claudeCancel(id).catch(() => {});
}

export function newConversation() {
  setState({ chat: [], chatSession: null });
}

function excerpt(text: string, line: number, radius = 25): string {
  const lines = text.split("\n");
  const from = Math.max(0, line - 1 - radius);
  const to = Math.min(lines.length, line + radius);
  const w = String(to).length;
  return lines
    .slice(from, to)
    .map((l, i) => `${String(from + i + 1).padStart(w)}${from + i + 1 === line ? " >" : "  "} ${l}`)
    .join("\n");
}

/** "Claude jelaskan error" dari panel Masalah. */
export async function explainProblem(path: string, p: Problem) {
  const root = getState().root ?? "";
  const text = docs.currentText(path) ?? "";
  const rel = relative(root, path);
  await sendToClaude(`Jelaskan kenapa error ini muncul dan beri perbaikan yang tepat. Tunjukkan kode pengganti dalam satu blok kode.\n\nError di ${rel}:${p.line}:${p.col} — ${p.message}`, {
    extraContext: { label: `Potongan ${rel} sekitar baris ${p.line}`, body: "```\n" + excerpt(text, p.line) + "\n```" },
  });
}

/** "Claude jelaskan error" dari terminal / run yang gagal. */
export async function explainTerminal(key: string) {
  const { recentOutput } = await import("../terminal/terminals");
  const sess = getState().terminals.find((t) => t.key === key);
  const out = recentOutput(key, 6000);
  if (!out) return toast("Belum ada output untuk dijelaskan.");
  await sendToClaude("Jelaskan error di output terminal ini dan cara memperbaikinya. Kalau perlu ubah kode, tunjukkan kodenya.", {
    extraContext: {
      label: `Output terminal${sess?.command ? ` dari \`${sess.command}\`` : ""}${sess?.exitCode != null ? ` (kode keluar ${sess.exitCode})` : ""}`,
      body: "```\n" + out + "\n```",
    },
    includeFile: false,
  });
}

export function explainSelection() {
  const tab = activeTab();
  if (!tab) return;
  void sendToClaude(`Jelaskan kode ini secara singkat dan beri saran perbaikan kalau ada.`, { includeSelection: true, includeFile: true });
}

/** Ganti seluruh isi berkas aktif dengan kode dari jawaban Claude (dibandingkan dulu). */
export async function applyCodeToActive(code: string) {
  const tab = activeTab();
  if (!tab || tab.kind !== "text") return toast("Buka berkas tujuan dulu.");
  const { openCompare } = await import("../panels/compare");
  openCompare({
    title: `Terapkan kode Claude ke ${basename(tab.id)}?`,
    leftLabel: "Sekarang",
    rightLabel: "Usulan Claude",
    left: docs.currentText(tab.id) ?? "",
    right: code,
    acceptLabel: "Terapkan",
    onAccept: () => docs.setDocumentText(tab.id, code),
  });
}
