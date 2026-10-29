// AI untuk database: bahasa alami → query, jelaskan, optimalkan. Yang dikirim ke agen hanya skema
// (nama tabel/kolom/tipe/relasi) dan teks query; tidak ada isi data atau password. Query hasil AI
// selalu ditampilkan dulu, tidak pernah dijalankan otomatis.

import type { DbKind } from "../../electron/db/types";
import { api, errMsg } from "../lib/ipc";
import { ask, getState, toast } from "../state/store";
import { tl } from "../i18n";
import { connById, KIND_LABEL } from "./state";

const LANG: Record<DbKind, string> = { postgres: "sql", mysql: "sql", sqlite: "sql", mongodb: "javascript", redis: "text" };
const SYNTAX: Record<DbKind, string> = {
  postgres: "PostgreSQL SQL",
  mysql: "MySQL 8 SQL",
  sqlite: "SQLite SQL",
  mongodb: "perintah shell MongoDB satu baris, mis. db.koleksi.find({...}).sort({...}).limit(n) atau db.koleksi.aggregate([...])",
  redis: "perintah redis-cli, satu per baris",
};

/** Ambil blok kode pertama dari jawaban agen (atau seluruh teks bila tanpa blok). */
export function extractCode(text: string): string {
  const m = /```[\w-]*\n([\s\S]*?)```/.exec(text);
  return (m ? m[1] : text).trim();
}

let running: string | null = null;
export const aiBusy = () => running !== null;
export function cancelAi() {
  if (running) void api.agentOnceCancel(running);
  running = null;
}

async function runAgent(prompt: string, title: string): Promise<string | null> {
  const { ensureConsent, agentNow } = await import("../claude/claude");
  if (!(await ensureConsent())) return null;
  if (getState().settings.claudeConfirm && !(await ask({ kind: "confirm", title, message: tl("Teks berikut dikirim ke agen AI (skema saja, tanpa data)."), detail: prompt, okLabel: tl("Kirim") }))) return null;
  const runId = `db-${Date.now().toString(36)}`;
  running = runId;
  try {
    return await api.agentOnce(agentNow(), runId, getState().root ?? "", prompt);
  } catch (e) {
    if (!/Dibatalkan/.test(errMsg(e))) toast(errMsg(e), "error");
    return null;
  } finally {
    if (running === runId) running = null;
  }
}

const schemaFor = (id: string) => api.dbSchemaText(id, 12_000).catch(() => "");

/** Pertanyaan bahasa alami → query (belum dijalankan). */
export async function askData(connId: string, question: string): Promise<string | null> {
  const c = connById(connId);
  if (!c) return null;
  const schema = await schemaFor(connId);
  const prompt = [
    `Kamu membantu menulis query untuk database ${KIND_LABEL[c.kind]}${c.readOnly ? " (koneksi read-only: hanya query baca)" : ""}.`,
    `Tulis SATU query (${SYNTAX[c.kind]}) yang menjawab permintaan berikut. Jawab hanya dengan satu blok kode \`\`\`${LANG[c.kind]}\`\`\` tanpa penjelasan.`,
    "Batasi hasil (LIMIT 100 atau setara) kecuali diminta lain. Jangan menulis query yang mengubah/menghapus data kecuali diminta secara eksplisit.",
    "",
    "Skema:",
    "```",
    schema,
    "```",
    "",
    `Permintaan: ${question.trim()}`,
  ].join("\n");
  const out = await runAgent(prompt, tl("Kirim pertanyaan ke agen AI?"));
  return out ? extractCode(out) : null;
}

/** Jelaskan query (teks penjelasan, markdown). */
export async function explainQuery(connId: string, query: string): Promise<string | null> {
  const c = connById(connId);
  if (!c) return null;
  const prompt = [`Jelaskan singkat dan jelas apa yang dilakukan query ${KIND_LABEL[c.kind]} ini, langkah demi langkah, dan sebutkan risiko/efek sampingnya bila ada. Jawab dalam bahasa ${getState().settings.language === "en" ? "Inggris" : "Indonesia"}.`, "", "Skema:", "```", await schemaFor(connId), "```", "", "Query:", "```", query, "```"].join("\n");
  return runAgent(prompt, tl("Kirim query ke agen AI?"));
}

/** Versi query yang lebih cepat + saran index, sebagai teks (blok kode berisi query baru). */
export async function optimizeQuery(connId: string, query: string): Promise<string | null> {
  const c = connById(connId);
  if (!c) return null;
  const prompt = [`Optimalkan query ${KIND_LABEL[c.kind]} berikut tanpa mengubah hasilnya. Berikan query baru dalam satu blok kode \`\`\`${LANG[c.kind]}\`\`\`, lalu daftar singkat alasan dan index yang disarankan (sebagai CREATE INDEX, jangan dijalankan). Jawab dalam bahasa ${getState().settings.language === "en" ? "Inggris" : "Indonesia"}.`, "", "Skema:", "```", await schemaFor(connId), "```", "", "Query:", "```", query, "```"].join("\n");
  return runAgent(prompt, tl("Kirim query ke agen AI?"));
}
