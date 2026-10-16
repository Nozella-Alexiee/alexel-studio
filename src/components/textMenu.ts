// Menu klik kanan untuk tampilan teks mirip konsol (Debug Console, Output, chat agen, daftar port):
// Salin / Salin semua / Pilih semua, ditambah aksi khusus tampilan itu (mis. Bersihkan).

import type { MouseEvent as ReactMouseEvent } from "react";
import { tl } from "../i18n";
import { toast } from "../state/store";
import { openMenu, type MenuItem } from "./Overlays";

/** Salin teks ke clipboard; gagal (izin ditolak) → beri tahu pengguna. */
export function copyText(text: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast(tl("Disalin")),
    () => toast(tl("Tidak bisa menyalin ke clipboard."), "error")
  );
}

/** Wadah teks yang diklik kanan: elemen `.selectable` terdekat, atau elemen pemilik handler. */
function hostOf(e: ReactMouseEvent | MouseEvent): HTMLElement | null {
  return (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".selectable") ?? ((e.currentTarget as HTMLElement | null) || null);
}

export function openTextMenu(e: ReactMouseEvent | MouseEvent, extra: MenuItem[] = []) {
  const host = hostOf(e);
  // Seleksi dibaca sekarang: mengklik item menu bisa menghapusnya.
  const sel = window.getSelection();
  const picked = sel && !sel.isCollapsed && host && sel.anchorNode && host.contains(sel.anchorNode) ? sel.toString() : "";
  const items: MenuItem[] = [
    { label: tl("Salin"), disabled: !picked, run: () => copyText(picked) },
    { label: tl("Salin semua"), disabled: !host?.innerText, run: () => copyText(host?.innerText ?? "") },
    {
      label: tl("Pilih semua"),
      disabled: !host,
      run: () => {
        if (!host) return;
        const r = document.createRange();
        r.selectNodeContents(host);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      },
    },
  ];
  if (extra.length) items.push({ label: "", separator: true }, ...extra);
  openMenu(e, items);
}

/** Menu "Salin …" untuk baris yang berupa tombol (teks di dalam <button> tidak bisa dipilih dengan mouse). */
export function openCopyMenu(e: ReactMouseEvent | MouseEvent, entries: { label: string; text: string }[]) {
  openMenu(e, entries.map((x) => ({ label: x.label, disabled: !x.text, run: () => copyText(x.text) })));
}
