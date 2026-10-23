// Pasang/hapus server bahasa terkurasi (Pengaturan → Server bahasa, dan tombol di katalog ekstensi).

import { serverStatus, type ServerStatus } from "../editor/lsp";
import { call, errMsg } from "../lib/ipc";
import { confirmDialog, stickyToast, toast } from "../state/store";
import { tl } from "../i18n";

/** Pasang setelah konfirmasi eksplisit (kode server berjalan di komputer ini). Mengembalikan true bila terpasang. */
export async function installServer(s: Pick<ServerStatus, "id" | "name" | "version">): Promise<boolean> {
  const ok = await confirmDialog(
    tl("Pasang server bahasa {name}?", { name: s.name }),
    tl("Alexel Studio mengunduh paketnya dari Open VSX (versi {v}, checksum SHA-256 dicocokkan dengan yang sudah ditinjau), lalu menjalankan server itu sebagai proses di komputermu saat kamu membuka berkas bahasa ini. Hanya berkas server yang diambil; kode ekstensi VS Code-nya tidak dijalankan.", { v: s.version ?? "?" }),
    tl("Pasang & izinkan")
  );
  if (!ok) return false;
  const done = stickyToast(tl("Memasang {name}…", { name: s.name }));
  try {
    await call("lsp_install", { id: s.id });
    await serverStatus(true);
    (await import("../editor/documents")).reattachLsp();
    toast(tl("{name} terpasang", { name: s.name }), "success");
    return true;
  } catch (e) {
    toast(tl("Gagal memasang {name}: {error}", { name: s.name, error: errMsg(e) }), "error");
    return false;
  } finally {
    done();
  }
}

export async function removeServer(s: Pick<ServerStatus, "id" | "name">): Promise<void> {
  if (!(await confirmDialog(tl("Hapus server {name}?", { name: s.name }), tl("Autocomplete dan diagnostik untuk bahasa ini berhenti sampai dipasang lagi."), tl("Hapus"), true))) return;
  try {
    await call("lsp_remove", { id: s.id });
    await serverStatus(true);
  } catch (e) {
    toast(errMsg(e), "error");
  }
}
