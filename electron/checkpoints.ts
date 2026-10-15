// Checkpoint agen: isi berkas sebelum agen mengubahnya, per giliran (turn), supaya pengguna bisa
// memulihkan berkas ke keadaan sebelum pesan tertentu.
//
// Semua driver menulis event berbentuk stream-json Claude ke kanal `agent-event`; checkpoint
// membaca event itu (lihat wrapCtx di agents/index.ts) dan menyalin isi berkas secara sinkron
// begitu path-nya diketahui, sebelum agen sempat menulis:
// - Claude: `content_block_start` tool_use + `input_json_delta` (file_path datang sebelum isi),
//   cadangan: blok tool_use lengkap / permintaan izin `can_use_tool`.
// - Codex: tool_use ApplyPatch dari `item/started` (input.changes[].path).
// - ACP (Gemini): tool_use dengan input.before = isi lama persis dari agen.
// - Antigravity: tool_use saat langkah dimulai.
// Perubahan lewat perintah shell (Bash) tidak terlihat dan tidak dicatat.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { deleteEntry, writeText } from "./fsOps";
import { snapshot } from "./history";
import { isWithin, type Ctx } from "./util";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TURNS_PER_CHAT = 60;
const ID_RE = /^[A-Za-z0-9-]{1,80}$/;
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit", "ApplyPatch"]);

export interface CheckpointFile {
  path: string;
  /** Berkas sudah ada sebelum agen menyentuhnya (false = dibuat agen). */
  existed: boolean;
  /** "disk" = dibaca langsung; "agent" = isi lama dari agen (ACP). */
  source: "disk" | "agent";
}

interface Manifest {
  turnId: string;
  chatKey: string;
  time: number;
  root: string;
  files: CheckpointFile[];
}

interface Active {
  ctx: Ctx;
  dir: string;
  manifest: Manifest;
  seen: Set<string>;
  /** Blok tool_use yang sedang mengalir (Claude partial messages): index → nama & JSON parsial. */
  blocks: Map<number, { name: string; buf: string; done: boolean }>;
}

const active = new Map<string, Active>();
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
const chatDir = (ctx: Ctx, root: string, chatKey: string) => path.join(ctx.userData, "checkpoints", hash(path.resolve(root)), chatKey);

function readSmallText(p: string): string | null {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    const buf = fs.readFileSync(p);
    if (buf.subarray(0, 8000).includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

/** Giliran baru dimulai (pengguna mengirim pesan). */
export function beginTurn(ctx: Ctx, chatKey: string, turnId: unknown, root: unknown) {
  endTurn(chatKey);
  if (typeof turnId !== "string" || !ID_RE.test(turnId) || !ID_RE.test(chatKey) || typeof root !== "string" || !root || !fs.existsSync(root)) return;
  const dir = path.join(chatDir(ctx, root, chatKey), turnId);
  active.set(chatKey, { ctx, dir, manifest: { turnId, chatKey, time: Date.now(), root: path.resolve(root), files: [] }, seen: new Set(), blocks: new Map() });
  prune(ctx, root, chatKey);
}

/** Akhir giliran: isi sesudah perubahan dicatat di riwayat berkas (panel Riwayat). */
export function endTurn(chatKey: string) {
  const a = active.get(chatKey);
  if (!a) return;
  active.delete(chatKey);
  for (const f of a.manifest.files) {
    const now = readSmallText(f.path);
    if (now !== null) snapshot(a.ctx, f.path, now);
  }
}

function record(a: Active, raw: unknown, before?: unknown) {
  if (typeof raw !== "string" || !raw) return;
  const abs = path.resolve(a.manifest.root, raw);
  if (!isWithin(a.manifest.root, abs) || a.seen.has(abs)) return;
  a.seen.add(abs);
  // Belum pernah dicatat di giliran sebelumnya pun tidak masalah: tiap giliran menyimpan keadaannya sendiri.
  let content: string | null = null;
  let existed = fs.existsSync(abs);
  let source: CheckpointFile["source"] = "disk";
  if (typeof before === "string") {
    // ACP mengirim isi lama persis; dipakai bila agen mungkin sudah menulis duluan.
    content = before;
    existed = existed || before !== "";
    source = "agent";
  } else if (existed) {
    content = readSmallText(abs);
    if (content === null) return; // biner / terlalu besar: tidak bisa dipulihkan, lewati
  }
  try {
    fs.mkdirSync(path.join(a.dir, "pre"), { recursive: true });
    if (existed && content !== null) fs.writeFileSync(path.join(a.dir, "pre", `${hash(abs)}.txt`), content);
    a.manifest.files.push({ path: abs, existed, source });
    fs.writeFileSync(path.join(a.dir, "manifest.json"), JSON.stringify(a.manifest));
    a.ctx.emit("checkpoint-touched", { chat_key: a.manifest.chatKey, turn_id: a.manifest.turnId, path: abs, created: !existed });
  } catch {
    /* checkpoint gagal tidak boleh mengganggu agen */
  }
}

const FILE_RE = /"(?:file_path|notebook_path)"\s*:\s*"((?:[^"\\]|\\.)*)"/;

function fromInput(a: Active, name: unknown, input: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof name !== "string" || !EDIT_TOOLS.has(name) || !input || typeof input !== "object") return;
  if (Array.isArray(input.changes)) for (const c of input.changes) record(a, c?.path);
  record(a, input.file_path ?? input.notebook_path, input.before);
}

/** Satu baris event agen (format stream-json Claude). Dipanggil sebelum diteruskan ke renderer. */
export function observe(chatKey: string, line: string) {
  const a = active.get(chatKey);
  if (!a) return;
  let ev: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  if (ev?.type === "stream_event") {
    const e = ev.event;
    if (e?.type === "content_block_start" && e.content_block?.type === "tool_use" && EDIT_TOOLS.has(e.content_block.name)) {
      a.blocks.set(e.index, { name: e.content_block.name, buf: "", done: false });
    } else if (e?.type === "content_block_delta" && e.delta?.type === "input_json_delta") {
      const b = a.blocks.get(e.index);
      if (!b || b.done) return;
      b.buf += e.delta.partial_json ?? "";
      const m = FILE_RE.exec(b.buf);
      if (m) {
        b.done = true;
        try {
          record(a, JSON.parse(`"${m[1]}"`));
        } catch {
          /* string JSON rusak */
        }
      }
    } else if (e?.type === "message_start") a.blocks.clear();
    return;
  }
  if (ev?.type === "assistant" && Array.isArray(ev.message?.content)) {
    for (const c of ev.message.content) if (c?.type === "tool_use") fromInput(a, c.name, c.input);
    return;
  }
  if (ev?.type === "control_request" && ev.request?.subtype === "can_use_tool") {
    fromInput(a, ev.request.tool_name, ev.request.input);
    return;
  }
  if (ev?.type === "result") endTurn(chatKey);
}

// ---------------- Daftar, isi lama, pulihkan ----------------

function manifests(ctx: Ctx, root: string, chatKey: string): (Manifest & { dir: string })[] {
  if (!ID_RE.test(chatKey)) throw new Error("Percakapan tidak valid.");
  const base = chatDir(ctx, root, chatKey);
  let names: string[] = [];
  try {
    names = fs.readdirSync(base);
  } catch {
    return [];
  }
  const out: (Manifest & { dir: string })[] = [];
  for (const n of names) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(base, n, "manifest.json"), "utf8")) as Manifest;
      if (m.files?.length) out.push({ ...m, dir: path.join(base, n) });
    } catch {
      /* giliran tanpa perubahan berkas */
    }
  }
  return out.sort((x, y) => x.time - y.time);
}

function prune(ctx: Ctx, root: string, chatKey: string) {
  const base = chatDir(ctx, root, chatKey);
  let names: string[];
  try {
    names = fs.readdirSync(base);
  } catch {
    return;
  }
  if (names.length <= MAX_TURNS_PER_CHAT) return;
  const byTime = names.map((n) => ({ n, t: fs.statSync(path.join(base, n)).mtimeMs })).sort((a, b) => a.t - b.t);
  for (const x of byTime.slice(0, names.length - MAX_TURNS_PER_CHAT)) fs.rmSync(path.join(base, x.n), { recursive: true, force: true });
}

/** Giliran yang punya checkpoint di percakapan ini, beserta berkas yang diubah. */
export function checkpointList(ctx: Ctx, root: string, chatKey: string) {
  return manifests(ctx, root, chatKey).map((m) => ({ turnId: m.turnId, time: m.time, files: m.files.map((f) => ({ path: f.path, created: !f.existed })) }));
}

/** Isi berkas sebelum giliran terakhir yang mengubahnya (untuk review diff). null = berkas baru. */
export function checkpointPre(ctx: Ctx, root: string, chatKey: string, file: string): { content: string | null; turnId: string } | null {
  const abs = path.resolve(file);
  const ms = manifests(ctx, root, chatKey);
  for (let i = ms.length - 1; i >= 0; i--) {
    const f = ms[i].files.find((x) => x.path === abs);
    if (!f) continue;
    if (!f.existed) return { content: null, turnId: ms[i].turnId };
    try {
      return { content: fs.readFileSync(path.join(ms[i].dir, "pre", `${hash(abs)}.txt`), "utf8"), turnId: ms[i].turnId };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Kembalikan berkas ke keadaan sebelum giliran `turnId`: untuk tiap berkas yang diubah di giliran
 * itu atau sesudahnya, isi paling awal dipakai. Berkas buatan agen dipindah ke Trash.
 * Penulisan lewat writeText, jadi isi sebelum dipulihkan tetap ada di panel Riwayat.
 */
export async function checkpointRestore(ctx: Ctx, root: string, chatKey: string, turnId: string, only?: string[] | null) {
  const ms = manifests(ctx, root, chatKey);
  const from = ms.findIndex((m) => m.turnId === turnId);
  if (from < 0) throw new Error("Checkpoint tidak ditemukan.");
  const filter = only?.length ? new Set(only.map((p) => path.resolve(p))) : null;
  const earliest = new Map<string, { f: CheckpointFile; dir: string }>();
  for (const m of ms.slice(from)) for (const f of m.files) if (!earliest.has(f.path) && (!filter || filter.has(f.path))) earliest.set(f.path, { f, dir: m.dir });
  const restored: string[] = [];
  const removed: string[] = [];
  const failed: string[] = [];
  for (const [p, { f, dir }] of earliest) {
    if (!isWithin(root, p)) continue;
    try {
      if (f.existed) {
        const before = fs.readFileSync(path.join(dir, "pre", `${hash(p)}.txt`), "utf8");
        const now = readSmallText(p);
        if (now !== null) snapshot(ctx, p, now);
        if (now !== before) {
          fs.mkdirSync(path.dirname(p), { recursive: true });
          await writeText(ctx, p, before);
        }
        restored.push(p);
      } else if (fs.existsSync(p)) {
        await deleteEntry(ctx, p);
        removed.push(p);
      }
    } catch {
      failed.push(p);
    }
  }
  return { restored, removed, failed };
}

export const _test = { active, readSmallText };
