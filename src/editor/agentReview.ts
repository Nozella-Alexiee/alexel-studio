// Tinjau perubahan agen di editor: bagian yang diubah agen ditandai (baris lama merah, baru hijau),
// dengan tombol Terima/Tolak per bagian, plus "Terima semua / Tolak semua" di atas editor.
// Pembanding = isi berkas sebelum giliran agen (dari checkpoint), jadi berlaku untuk semua agen dan
// semua mode izin. Menolak bagian mengembalikan teks itu lalu menyimpan berkas.

import { acceptChunk, getChunks, rejectChunk, unifiedMergeView } from "@codemirror/merge";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, showPanel, type Panel } from "@codemirror/view";
import { tl } from "../i18n";
import { api, errMsg } from "../lib/ipc";
import { prettyKeys } from "../lib/keys";
import { basename } from "../lib/paths";
import { getState, toast } from "../state/store";
import * as docs from "./documents";

/** Berkas >600 KB tidak ditinjau (diff besar memperlambat editor). */
const MAX_REVIEW_CHARS = 600_000;

interface Review {
  path: string;
  /** Kunci percakapan & giliran asal checkpoint (untuk "Tolak semua"). */
  chatKey: string;
  turnId: string;
  created: boolean;
}

const reviews = new Map<string, Review>();
export const isReviewing = (path: string) => reviews.has(path);

function control(type: "accept" | "reject", action: (e: MouseEvent) => void): HTMLElement {
  const b = document.createElement("button");
  b.className = `cm-ai-chip ${type === "accept" ? "is-ok" : "is-no"}`;
  b.textContent = type === "accept" ? tl("Terima") : tl("Tolak");
  b.title = type === "accept" ? tl("Pertahankan perubahan ini") : tl("Kembalikan bagian ini");
  b.addEventListener("mousedown", (e) => {
    e.preventDefault();
    action(e);
  });
  return b;
}

function chunkCount(view: EditorView): number {
  return getChunks(view.state)?.chunks.length ?? 0;
}

function reviewPanel(r: Review) {
  return showPanel.of((view): Panel => {
    const dom = document.createElement("div");
    dom.className = "cm-agent-review";
    const label = document.createElement("span");
    label.className = "cm-agent-review-label";
    const accept = document.createElement("button");
    accept.className = "cm-ai-btn is-primary";
    accept.textContent = tl("Terima semua");
    accept.title = prettyKeys("Mod+Enter");
    accept.addEventListener("mousedown", (e) => e.preventDefault());
    accept.addEventListener("click", () => stopReview(r.path));
    const reject = document.createElement("button");
    reject.className = "cm-ai-btn";
    reject.textContent = tl("Tolak semua");
    reject.addEventListener("mousedown", (e) => e.preventDefault());
    reject.addEventListener("click", () => void rejectAll(r.path));
    const nav = document.createElement("span");
    nav.className = "cm-agent-review-hint";
    nav.textContent = tl("Perubahan agen");
    dom.append(nav, label, accept, reject);
    const sync = () => {
      const n = chunkCount(view);
      label.textContent = tl("{n} bagian berubah", { n });
    };
    sync();
    return { top: true, dom, update: sync };
  });
}

function reviewExtension(r: Review, original: string): Extension {
  return [
    unifiedMergeView({ original, mergeControls: control, gutter: true, syntaxHighlightDeletions: true, collapseUnchanged: undefined }),
    reviewPanel(r),
    Prec.high(
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            stopReview(r.path);
            return true;
          },
        },
      ])
    ),
    EditorView.updateListener.of((u) => {
      // Tolak bagian = teks dikembalikan → simpan diam-diam supaya disk sama dengan editor.
      if (u.transactions.some((t) => t.isUserEvent("revert"))) void docs.saveDocument(r.path, { quiet: true });
      if (u.docChanged || u.transactions.some((t) => t.isUserEvent("accept") || t.isUserEvent("revert"))) {
        if (getChunks(u.state)?.chunks.length === 0) queueMicrotask(() => stopReview(r.path));
      }
    }),
  ];
}

/** Mulai tinjauan untuk berkas yang sudah terbuka di editor. */
function startReview(r: Review, original: string): boolean {
  const current = docs.currentText(r.path);
  if (current == null || current === original) return false;
  if (current.length > MAX_REVIEW_CHARS || original.length > MAX_REVIEW_CHARS) return false;
  if (getState().tabs[r.path]?.dirty) return false;
  reviews.set(r.path, r);
  docs.setReviewExtension(r.path, reviewExtension(r, original));
  return true;
}

export function stopReview(path: string) {
  if (!reviews.delete(path)) return;
  docs.setReviewExtension(path, null);
}

async function rejectAll(path: string) {
  const r = reviews.get(path);
  const root = getState().root;
  if (!r || !root) return;
  try {
    await api.checkpointRestore(root, r.chatKey, r.turnId, [path]);
    stopReview(path);
    if (r.created) {
      const { closeTabEverywhere } = await import("../app/actions");
      closeTabEverywhere(path);
    } else await docs.reloadFromDisk(path);
    toast(tl("Perubahan agen di {name} ditolak.", { name: basename(path) }), "info");
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

/**
 * Buka berkas lalu tinjau perubahan agen terhadap isinya sebelum giliran terakhir.
 * `quiet`: dipanggil otomatis di akhir giliran (tanpa toast bila tidak ada yang ditinjau).
 */
export async function reviewFile(path: string, opts: { chatKey?: string; quiet?: boolean; open?: boolean } = {}): Promise<boolean> {
  const root = getState().root;
  if (!root) return false;
  const chatKey = opts.chatKey ?? getState().chatKey;
  const pre = await api.checkpointPre(root, chatKey, path).catch(() => null);
  if (!pre) {
    if (!opts.quiet) toast(tl("Tidak ada checkpoint untuk {name}.", { name: basename(path) }));
    return false;
  }
  if (opts.open !== false) {
    const { openFile } = await import("../app/actions");
    await openFile(path);
  }
  if (!docs.getDoc(path)) return false;
  // Pastikan editor memuat isi terbaru dari disk (tulisan agen bisa lebih baru dari event watcher).
  if (!getState().tabs[path]?.dirty) await docs.externalChange(path);
  stopReview(path);
  const ok = startReview({ path, chatKey, turnId: pre.turnId, created: pre.content === null }, pre.content ?? "");
  if (!ok && !opts.quiet) toast(getState().tabs[path]?.dirty ? tl("Simpan atau buang editanmu di {name} dulu.", { name: basename(path) }) : tl("Tidak ada perubahan agen di {name}.", { name: basename(path) }));
  return ok;
}

/** Akhir giliran agen: berkas yang sedang terbuka langsung ditinjau (bila diaktifkan di Pengaturan). */
export async function reviewOpenFiles(files: { path: string }[], chatKey: string) {
  if (!getState().settings.agentReview) return;
  // Event watcher untuk tulisan terakhir agen bisa datang sesaat setelah giliran selesai.
  await new Promise((r) => setTimeout(r, 400));
  for (const f of files) if (docs.getDoc(f.path)) await reviewFile(f.path, { chatKey, quiet: true, open: false });
}

export const _test = { reviewExtension, chunkCount, acceptChunk, rejectChunk };
