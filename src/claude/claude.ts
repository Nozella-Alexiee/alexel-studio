// Percakapan dengan Claude Code CLI (seperti ekstensi Claude Code di VS Code).
// Satu proses stream-json per percakapan: teks mengalir per token, permintaan izin muncul
// sebagai kartu di panel, dan model / mode izin bisa diganti tanpa memulai ulang.

import * as docs from "../editor/documents";
import { api, errMsg, on } from "../lib/ipc";
import { basename, relative } from "../lib/paths";
import type { ClaudeContent, ClaudePermMode } from "../lib/types";
import { agentInfo, type AgentId } from "../agents/registry";
import { activeTab, ask, getState, newChatKey, setLayout, setState, toast, type ChatMessage, type ChatTool, type Problem } from "../state/store";

let listening = false;
let msgId = 0;
const nid = () => `m${Date.now()}-${++msgId}`;

function push(m: Omit<ChatMessage, "id" | "time">): string {
  const id = nid();
  setState((s) => ({ chat: [...s.chat, { ...m, id, time: Date.now() }] }));
  return id;
}

function update(id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) {
  setState((s) => ({ chat: s.chat.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)) }));
}

const findMsg = (id: string) => getState().chat.find((m) => m.id === id);

/** Keadaan satu giliran jawaban. */
interface Turn {
  started: number;
  /** id pesan API → id gelembung teks (urut sesuai blok teks). */
  streamed: Map<string, string[]>;
  /** blok yang sedang mengalir di pesan API saat ini: index blok → id gelembung. */
  blocks: Map<number, string>;
  texts: Map<string, string>;
  curMsg: string | null;
  /** jumlah blok teks dari event "assistant" per pesan API. */
  seen: Map<string, number>;
  lastBubble: string | null;
  errored: boolean;
  context: number;
}

/** Keadaan per proses percakapan (kunci = chatKey). */
interface Conv {
  turn: Turn | null;
  /** tool_use id → id pesan alat. */
  tools: Map<string, string>;
  /** Biaya yang sudah terhitung dari proses sebelumnya (sesi yang dilanjutkan di proses baru). */
  costBase: number;
  lastCost: number;
  closing: boolean;
  cancelTimer?: ReturnType<typeof setTimeout>;
}
const convs = new Map<string, Conv>();

function conv(key: string): Conv {
  let c = convs.get(key);
  if (!c) {
    const prev = getState().chatUsage?.cost ?? 0;
    c = { turn: null, tools: new Map(), costBase: prev, lastCost: 0, closing: false };
    convs.set(key, c);
  }
  return c;
}

const newTurn = (): Turn => ({ started: Date.now(), streamed: new Map(), blocks: new Map(), texts: new Map(), curMsg: null, seen: new Map(), lastBubble: null, errored: false, context: 0 });

// ---------------- Teks alat ----------------

export function toolTarget(name: string, input: Record<string, unknown> | undefined): string {
  const root = getState().root ?? "";
  const f = (input?.file_path ?? input?.notebook_path ?? input?.path ?? input?.pattern ?? input?.url ?? input?.query ?? "") as string;
  if (name === "Bash") return String(input?.command ?? "");
  return typeof f === "string" && f ? (f.startsWith("/") || /^[A-Za-z]:/.test(f) ? relative(root, f) : f) : "";
}

export function describeTool(name: string, input: Record<string, unknown> | undefined): string {
  const verbs: Record<string, string> = {
    Read: "Membaca", Grep: "Mencari", Glob: "Mencari berkas", Bash: "Menjalankan", Edit: "Mengedit", MultiEdit: "Mengedit", Write: "Menulis",
    NotebookEdit: "Mengedit notebook", WebFetch: "Membuka", WebSearch: "Mencari di web", Task: "Menjalankan sub-agen", Agent: "Menjalankan sub-agen",
    TodoWrite: "Mencatat rencana", ExitPlanMode: "Menyerahkan rencana", AskUserQuestion: "Bertanya", ApplyPatch: "Mengubah", MCP: "Memakai alat",
  };
  const target = name === "Bash" ? "" : toolTarget(name, input);
  return `${verbs[name] ?? `Memakai ${name}`}${target ? ` ${target}` : ""}`;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: { text?: string }) => c?.text ?? "").join("\n");
  return "";
}

const stripTags = (t: string) => t.replace(/<\/?local-command-std(out|err)>/g, "").trim();

// ---------------- Event dari CLI ----------------

function handleLine(key: string, line: string) {
  if (key !== getState().chatKey) return;
  let ev: any;
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  const c = conv(key);
  switch (ev.type) {
    case "control_response":
      return onControlResponse(key, ev.response);
    case "control_request":
      return onControlRequest(key, ev);
    case "control_cancel_request":
      for (const m of getState().chat) {
        const p = m.perm;
        if (p && p.requestId === ev.request_id && p.state === "pending") update(m.id, { perm: { ...p, state: "expired" } });
      }
      return;
    case "system":
      if (ev.subtype === "init") setState({ chatSession: ev.session_id ?? getState().chatSession, claudeActiveModel: ev.model ?? null });
      return;
    case "stream_event":
      if (!ev.parent_tool_use_id && c.turn) onStream(c.turn, ev.event);
      return;
    case "assistant":
      if (!ev.parent_tool_use_id) onAssistant(c, ev.message);
      return;
    case "user":
      if (!ev.parent_tool_use_id) onUser(c, ev.message);
      return;
    case "result":
      return onResult(key, c, ev);
  }
}

function onControlResponse(key: string, r: any) {
  if (!r) return;
  if (r.request_id === `init-${key}`) {
    const res = r.response ?? {};
    const models = Array.isArray(res.models) ? res.models.filter((m: any) => typeof m?.value === "string" && typeof m?.displayName === "string") : [];
    const commands = Array.isArray(res.commands) ? res.commands.filter((x: any) => typeof x?.name === "string").map((x: any) => ({ name: x.name, description: String(x.description ?? "") })) : [];
    setState({ claudeModels: models, claudeCommands: commands });
    // Proses baru (sesi dilanjutkan) menghitung biaya dari nol lagi.
    const c = conv(key);
    c.costBase += c.lastCost;
    c.lastCost = 0;
    return;
  }
  if (r.subtype === "error") {
    toast(`Claude: ${r.error ?? "permintaan ditolak"}`, "error");
    void import("../app/output").then((m) => m.logOutput("Agen AI", `Kontrol ditolak: ${r.error ?? "?"}`));
  }
}

function onControlRequest(key: string, ev: any) {
  const req = ev.request ?? {};
  if (req.subtype !== "can_use_tool") {
    // hook / MCP dari host tidak didukung: jawab supaya CLI tidak menunggu.
    void api.agentControl(agentNow(), key, { type: "control_response", response: { subtype: "error", request_id: ev.request_id, error: "Tidak didukung oleh Alexel Studio." } }).catch(() => {});
    return;
  }
  const c = conv(key);
  const toolMsg = req.tool_use_id ? c.tools.get(req.tool_use_id) : undefined;
  if (toolMsg) update(toolMsg, (m) => ({ tool: m.tool ? { ...m.tool, status: "running" } : m.tool, meta: "menunggu izin" }));
  push({
    role: "permission",
    text: describeTool(req.tool_name, req.input),
    perm: { requestId: ev.request_id, toolName: req.tool_name, input: req.input ?? {}, suggestions: req.permission_suggestions, state: "pending" },
  });
  if (c.turn) c.turn.lastBubble = null;
  void import("../components/CrabMascot").then((m) => m.flashKepi("melambai", 2500));
}

function onStream(t: Turn, e: any) {
  if (!e) return;
  if (e.type === "message_start") {
    t.curMsg = e.message?.id ?? null;
    t.blocks.clear();
    const u = e.message?.usage;
    if (u) t.context = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  } else if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && t.curMsg) {
    let id = t.blocks.get(e.index);
    if (!id) {
      id = push({ role: "assistant", text: "" });
      t.blocks.set(e.index, id);
      const list = t.streamed.get(t.curMsg) ?? [];
      list.push(id);
      t.streamed.set(t.curMsg, list);
    }
    const text = (t.texts.get(id) ?? "") + e.delta.text;
    t.texts.set(id, text);
    t.lastBubble = id;
    update(id, { text });
  }
}

function onAssistant(c: Conv, message: any) {
  const t = c.turn;
  const apiId: string = message?.id ?? "";
  for (const part of message?.content ?? []) {
    if (part.type === "text" && part.text) {
      const n = t?.seen.get(apiId) ?? 0;
      t?.seen.set(apiId, n + 1);
      const bubble = t?.streamed.get(apiId)?.[n];
      if (bubble) update(bubble, { text: part.text });
      else {
        const id = push({ role: "assistant", text: part.text });
        if (t) t.lastBubble = id;
      }
    } else if (part.type === "tool_use") {
      if (part.name === "TodoWrite") {
        upsertTodo(part.input);
        continue;
      }
      if (part.id && c.tools.has(part.id)) continue;
      const tool: ChatTool = { useId: part.id, name: part.name, input: part.input ?? {}, status: "running" };
      const id = push({ role: "tool", text: describeTool(part.name, part.input), tool });
      if (part.id) c.tools.set(part.id, id);
      if (t) t.lastBubble = null;
    }
  }
}

function upsertTodo(input: any) {
  const todos = Array.isArray(input?.todos) ? input.todos : [];
  const text = JSON.stringify(todos.map((x: any) => ({ content: String(x?.content ?? ""), status: String(x?.status ?? "pending") })));
  const last = [...getState().chat].reverse().find((m) => m.role === "todo");
  if (last && getState().chat.indexOf(last) >= getState().chat.length - 12) update(last.id, { text });
  else push({ role: "todo", text });
}

const DENIED = /permission|denied|rejected|not allowed|user (said no|doesn't want|declined)|menolak|ditolak/i;

function onUser(c: Conv, message: any) {
  const content = message?.content;
  if (typeof content === "string") {
    if (/<local-command-std(out|err)>/.test(content)) push({ role: "info", text: stripTags(content) });
    return;
  }
  for (const part of content ?? []) {
    if (part.type !== "tool_result") continue;
    const msg = c.tools.get(part.tool_use_id);
    if (!msg) continue;
    const raw = resultText(part.content);
    const status: ChatTool["status"] = part.is_error ? (DENIED.test(raw) ? "denied" : "error") : "ok";
    update(msg, (m) => ({ tool: m.tool ? { ...m.tool, status, result: raw.slice(0, 4000) } : m.tool, meta: status === "denied" ? "ditolak" : status === "error" ? raw.slice(0, 200) : undefined }));
  }
}

function onResult(key: string, c: Conv, ev: any) {
  const t = c.turn;
  c.turn = null;
  if (c.cancelTimer) clearTimeout(c.cancelTimer);
  if (getState().chatRunning === key) setState({ chatRunning: null });
  if (ev.session_id) setState({ chatSession: ev.session_id });
  // Biaya & konteks
  if (typeof ev.total_cost_usd === "number") c.lastCost = ev.total_cost_usd;
  const model = getState().claudeActiveModel;
  const mu = ev.modelUsage && model ? ev.modelUsage[model] : null;
  const window = mu?.contextWindow ?? getState().chatUsage?.window ?? 200_000;
  setState({ chatUsage: { cost: c.costBase + c.lastCost, context: t?.context || getState().chatUsage?.context || 0, window } });
  const secs = ((ev.duration_ms ?? Date.now() - (t?.started ?? Date.now())) / 1000).toFixed(1);
  const meta = `${secs} dtk${ev.num_turns ? ` · ${ev.num_turns} langkah` : ""}`;
  if (ev.is_error || String(ev.subtype ?? "").startsWith("error")) {
    if (ev.subtype === "error_during_execution" && /interrupt/i.test(String(ev.result ?? "")) ) {
      push({ role: "info", text: "Dihentikan." });
      return;
    }
    const text = ev.result || (ev.subtype === "error_max_turns" ? `${agentInfo(agentNow()).short} berhenti: batas langkah tercapai.` : `${agentInfo(agentNow()).short} berhenti dengan error.`);
    const hint = /login|auth|credential|api key|401/i.test(text) ? "\n\nKamu perlu masuk ke Claude Code dulu. Klik **Masuk** di atas panel." : "";
    push({ role: "error", text: text + hint, meta });
    void import("../components/PenguinMascot").then((m) => m.flashPenguin("error", 6000));
    void import("../components/CrabMascot").then((m) => m.flashKepi("error", 5000));
    return;
  }
  const bubble = t?.lastBubble ?? [...getState().chat].reverse().find((m) => m.role === "assistant")?.id;
  if (bubble && findMsg(bubble)?.role === "assistant") update(bubble, { meta });
  else if (ev.result) push({ role: "assistant", text: ev.result, meta });
  void import("../components/PenguinMascot").then((m) => m.flashPenguin("sukses", 4000));
  void import("../components/CrabMascot").then((m) => m.flashKepi("sukses", 3500));
}

function ensureListeners() {
  if (listening) return;
  listening = true;
  void on<{ run_id: string; line: string }>("agent-event", ({ run_id, line }) => handleLine(run_id, line));
  void on<{ run_id: string; code: number | null; stderr: string; replaced?: boolean }>("agent-done", ({ run_id, code, stderr, replaced }) => {
    // Proses lama yang digantikan (mis. effort diganti) tidak memengaruhi percakapan.
    if (replaced) return;
    const c = convs.get(run_id);
    if (c?.cancelTimer) clearTimeout(c.cancelTimer);
    void import("../app/output").then((m) => m.logOutput("Agen AI", `Proses selesai (kode ${code}).${stderr.trim() ? `\n${stderr.trim()}` : ""}`));
    if (c) {
      c.costBase += c.lastCost;
      c.lastCost = 0;
    }
    if (run_id !== getState().chatKey) {
      convs.delete(run_id);
      return;
    }
    for (const m of getState().chat) if (m.perm?.state === "pending") update(m.id, { perm: { ...m.perm, state: "expired" } });
    for (const m of getState().chat) if (m.tool?.status === "running") update(m.id, { tool: { ...m.tool, status: "error" }, meta: "terhenti" });
    const wasRunning = getState().chatRunning === run_id;
    if (wasRunning) setState({ chatRunning: null });
    if (c?.closing) return;
    if (code === 130) {
      if (wasRunning) push({ role: "info", text: "Dihentikan." });
    } else if (code !== 0 && wasRunning && !c?.turn?.errored) {
      const name = agentInfo(agentNow()).name;
      const hint = /login|auth|credential/i.test(stderr) ? ` Kamu perlu masuk ke ${name} dulu.` : "";
      push({ role: "error", text: `${name} berhenti (kode ${code}).${hint}\n\n${stderr.trim()}`.trim() });
    }
  });
}

// ---------------- Deteksi & login ----------------

export async function detectClaude() {
  try {
    setState({ claude: await api.claudeDetect() });
  } catch (e) {
    setState({ claude: { installed: false, error: errMsg(e) } });
  }
}

/** Periksa status agen (terpasang, versi, login). Claude juga mengisi state.claude. */
export async function detectAgent(agent: AgentId = agentNow()) {
  if (agent === "claude") await detectClaude();
  try {
    const st = agent === "claude" ? { ...(getState().claude ?? { installed: false }), source: "system" as const } : await api.agentStatus(agent);
    setState((s) => ({ agentStatus: { ...s.agentStatus, [agent]: st } }));
  } catch (e) {
    setState((s) => ({ agentStatus: { ...s.agentStatus, [agent]: { installed: false, error: errMsg(e) } } }));
  }
}

/** Ganti agen panel. Percakapan berjalan ditutup; agen baru mulai dari percakapan kosong. */
export async function selectAgent(agent: AgentId) {
  if (agent === agentNow()) return;
  closeCurrent();
  const { updateSettings } = await import("../app/actions");
  updateSettings({ agent });
  setState({ chat: [], chatSession: null, chatRunning: null, chatKey: newChatKey(), chatUsage: null, claudeModels: [], claudeCommands: [], claudeActiveModel: null });
  await detectAgent(agent);
}

/** Perintah pemasangan resmi Claude Code untuk OS ini. */
export function installCommand(): string {
  const p = (window as unknown as { nozel?: { platform?: string } }).nozel?.platform;
  return p === "win32" ? "irm https://claude.ai/install.ps1 | iex" : "curl -fsSL https://claude.ai/install.sh | bash";
}

/** Buka terminal yang menjalankan `claude auth login`, lalu periksa ulang setelah selesai. */
const LOGIN_ARGS: Record<AgentId, string> = { claude: "auth login", codex: "login", gemini: "", acp: "" };

export async function loginClaude() {
  const agent = agentNow();
  const info = getState().agentStatus[agent] ?? (agent === "claude" ? getState().claude : null);
  if (!info?.path) return toast(`${agentInfo(agent).name} belum terpasang.`);
  const { runInTerminal, shellExe } = await import("../app/run");
  await runInTerminal(`${shellExe(info.path)} ${LOGIN_ARGS[agent]}`.trim(), `Masuk ke ${agentInfo(agent).short}`);
  toast("Ikuti langkah masuk di terminal. Setelah selesai, klik Periksa ulang.", "info");
}

export async function installClaude() {
  const { runInTerminal } = await import("../app/run");
  await runInTerminal(installCommand(), "Pasang Claude Code");
}

// ---------------- Kirim ----------------

export interface SendOptions {
  includeFile?: boolean;
  includeSelection?: boolean;
  extraContext?: { label: string; body: string };
  images?: { media_type: string; data: string }[];
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
    const sel = docs.selectionInfo(s.focusedGroup);
    if (o.includeSelection && sel?.text.trim()) {
      parts.push(`### Seleksi dari ${rel} (baris ${sel.from}–${sel.to})\n\`\`\`\n${sel.text}\n\`\`\``);
      summary.push(`${rel}:${sel.from}-${sel.to}`);
    } else if (o.includeFile) {
      const text = docs.currentText(tab.id) ?? "";
      const cut = text.length > MAX_FILE_CHARS;
      parts.push(`### Berkas ${rel}${tab.dirty ? " (belum disimpan)" : ""}\n\`\`\`\n${cut ? text.slice(0, MAX_FILE_CHARS) + "\n…(dipotong)" : text}\n\`\`\``);
      summary.push(`${rel}${cut ? " (dipotong)" : ""}`);
    }
  }
  if (o.images?.length) summary.push(`${o.images.length} gambar`);
  const payload = parts.length ? `${parts.join("\n\n")}\n\n### Permintaan\n${prompt}` : prompt;
  return { payload, summary: summary.join(", ") };
}

/** Agen percakapan yang sedang aktif. */
export const agentNow = (): AgentId => getState().settings.agent;

/** Model / effort / mode yang dipilih untuk agen aktif. */
export function agentChoice(agent = agentNow()): { model: string; effort: string; mode: string } {
  const st = getState().settings;
  if (agent === "claude") return { model: st.claudeModel, effort: st.claudeEffort, mode: st.claudeMode };
  const p = st.agentPrefs[agent] ?? {};
  return { model: p.model ?? "default", effort: p.effort ?? "auto", mode: p.mode ?? agentInfo(agent).caps.modes[0]?.id ?? "default" };
}

const cfgNow = () => {
  const s = getState();
  const c = agentChoice();
  return {
    cwd: s.root ?? "",
    model: c.model === "default" ? null : c.model,
    effort: c.effort === "auto" ? null : c.effort,
    mode: c.mode,
    resume: s.chatSession,
    command: s.settings.agent === "acp" ? s.settings.acpCommand : undefined,
  };
};

export async function ensureConsent(): Promise<boolean> {
  if (getState().settings.claudeConsent) return true;
  const ok = await ask({
    kind: "confirm",
    title: "Pakai agen AI di Alexel Studio?",
    message:
      "Pesanmu, berkas yang kamu lampirkan, dan berkas yang dibaca agen dikirim ke penyedia agen yang kamu pilih (mis. Anthropic, OpenAI, Google) dengan akunmu sendiri. " +
      "Di mode Tanya dulu, agen meminta izin di panel ini sebelum mengubah berkas atau menjalankan perintah. Persetujuan ini cukup sekali.",
    okLabel: "Setuju",
  });
  if (ok !== true) return false;
  const { updateSettings } = await import("../app/actions");
  updateSettings({ claudeConsent: true });
  return true;
}

export async function sendToClaude(prompt: string, o: SendOptions = {}): Promise<boolean> {
  const s = getState();
  if (!prompt.trim() && !o.images?.length) return false;
  if (s.chatRunning) {
    toast(`${agentInfo(agentNow()).short} masih menjawab. Tunggu atau hentikan dulu.`);
    return false;
  }
  setLayout({ right: true, rightView: "claude" });
  const agent = agentNow();
  const name = agentInfo(agent).name;
  if (!getState().agentStatus[agent]?.installed) {
    await detectAgent(agent);
    if (!getState().agentStatus[agent]?.installed) {
      push({ role: "error", text: `${name} belum terpasang. Pasang dari panel Ekstensi → Agen AI.` });
      return false;
    }
  }
  if (getState().agentStatus[agent]?.loggedIn === false) {
    push({ role: "error", text: `Kamu belum masuk ke ${name}. Klik **Masuk** di panel.` });
    return false;
  }
  if (!(await ensureConsent())) return false;
  const { payload, summary } = buildPayload(prompt, o);
  if (getState().settings.claudeConfirm) {
    const ok = await ask({
      kind: "confirm",
      title: `Kirim ke ${name}?`,
      message: summary ? `Ikut dikirim: ${summary}. Isi lengkapnya ada di bawah.` : "Hanya pesanmu yang dikirim.",
      detail: payload,
      okLabel: "Kirim",
    });
    if (ok !== true) return false;
  }
  ensureListeners();
  const key = getState().chatKey;
  const c = conv(key);
  c.turn = newTurn();
  push({ role: "user", text: prompt, context: summary || undefined, images: o.images?.length || undefined });
  setState({ chatRunning: key });
  const content: ClaudeContent[] = [
    ...(o.images ?? []).map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.media_type, data: im.data } })),
    { type: "text", text: payload || "(lihat gambar)" },
  ];
  try {
    await api.agentSend(agentNow(), key, cfgNow(), content);
    return true;
  } catch (e) {
    c.turn = null;
    setState({ chatRunning: null });
    push({ role: "error", text: errMsg(e) });
    return false;
  }
}

/** Hentikan jawaban yang sedang berjalan (interrupt; bila macet, proses ditutup). */
export async function cancelClaude() {
  const key = getState().chatRunning;
  if (!key) return;
  const c = conv(key);
  const ok = await api.agentControl(agentNow(), key, { type: "control_request", request: { subtype: "interrupt" } }).catch(() => false);
  c.cancelTimer = setTimeout(() => {
    if (getState().chatRunning !== key) return;
    c.closing = true;
    void api.agentClose(agentNow(), key);
    setState({ chatRunning: null, chatKey: newChatKey() });
    push({ role: "info", text: "Dihentikan." });
  }, ok ? 5000 : 0);
}

// ---------------- Izin ----------------

export type PermDecision = "allow" | "always" | "deny";

/**
 * Jawab kartu izin. `updatedInput` dipakai untuk AskUserQuestion (jawaban pengguna),
 * `mode` untuk persetujuan rencana (ExitPlanMode) yang sekaligus mengganti mode izin.
 */
export async function answerPermission(id: string, decision: PermDecision, opts: { reason?: string; updatedInput?: Record<string, unknown>; mode?: ClaudePermMode } = {}) {
  const m = findMsg(id);
  const key = getState().chatKey;
  if (!m?.perm || m.perm.state !== "pending") return;
  const p = m.perm;
  let response: Record<string, unknown>;
  if (decision === "deny") response = { behavior: "deny", message: opts.reason?.trim() || "Pengguna menolak permintaan ini." };
  else {
    response = { behavior: "allow", updatedInput: opts.updatedInput ?? p.input };
    if (opts.mode) response.updatedPermissions = [{ type: "setMode", mode: opts.mode, destination: "session" }];
    else if (decision === "always" && Array.isArray(p.suggestions) && p.suggestions.length) response.updatedPermissions = p.suggestions;
  }
  const sent = await api.agentControl(agentNow(), key, { type: "control_response", response: { subtype: "success", request_id: p.requestId, response } }).catch((e: unknown) => {
    toast(errMsg(e), "error");
    return false;
  });
  if (!sent) {
    update(id, { perm: { ...p, state: "expired" } });
    return;
  }
  update(id, { perm: { ...p, state: decision === "deny" ? "denied" : decision === "always" ? "always" : "allowed", reason: opts.reason } });
  if (opts.mode) {
    const { updateSettings } = await import("../app/actions");
    updateSettings({ claudeMode: opts.mode });
  } else if (decision === "always" && (p.suggestions ?? []).some((x: any) => x?.type === "setMode" && x.mode === "acceptEdits")) {
    const { updateSettings } = await import("../app/actions");
    updateSettings({ claudeMode: "acceptEdits" });
  }
}

/** Isi berkas setelah edit yang diminta Claude (untuk pratinjau diff sebelum diizinkan). */
export async function proposedEdit(input: Record<string, unknown>, toolName: string): Promise<{ path: string; before: string; after: string } | null> {
  const path = String(input.file_path ?? "");
  if (!path) return null;
  let before = docs.currentText(path);
  if (before == null) {
    try {
      before = (await api.readText(path)).content;
    } catch {
      before = "";
    }
  }
  if (toolName === "Write") return { path, before, after: String(input.content ?? "") };
  const edits: { old_string?: string; new_string?: string; replace_all?: boolean }[] =
    toolName === "MultiEdit" && Array.isArray(input.edits) ? (input.edits as never[]) : [{ old_string: input.old_string as string, new_string: input.new_string as string, replace_all: input.replace_all as boolean }];
  let after = before;
  for (const e of edits) {
    const from = String(e.old_string ?? "");
    const to = String(e.new_string ?? "");
    if (!from) after = to + after;
    else after = e.replace_all ? after.split(from).join(to) : after.replace(from, () => to);
  }
  return { path, before, after };
}

// ---------------- Model, mode, effort ----------------

async function savePref(key: "model" | "effort" | "mode", value: string) {
  const { updateSettings } = await import("../app/actions");
  const agent = agentNow();
  if (agent === "claude") updateSettings(key === "model" ? { claudeModel: value } : key === "effort" ? { claudeEffort: value } : { claudeMode: value as ClaudePermMode });
  else {
    const prefs = getState().settings.agentPrefs;
    updateSettings({ agentPrefs: { ...prefs, [agent]: { ...prefs[agent], [key]: value } } });
  }
}

export async function setClaudeMode(mode: string) {
  await savePref("mode", mode);
  await api.agentControl(agentNow(), getState().chatKey, { type: "control_request", request: { subtype: "set_permission_mode", mode } }).catch(() => false);
}

export async function setClaudeModel(model: string) {
  await savePref("model", model);
  await api.agentControl(agentNow(), getState().chatKey, { type: "control_request", request: { subtype: "set_model", model } }).catch(() => false);
}

/** Effort berlaku mulai pesan berikutnya (proses dimulai ulang dan sesi dilanjutkan). */
export async function setClaudeEffort(effort: string) {
  await savePref("effort", effort);
}

export function cycleClaudeMode() {
  const order = agentInfo(agentNow()).caps.modes.map((m) => m.id);
  if (!order.length) return;
  const cur = agentChoice().mode;
  void setClaudeMode(order[(order.indexOf(cur) + 1) % order.length]);
}

// ---------------- Percakapan & riwayat ----------------

function closeCurrent() {
  const key = getState().chatKey;
  const c = convs.get(key);
  if (c) c.closing = true;
  void api.agentClose(agentNow(), key).catch(() => {});
}

export function newConversation() {
  closeCurrent();
  setState({ chat: [], chatSession: null, chatRunning: null, chatKey: newChatKey(), chatUsage: null });
}

/** Lanjutkan sesi lama: tampilkan ulang isinya, pesan berikutnya memakai --resume. */
export async function resumeSession(id: string) {
  const root = getState().root ?? "";
  let lines: string[];
  try {
    lines = await api.agentSessionLoad(agentNow(), root, id);
  } catch (e) {
    toast(errMsg(e), "error");
    return;
  }
  closeCurrent();
  const key = newChatKey();
  setState({ chat: [], chatSession: id, chatRunning: null, chatKey: key, chatUsage: null });
  const c = conv(key);
  for (const line of lines) {
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type === "assistant") onAssistant(c, ev.message);
    else if (ev.type === "user") {
      const content = ev.message?.content;
      const texts = typeof content === "string" ? [content] : Array.isArray(content) ? content.filter((p: any) => p?.type === "text").map((p: any) => String(p.text ?? "")) : [];
      const images = Array.isArray(content) ? content.filter((p: any) => p?.type === "image").length : 0;
      if (texts.length && !/^<(command|local-command|system)/.test(texts[0].trim())) {
        const text = texts[texts.length - 1];
        const mark = text.lastIndexOf("### Permintaan\n");
        push({ role: "user", text: mark >= 0 ? text.slice(mark + 15) : text, context: mark >= 0 ? "konteks" : undefined, images: images || undefined });
      }
      if (Array.isArray(content) && content.some((p: any) => p?.type === "tool_result")) onUser(c, ev.message);
    }
  }
  for (const m of getState().chat) if (m.tool?.status === "running") update(m.id, { tool: { ...m.tool, status: "ok" } });
  push({ role: "info", text: "Percakapan dilanjutkan. Pesan berikutnya meneruskan sesi ini." });
}

// ---------------- Pintasan dari bagian lain aplikasi ----------------

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
  await sendToClaude(`Jelaskan kenapa error ini muncul dan beri perbaikan yang tepat.\n\nError di ${rel}:${p.line}:${p.col} — ${p.message}`, {
    extraContext: { label: `Potongan ${rel} sekitar baris ${p.line}`, body: "```\n" + excerpt(text, p.line) + "\n```" },
  });
}

/** "Claude jelaskan error" dari terminal / run yang gagal. */
export async function explainTerminal(key: string) {
  const { recentOutput } = await import("../terminal/terminals");
  const sess = getState().terminals.find((t) => t.key === key);
  const out = recentOutput(key, 6000);
  if (!out) return toast("Belum ada output untuk dijelaskan.");
  await sendToClaude("Jelaskan error di output terminal ini dan cara memperbaikinya.", {
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
