// Percakapan dengan Claude Code CLI (seperti ekstensi Claude Code di VS Code).
// Satu proses stream-json per percakapan: teks mengalir per token, permintaan izin muncul
// sebagai kartu di panel, dan model / mode izin bisa diganti tanpa memulai ulang.

import * as docs from "../editor/documents";
import { api, errMsg, on } from "../lib/ipc";
import { basename, relative, uiPath } from "../lib/paths";
import type { ClaudeContent, ClaudePermMode } from "../lib/types";
import { agentInfo, type AgentId } from "../agents/registry";
import { activeTab, ask, getState, newChatKey, setLayout, setState, toast, useStore, type ChatMessage, type ChatTool, type Problem } from "../state/store";
import { claudeEffortLevels, claudeModesAvailable, selectedModel } from "./options";
import { tl } from "../i18n";

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
  /** Id giliran (checkpoint berkas). */
  id: string;
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

const newTurn = (): Turn => ({ id: `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, started: Date.now(), streamed: new Map(), blocks: new Map(), texts: new Map(), curMsg: null, seen: new Map(), lastBubble: null, errored: false, context: 0 });

// ---------------- Teks alat ----------------

export function toolTarget(name: string, input: Record<string, unknown> | undefined): string {
  const root = getState().root ?? "";
  const raw = (input?.file_path ?? input?.notebook_path ?? input?.path ?? input?.pattern ?? input?.url ?? input?.query ?? "") as string;
  if (name === "Bash") return String(input?.command ?? "");
  const f = typeof raw === "string" ? uiPath(raw) : "";
  return f ? (f.startsWith("/") || /^[A-Za-z]:/.test(f) ? relative(root, f) : f) : "";
}

export function describeTool(name: string, input: Record<string, unknown> | undefined): string {
  const verbs: Record<string, string> = {
    Read: tl("Membaca"), Grep: tl("Mencari"), Glob: tl("Mencari berkas"), Bash: tl("Menjalankan"), Edit: tl("Mengedit"), MultiEdit: tl("Mengedit"), Write: tl("Menulis"),
    NotebookEdit: tl("Mengedit notebook"), WebFetch: tl("Membuka"), WebSearch: tl("Mencari di web"), Task: tl("Menjalankan sub-agen"), Agent: tl("Menjalankan sub-agen"),
    TodoWrite: tl("Mencatat rencana"), ExitPlanMode: tl("Menyerahkan rencana"), AskUserQuestion: tl("Bertanya"), ApplyPatch: tl("Mengubah"), MCP: tl("Memakai alat"),
  };
  const target = name === "Bash" ? "" : toolTarget(name, input);
  return `${verbs[name] ?? tl("Memakai {name}", { name })}${target ? ` ${target}` : ""}`;
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
    const modes = Array.isArray(res.modes) ? res.modes.filter((m: any) => typeof m?.id === "string").map((m: any) => ({ id: m.id, label: String(m.label ?? m.id), hint: String(m.hint ?? "") })) : [];
    setState({ claudeModels: models, claudeCommands: commands, agentModes: modes });
    // Model baru dimuat: perbarui daftar pilihan yang valid (mis. mode auto hanya untuk model yang mendukung).
    // Proses baru (sesi dilanjutkan) menghitung biaya dari nol lagi.
    const c = conv(key);
    c.costBase += c.lastCost;
    c.lastCost = 0;
    return;
  }
  if (r.request_id === `cmds-${key}`) {
    const commands = Array.isArray(r.response?.commands) ? r.response.commands.filter((x: any) => typeof x?.name === "string").map((x: any) => ({ name: x.name, description: String(x.description ?? "") })) : [];
    setState({ claudeCommands: commands });
    return;
  }
  if (r.request_id === `settings-${key}`) {
    // get_settings: apakah Ultracode bisa aktif untuk akun/model ini.
    setState({ claudeUltracodeAvailable: r.response?.applied?.ultracodeAvailable === true });
    return;
  }
  if (r.subtype === "error") {
    toast(`Claude: ${r.error ?? tl("permintaan ditolak")}`, "error");
    void import("../app/output").then((m) => m.logOutput("Agen AI", tl("Kontrol ditolak: {error}", { error: r.error ?? "?" })));
  }
}

function onControlRequest(key: string, ev: any) {
  const req = ev.request ?? {};
  if (req.subtype !== "can_use_tool") {
    // hook / MCP dari host tidak didukung: jawab supaya CLI tidak menunggu.
    void api.agentControl(agentNow(), key, { type: "control_response", response: { subtype: "error", request_id: ev.request_id, error: "Not supported by Alexel Studio." } }).catch(() => {});
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

/** Turn/proses selesai: izin yang belum dijawab kedaluwarsa, alat yang belum selesai ditutup. */
function settleCards(ok = false) {
  for (const m of getState().chat) if (m.perm?.state === "pending") update(m.id, { perm: { ...m.perm, state: "expired" } });
  for (const m of getState().chat) if (m.tool?.status === "running") update(m.id, ok ? { tool: { ...m.tool, status: "ok" } } : { tool: { ...m.tool, status: "error" }, meta: tl("terhenti") });
}

/** Giliran selesai: kartu "berkas berubah" (tinjau / pulihkan) bila agen mengubah berkas. */
function pushChanges(key: string, turnId: string | undefined) {
  if (!turnId || key !== getState().chatKey) return;
  const files = getState().chatTouched[turnId];
  if (!files?.length || getState().chat.some((m) => m.changes?.turnId === turnId)) return;
  push({ role: "changes", text: "", changes: { turnId, key, files } });
  void import("../editor/agentReview").then((m) => m.reviewOpenFiles(files, key));
}

function onResult(key: string, c: Conv, ev: any) {
  const t = c.turn;
  c.turn = null;
  pushChanges(key, t?.id);
  if (key === getState().chatKey) settleCards(!(ev.is_error || String(ev.subtype ?? "").startsWith("error")));
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
  const meta = `${tl("{n} dtk", { n: secs })}${ev.num_turns ? ` · ${tl("{n} langkah", { n: ev.num_turns })}` : ""}`;
  if (ev.is_error || String(ev.subtype ?? "").startsWith("error")) {
    if (ev.subtype === "error_during_execution" && /interrupt/i.test(String(ev.result ?? "")) ) {
      push({ role: "info", text: tl("Dihentikan.") });
      return;
    }
    const text = ev.result || (ev.subtype === "error_max_turns" ? tl("{name} berhenti: batas langkah tercapai.", { name: agentInfo(agentNow()).short }) : tl("{name} berhenti dengan error.", { name: agentInfo(agentNow()).short }));
    const needLogin = isAuthError(text);
    const hint = needLogin ? "\n\n" + tl("Kamu perlu masuk ke {name} dulu. Klik **Masuk** di atas panel.", { name: agentInfo(agentNow()).name }) : "";
    if (needLogin) void detectAgent(agentNow()); // status jadi "belum masuk" → panel menampilkan tombol Masuk
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
  void on<{ chat_key: string; turn_id: string; path: string; created: boolean }>("checkpoint-touched", ({ turn_id, path, created }) => {
    setState((s) => ({ chatTouched: { ...s.chatTouched, [turn_id]: [...(s.chatTouched[turn_id] ?? []).filter((f) => f.path !== path), { path, created }] } }));
  });
  void on<{ run_id: string; code: number | null; stderr: string; replaced?: boolean }>("agent-done", ({ run_id, code, stderr, replaced }) => {
    // Proses lama yang digantikan (mis. effort diganti) tidak memengaruhi percakapan.
    if (replaced) return;
    const c = convs.get(run_id);
    if (c?.cancelTimer) clearTimeout(c.cancelTimer);
    if (c?.turn) pushChanges(run_id, c.turn.id);
    void import("../app/output").then((m) => m.logOutput("Agen AI", `${tl("Proses selesai (kode {code}).", { code: String(code) })}${stderr.trim() ? `\n${stderr.trim()}` : ""}`));
    if (c) {
      c.costBase += c.lastCost;
      c.lastCost = 0;
    }
    if (run_id !== getState().chatKey) {
      convs.delete(run_id);
      return;
    }
    settleCards();
    const wasRunning = getState().chatRunning === run_id;
    if (wasRunning) setState({ chatRunning: null });
    if (c?.closing) return;
    if (code === 130) {
      if (wasRunning) push({ role: "info", text: tl("Dihentikan.") });
    } else if (code !== 0 && wasRunning && !c?.turn?.errored) {
      const name = agentInfo(agentNow()).name;
      const needLogin = isAuthError(stderr);
      const hint = needLogin ? ` ${tl("Kamu perlu masuk ke {name} dulu.", { name })}` : "";
      if (needLogin) void detectAgent(agentNow());
      push({ role: "error", text: `${tl("{name} berhenti (kode {code}).", { name, code: String(code) })}${hint}\n\n${stderr.trim()}`.trim() });
    }
  });
}

// ---------------- Deteksi & login ----------------

/** Teks error yang berarti "belum masuk / kredensial salah" (bukan sekadar kata "auth" di mana saja). */
export const isAuthError = (t: string) =>
  /not authenticated|authentication (required|expired|failed)|not logged in|log(?:ged)? ?in (required|first)|please (log ?in|sign ?in)|invalid api key|api key (is )?(missing|invalid|not set)|\b401\b|unauthori[sz]ed|oauth|authorization code|no controlling terminal|interactive login|silent auth failed|credential/i.test(t);

export async function detectClaude() {
  try {
    setState({ claude: await api.claudeDetect() });
  } catch (e) {
    setState({ claude: { installed: false, error: errMsg(e) } });
  }
}

/** Periksa status agen (terpasang, versi, login). Claude juga mengisi state.claude. */
export async function detectAgent(agent: AgentId = agentNow()) {
  try {
    const st = await api.agentStatus(agent, agent === "acp" ? { command: getState().settings.acpCommand } : undefined);
    if (agent === "claude") setState({ claude: st });
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
  updateSettings({ agent }, { agentSwitched: true });
  setState({ chat: [], chatSession: null, chatRunning: null, chatKey: newChatKey(), chatUsage: null, claudeModels: [], claudeCommands: [], claudeActiveModel: null, agentModes: [] });
  await detectAgent(agent);
}

/** Perintah pemasangan resmi Claude Code untuk OS ini. */
export function installCommand(): string {
  const p = (window as unknown as { nozel?: { platform?: string } }).nozel?.platform;
  return p === "win32" ? "irm https://claude.ai/install.ps1 | iex" : "curl -fsSL https://claude.ai/install.sh | bash";
}

/** Buka terminal yang menjalankan `claude auth login`, lalu periksa ulang setelah selesai. */
const LOGIN_ARGS: Record<AgentId, string> = { claude: "auth login", codex: "login", gemini: "", antigravity: "", acp: "" };

export async function loginClaude() {
  const agent = agentNow();
  if (agent === "gemini" || agent === "acp") {
    toast(tl("Browser akan terbuka untuk masuk. Selesaikan di sana lalu kembali ke sini."), "info");
    try {
      const how = await api.agentLogin(agent, agent === "acp" ? { command: getState().settings.acpCommand } : undefined);
      toast(tl("Berhasil masuk ({how}).", { how }), "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    await detectAgent(agent);
    return;
  }
  const info = getState().agentStatus[agent] ?? (agent === "claude" ? getState().claude : null);
  if (!info?.path) return toast(tl("{name} belum terpasang.", { name: agentInfo(agent).name }));
  const { runInTerminal, shellExe } = await import("../app/run");
  const key = await runInTerminal(`${shellExe(info.path)} ${LOGIN_ARGS[agent]}`.trim(), tl("Masuk ke {name}", { name: agentInfo(agent).short }));
  // Terminal login ditutup → periksa lagi otomatis (agy tetap terbuka sampai Ctrl+D, jadi juga cek saat jendela kembali fokus).
  const unsub = useStore.subscribe((s) => {
    const t = s.terminals.find((x) => x.key === key);
    if (!t || t.status === "exited") {
      unsub();
      void detectAgent(agent);
    }
  });
  toast(
    agent === "antigravity"
      ? tl("Di terminal, pilih \"Continue with Google\" dan selesaikan di browser. Setelah itu tekan Ctrl+D dua kali untuk keluar.")
      : tl("Ikuti langkah masuk di terminal. Setelah selesai, klik Periksa ulang."),
    "info"
  );
}

export async function installClaude() {
  const { runInTerminal } = await import("../app/run");
  await runInTerminal(installCommand(), tl("Pasang Claude Code"));
}

// ---------------- Kirim ----------------

export interface SendOptions {
  includeFile?: boolean;
  includeSelection?: boolean;
  extraContext?: { label: string; body: string };
  /** Konteks tambahan (mis. @problems, @terminal); disusun sebelum permintaan. */
  extraContexts?: { label: string; body: string }[];
  images?: { media_type: string; data: string }[];
}

const MAX_FILE_CHARS = 60_000;

/** Bangun teks persis yang akan dikirim ke CLI. */
export function buildPayload(prompt: string, o: SendOptions): { payload: string; summary: string } {
  const s = getState();
  const parts: string[] = [];
  const summary: string[] = [];
  const tab = activeTab();
  for (const x of [...(o.extraContext ? [o.extraContext] : []), ...(o.extraContexts ?? [])]) {
    parts.push(`### ${x.label}\n${x.body}`);
    summary.push(x.label);
  }
  if (tab?.kind === "text") {
    const rel = s.root ? relative(s.root, tab.id) : tab.id;
    const sel = docs.selectionInfo(s.focusedGroup);
    if (o.includeSelection && sel?.text.trim()) {
      parts.push(`### ${tl("Seleksi dari {file} (baris {from}–{to})", { file: rel, from: sel.from, to: sel.to })}\n\`\`\`\n${sel.text}\n\`\`\``);
      summary.push(`${rel}:${sel.from}-${sel.to}`);
    } else if (o.includeFile) {
      const text = docs.currentText(tab.id) ?? "";
      const cut = text.length > MAX_FILE_CHARS;
      parts.push(`### ${tl("Berkas {file}", { file: rel })}${tab.dirty ? ` ${tl("(belum disimpan)")}` : ""}\n\`\`\`\n${cut ? text.slice(0, MAX_FILE_CHARS) + `\n…${tl("(dipotong)")}` : text}\n\`\`\``);
      summary.push(`${rel}${cut ? ` ${tl("(dipotong)")}` : ""}`);
    }
  }
  if (o.images?.length) summary.push(tl("{n} gambar", { n: o.images.length }));
  const payload = parts.length ? `${parts.join("\n\n")}\n\n### ${tl("Permintaan")}\n${prompt}` : prompt;
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

/** Pilihan Claude yang valid untuk model & CLI saat ini (tidak pernah mengirim yang akan dibuang/ditolak CLI). */
export function effectiveClaudeChoice() {
  const s = getState();
  const c = agentChoice("claude");
  const m = selectedModel(s.claudeModels, c.model);
  const levels = claudeEffortLevels(m, s.claude?.efforts);
  // Effort tersimpan yang tidak didukung model terpilih: jangan dikirim (UI juga menampilkannya "Otomatis").
  const effort = c.effort !== "auto" && levels && levels.includes(c.effort) ? c.effort : null;
  const allowed = claudeModesAvailable(s.claude, m, s.settings.allowDangerousModes).map((x) => x.id as string);
  const mode = allowed.includes(c.mode) ? c.mode : "default";
  const ultracode = s.settings.claudeUltracode && s.claudeUltracodeAvailable && levels !== null;
  return { effort, mode, ultracode };
}

const cfgNow = () => {
  const s = getState();
  const c = agentChoice();
  const claude = s.settings.agent === "claude" ? effectiveClaudeChoice() : null;
  return {
    cwd: s.root ?? "",
    model: c.model === "default" ? null : c.model,
    effort: claude ? claude.effort : c.effort === "auto" ? null : c.effort,
    mode: claude ? claude.mode : c.mode,
    resume: s.chatSession,
    command: s.settings.agent === "acp" ? s.settings.acpCommand : undefined,
    ...(claude ? { ultracode: claude.ultracode, allowDangerous: s.settings.allowDangerousModes } : {}),
  };
};

const warmed = new Set<string>();

/** Claude siap dipakai: mulai prosesnya diam-diam supaya model/Ultracode/mode langsung tampil benar. */
export async function warmClaude() {
  const s = getState();
  const key = s.chatKey;
  if (s.settings.agent !== "claude" || warmed.has(key) || s.chatRunning) return;
  const st = s.claude;
  if (!st?.installed || st.loggedIn === false) return;
  warmed.add(key);
  ensureListeners();
  try {
    await api.agentWarm("claude", key, cfgNow());
  } catch {
    warmed.delete(key); // dicoba lagi lain kali; pesan pertama tetap memulai proses
  }
}

export async function ensureConsent(): Promise<boolean> {
  if (getState().settings.claudeConsent) return true;
  const ok = await ask({
    kind: "confirm",
    title: tl("Pakai agen AI di Alexel Studio?"),
    message: tl(
      "Pesanmu, berkas yang kamu lampirkan, dan berkas yang dibaca agen dikirim ke penyedia agen yang kamu pilih (mis. Anthropic, OpenAI, Google) dengan akunmu sendiri. Di mode Tanya dulu, agen meminta izin di panel ini sebelum mengubah berkas atau menjalankan perintah. Persetujuan ini cukup sekali."
    ),
    okLabel: tl("Setuju"),
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
    toast(tl("{name} masih menjawab. Tunggu atau hentikan dulu.", { name: agentInfo(agentNow()).short }));
    return false;
  }
  setLayout({ right: true, rightView: "claude" });
  const agent = agentNow();
  const name = agentInfo(agent).name;
  if (!getState().agentStatus[agent]?.installed) {
    await detectAgent(agent);
    if (!getState().agentStatus[agent]?.installed) {
      push({ role: "error", text: tl("{name} belum terpasang. Pasang dari panel Ekstensi → Agen AI.", { name }) });
      return false;
    }
  }
  if (getState().agentStatus[agent]?.loggedIn === false) {
    push({ role: "error", text: tl("Kamu belum masuk ke {name}. Klik **Masuk** di panel.", { name }) });
    return false;
  }
  if (!(await ensureConsent())) return false;
  // Slash command CLI (/compact, /review, …) harus dikirim apa adanya: dibungkus konteks, CLI tidak
  // mengenalinya sebagai perintah dan memperlakukannya sebagai teks biasa.
  const slashName = /^\/([A-Za-z][\w:-]*)(?:\s|$)/.exec(prompt.trim())?.[1];
  const cliSlash = (agent === "claude" || agent === "gemini" || agent === "acp") && !!slashName && getState().claudeCommands.some((c) => c.name === slashName);
  if (!cliSlash) {
    const { resolveMentions } = await import("./mentions");
    const mentioned = await resolveMentions(prompt);
    if (mentioned.length) o = { ...o, extraContexts: [...(o.extraContexts ?? []), ...mentioned] };
    if (pendingNote) o = { ...o, extraContexts: [...(o.extraContexts ?? []), { label: tl("Catatan dari editor"), body: pendingNote }] };
  }
  const { payload, summary } = cliSlash ? { payload: prompt.trim(), summary: "" } : buildPayload(prompt, o);
  if (getState().settings.claudeConfirm) {
    const ok = await ask({
      kind: "confirm",
      title: tl("Kirim ke {name}?", { name }),
      message: summary ? tl("Ikut dikirim: {summary}. Isi lengkapnya ada di bawah.", { summary }) : tl("Hanya pesanmu yang dikirim."),
      detail: payload,
      okLabel: tl("Kirim"),
    });
    if (ok !== true) return false;
  }
  ensureListeners();
  const key = getState().chatKey;
  const c = conv(key);
  c.turn = newTurn();
  push({ role: "user", text: prompt, context: summary || undefined, images: o.images?.length || undefined, turn: { id: c.turn.id, key } });
  setState({ chatRunning: key });
  const content: ClaudeContent[] = [
    ...(o.images ?? []).map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.media_type, data: im.data } })),
    { type: "text", text: payload || "(lihat gambar)" },
  ];
  try {
    await api.agentSend(agentNow(), key, { ...cfgNow(), turnId: c.turn.id }, content);
    pendingNote = null;
    return true;
  } catch (e) {
    c.turn = null;
    setState({ chatRunning: null });
    push({ role: "error", text: errMsg(e) });
    return false;
  }
}

/** Kembalikan berkas ke keadaan sebelum giliran ini (dan semua giliran sesudahnya). */
export async function restoreTurn(turn: { id: string; key: string }, paths?: string[]) {
  const root = getState().root;
  if (!root) return;
  if (getState().chatRunning) return toast(tl("Tunggu agen selesai dulu."));
  const list = await api.checkpointList(root, turn.key).catch(() => []);
  const from = list.findIndex((t) => t.turnId === turn.id);
  if (from < 0) return toast(tl("Tidak ada berkas yang diubah sejak pesan ini."));
  const files = [...new Set(list.slice(from).flatMap((t) => t.files.map((f) => f.path)))].filter((p) => !paths || paths.includes(p));
  const rel = (p: string) => relative(root, uiPath(p));
  const ok = await ask({
    kind: "confirm",
    title: tl("Pulihkan {n} berkas?", { n: files.length }),
    message: tl("Berkas dikembalikan ke keadaan sebelum pesan ini. Berkas buatan agen dipindah ke Trash. Isi sekarang tetap tersimpan di panel Riwayat. Perubahan lewat perintah terminal tidak ikut dipulihkan."),
    detail: files.map(rel).join("\n"),
    okLabel: tl("Pulihkan"),
    danger: true,
  });
  if (ok !== true) return;
  try {
    const r = await api.checkpointRestore(root, turn.key, turn.id, paths);
    for (const p of [...r.restored, ...r.removed]) await docs.reloadFromDisk(uiPath(p)).catch(() => {});
    void import("../editor/agentReview").then((m) => [...r.restored, ...r.removed].forEach((p) => m.stopReview(uiPath(p))));
    setState((s) => ({ chat: s.chat.map((m) => (m.changes && list.slice(from).some((t) => t.turnId === m.changes!.turnId) ? { ...m, changes: { ...m.changes, restored: true } } : m)) }));
    const n = r.restored.length + r.removed.length;
    push({ role: "info", text: tl("{n} berkas dipulihkan ke sebelum pesan ini.", { n }) + (r.failed.length ? ` ${tl("Gagal: {list}", { list: r.failed.map(rel).join(", ") })}` : "") });
    pendingNote = tl("Catatan: pengguna memulihkan {files} ke keadaan sebelum salah satu pesan sebelumnya. Baca ulang berkas itu sebelum mengubahnya.", { files: files.map(rel).join(", ") });
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

/** Tinjau perubahan agen di editor (diff per bagian). */
export async function reviewTurn(files: { path: string; created: boolean }[], key: string) {
  const { reviewFile } = await import("../editor/agentReview");
  let any = false;
  for (const f of files) if (await reviewFile(uiPath(f.path), { chatKey: key, quiet: files.length > 1 })) any = true;
  if (!any && files.length > 1) toast(tl("Tidak ada perubahan agen yang bisa ditinjau."));
}

/** Catatan untuk agen di pesan berikutnya (mis. berkas dipulihkan). */
let pendingNote: string | null = null;

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
  if (decision === "deny") response = { behavior: "deny", message: opts.reason?.trim() || "The user denied this request." };
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
  const path = uiPath(String(input.file_path ?? ""));
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

/** Effort diterapkan langsung ke sesi yang berjalan (apply_flag_settings); tanpa memulai ulang proses. */
export async function setClaudeEffort(effort: string) {
  await savePref("effort", effort);
  if (agentNow() !== "claude") return;
  const next = effectiveClaudeChoice().effort;
  await api.agentControl(agentNow(), getState().chatKey, { type: "control_request", request: { subtype: "apply_flag_settings", settings: { effortLevel: next } } }).catch(() => false);
}

/** Ultracode: saklar sesi di bawah Effort. Berlaku langsung bila sesi berjalan, dan untuk sesi berikutnya. */
export async function setClaudeUltracode(on: boolean) {
  const { updateSettings } = await import("../app/actions");
  updateSettings({ claudeUltracode: on });
  await api.agentControl("claude", getState().chatKey, { type: "control_request", request: { subtype: "apply_flag_settings", settings: { ultracode: on ? true : null } } }).catch(() => false);
}

/** Mode izin yang bisa dipilih agen terpilih saat ini (Claude: dibatasi CLI, model, dan izin mode berbahaya). */
export function modesAvailable(agent = agentNow()) {
  const s = getState();
  if (agent === "claude") return claudeModesAvailable(s.claude, selectedModel(s.claudeModels, s.settings.claudeModel), s.settings.allowDangerousModes);
  const base = agentInfo(agent).caps.modes;
  const modes = base.length ? base : s.agentModes;
  // Modes "tanpa bertanya" (yolo, full access, bypass) hanya bila diizinkan di Pengaturan → Izinkan mode berbahaya.
  return s.settings.allowDangerousModes ? modes : modes.filter((m) => !/yolo|bypass|danger|full-?access/i.test(m.id));
}

export function cycleClaudeMode() {
  // Mode berbahaya tidak ikut siklus Shift+Tab: harus dipilih sengaja dari pemilih.
  const order = modesAvailable().map((m) => m.id).filter((id) => id !== "bypassPermissions");
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
        // Penanda permintaan ditulis dalam bahasa UI saat dikirim (sesi lama: Indonesia).
        const m = /### (?:Permintaan|Request)\n(?![\s\S]*### (?:Permintaan|Request)\n)/.exec(text);
        push({ role: "user", text: m ? text.slice(m.index + m[0].length) : text, context: m ? tl("konteks") : undefined, images: images || undefined });
      }
      if (Array.isArray(content) && content.some((p: any) => p?.type === "tool_result")) onUser(c, ev.message);
    }
  }
  for (const m of getState().chat) if (m.tool?.status === "running") update(m.id, { tool: { ...m.tool, status: "ok" } });
  push({ role: "info", text: tl("Percakapan dilanjutkan. Pesan berikutnya meneruskan sesi ini.") });
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
  await sendToClaude(`${tl("Jelaskan kenapa error ini muncul dan beri perbaikan yang tepat.")}\n\n${tl("Error di {loc}", { loc: `${rel}:${p.line}:${p.col}` })} — ${p.message}`, {
    extraContext: { label: tl("Potongan {file} sekitar baris {line}", { file: rel, line: p.line }), body: "```\n" + excerpt(text, p.line) + "\n```" },
  });
}

/** "Perbaiki dengan AI": minta agen memperbaiki error langsung di berkasnya. */
export async function fixProblemWithAgent(path: string, p: Problem) {
  const root = getState().root ?? "";
  const text = docs.currentText(path) ?? "";
  const rel = relative(root, path);
  const what = p.message ? `${tl("Error di {loc}", { loc: `${rel}:${p.line}:${p.col}` })} — ${p.message}` : `${rel}:${p.line}`;
  await sendToClaude(`${tl("Perbaiki masalah ini langsung di berkasnya. Ubah seperlunya saja, lalu jelaskan singkat apa yang diubah.")}\n\n${what}`, {
    extraContext: { label: tl("Potongan {file} sekitar baris {line}", { file: rel, line: p.line }), body: "```\n" + excerpt(text, p.line) + "\n```" },
    includeFile: false,
  });
}

/** "Claude jelaskan error" dari terminal / run yang gagal. */
export async function explainTerminal(key: string) {
  const { recentOutput } = await import("../terminal/terminals");
  const sess = getState().terminals.find((t) => t.key === key);
  const out = recentOutput(key, 6000);
  if (!out) return toast(tl("Belum ada output untuk dijelaskan."));
  await sendToClaude(tl("Jelaskan error di output terminal ini dan cara memperbaikinya."), {
    extraContext: {
      label: `${tl("Output terminal")}${sess?.command ? ` ${tl("dari {cmd}", { cmd: `\`${sess.command}\`` })}` : ""}${sess?.exitCode != null ? ` ${tl("(kode keluar {code})", { code: sess.exitCode })}` : ""}`,
      body: "```\n" + out + "\n```",
    },
    includeFile: false,
  });
}

export function explainSelection() {
  const tab = activeTab();
  if (!tab) return;
  void sendToClaude(tl("Jelaskan kode ini secara singkat dan beri saran perbaikan kalau ada."), { includeSelection: true, includeFile: true });
}

/** Ganti seluruh isi berkas aktif dengan kode dari jawaban Claude (dibandingkan dulu). */
export async function applyCodeToActive(code: string) {
  const tab = activeTab();
  if (!tab || tab.kind !== "text") return toast(tl("Buka berkas tujuan dulu."));
  const { openCompare } = await import("../panels/compare");
  openCompare({
    title: tl("Terapkan kode agen ke {file}?", { file: basename(tab.id) }),
    leftLabel: tl("Sekarang"),
    rightLabel: tl("Usulan agen"),
    left: docs.currentText(tab.id) ?? "",
    right: code,
    acceptLabel: tl("Terapkan"),
    onAccept: () => docs.setDocumentText(tab.id, code),
  });
}
