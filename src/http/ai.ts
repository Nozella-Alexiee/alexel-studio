// AI: buat request .http dari kode rute (Express, FastAPI, Laravel, Next.js, …) yang dipilih atau
// berkas aktif. Hasil ditulis ke .alexel/http/<berkas>.http lalu dibuka; tidak ada yang dikirim otomatis.

import { openFile } from "../app/actions";
import * as docs from "../editor/documents";
import { api, errMsg } from "../lib/ipc";
import { basename, join, relative } from "../lib/paths";
import { activeTab, ask, getState, toast } from "../state/store";
import { tl } from "../i18n";
import { extractCode } from "../db/ai";
import { envValues } from "./state";

export async function requestsFromCode() {
  const tab = activeTab();
  const root = getState().root;
  if (!tab || tab.kind !== "text" || !root) return toast(tl("Buka berkas kode rute API dulu."));
  const group = getState().focusedGroup;
  const sel = docs.selectionText(group).trim();
  const code = (sel || docs.currentText(tab.id) || "").slice(0, 30_000);
  if (!code.trim()) return toast(tl("Berkas kosong."));
  const { ensureConsent, agentNow } = await import("../claude/claude");
  if (!(await ensureConsent())) return;
  const host = envValues().host ?? envValues().baseUrl ?? "http://localhost:3000";
  const prompt = [
    "Buat berkas .http (sintaks REST Client VS Code) untuk SEMUA endpoint HTTP yang didefinisikan di kode berikut.",
    "Aturan: pisahkan tiap request dengan `###` + judul singkat; baris pertama berkas `@host = " + host + "` lalu pakai {{host}};",
    "beri `# @name` untuk request login/pembuatan token; isi body JSON contoh yang masuk akal sesuai validasi di kode;",
    "untuk token pakai `Authorization: Bearer {{$secret TOKEN}}` (jangan menulis rahasia asli).",
    "Jawab hanya dengan satu blok kode ```http.",
    "",
    `Berkas: ${relative(root, tab.id)}`,
    "```",
    code,
    "```",
  ].join("\n");
  if (getState().settings.claudeConfirm && !(await ask({ kind: "confirm", title: tl("Kirim kode ke agen AI?"), message: tl("Kode berikut dikirim untuk membuat request API."), detail: prompt, okLabel: tl("Kirim") }))) return;
  const done = (await import("../state/store")).stickyToast(tl("AI sedang membuat request dari {name}…", { name: tab.name }));
  try {
    const out = extractCode(await api.agentOnce(agentNow(), `http-${Date.now().toString(36)}`, root, prompt));
    if (!/^\s*(@|###|#|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|https?:)/m.test(out)) throw new Error(tl("Agen tidak mengembalikan request yang valid."));
    const target = join(root, ".alexel", "http", `${basename(tab.id).replace(/\.[^.]+$/, "")}.http`);
    const old = await api.readText(target).then((f) => f.content).catch(() => "");
    await api.writeText(target, old.trim() ? `${old.replace(/\s*$/, "")}\n\n${out}\n` : `${out}\n`);
    await openFile(target);
    toast(tl("Request dibuat. Periksa, lalu klik ▶ Kirim request."), "success");
  } catch (e) {
    if (!/Dibatalkan/.test(errMsg(e))) toast(errMsg(e), "error");
  } finally {
    done();
  }
}
