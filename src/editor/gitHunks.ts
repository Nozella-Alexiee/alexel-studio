// Aksi per bagian perubahan dari gutter git: stage bagian ini, kembalikan bagian ini, lihat diff.

import type { EditorView } from "@codemirror/view";
import { openMenu } from "../components/Overlays";
import { hunkAtLine, hunkPatch } from "../lib/diff";
import { api, errMsg } from "../lib/ipc";
import { getState, toast } from "../state/store";
import { tl } from "../i18n";

function relTo(root: string, path: string): string | null {
  const r = root.replace(/[\\/]+$/, "");
  if (!path.startsWith(r + "/") && !path.startsWith(r + "\\")) return null;
  return path.slice(r.length + 1).replace(/\\/g, "/");
}

/** Klik penanda gutter di baris `line`: tampilkan menu aksi untuk bagian itu. */
export function hunkMenu(view: EditorView, path: string, head: string, line: number, ev: MouseEvent) {
  const cur = view.state.doc.toString();
  const h = hunkAtLine(head, cur, line);
  if (!h) return false;
  const repo = getState().git?.root || getState().root || "";
  const rel = relTo(repo, path);
  openMenu(ev, [
    {
      label: tl("Stage bagian ini"),
      disabled: !rel,
      run: async () => {
        try {
          await api.gitApplyPatch(repo, hunkPatch(rel!, head, cur, h), true);
          toast(tl("Bagian di-stage"), "success");
          const A = await import("../app/actions");
          await A.refreshGit();
        } catch (e) {
          toast(errMsg(e), "error");
        }
      },
    },
    {
      label: tl("Kembalikan bagian ini"),
      run: () => {
        // Ganti baris baru dengan isi HEAD di editor (bisa di-undo), tidak langsung menulis disk.
        const doc = view.state.doc;
        const eol = "\n";
        if (h.newLines.length) {
          const from = doc.line(h.newStart + 1).from;
          const lastLine = doc.line(h.newStart + h.newLines.length);
          const to = h.oldLines.length || lastLine.number === doc.lines ? lastLine.to : Math.min(lastLine.to + 1, doc.length);
          view.dispatch({ changes: { from, to, insert: h.oldLines.join(eol) }, userEvent: "revert.hunk" });
        } else {
          // Hapus murni: sisipkan lagi baris lama sebelum baris `newStart + 1`.
          const at = h.newStart < doc.lines ? doc.line(h.newStart + 1).from : doc.length;
          const text = h.newStart < doc.lines ? h.oldLines.join(eol) + eol : (doc.length ? eol : "") + h.oldLines.join(eol);
          view.dispatch({ changes: { from: at, insert: text }, userEvent: "revert.hunk" });
        }
      },
    },
    {
      label: tl("Lihat perubahan berkas"),
      run: () => void import("../panels/compare").then((m) => m.openCompare({ title: rel ?? path, filename: path, leftLabel: "HEAD", rightLabel: tl("Sekarang"), left: head, right: view.state.doc.toString() })),
    },
  ]);
  return true;
}
