import { Copy, Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton, Segmented } from "../components/ui";
import * as docs from "../editor/documents";
import { renderSnapshot, type SnapshotOptions } from "../editor/snapshot";
import { api, call, errMsg, isNative, pickSavePath } from "../lib/ipc";
import { basename, dirname, join } from "../lib/paths";
import { activeTab, getState, setState, toast, useStore } from "../state/store";
import { tl } from "../i18n";

export function SnapshotDialog() {
  const open = useStore((s) => s.snapshotOpen);
  const design = useStore((s) => s.settings.design);
  const [o, setO] = useState<Omit<SnapshotOptions, "title" | "scale">>({ lineNumbers: true, chrome: true, padding: 48, fontSize: 14, background: "design" });
  const stage = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open || !stage.current) return;
    const tab = activeTab();
    const view = docs.viewOf(getState().focusedGroup);
    if (!tab || tab.kind !== "text" || !view) {
      setState({ snapshotOpen: false });
      return;
    }
    const c = renderSnapshot(view.state, { ...o, title: tab.name, scale: 2 });
    c.className = "snap-canvas";
    c.style.width = `${c.width / 2}px`;
    stage.current.replaceChildren(c);
    canvasRef.current = c;
  }, [open, o, design]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setState({ snapshotOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const close = () => setState({ snapshotOpen: false });

  const copy = async () => {
    const c = canvasRef.current;
    if (!c) return;
    try {
      if (isNative) await call("clipboard_write_image", { dataUrl: c.toDataURL("image/png") });
      else {
        const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(tl("Gagal membuat gambar")))), "image/png"));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
      toast(tl("Gambar disalin ke clipboard"), "success");
    } catch (e) {
      toast(tl("Tidak bisa menyalin gambar: {error}. Coba Simpan PNG.", { error: errMsg(e) }), "error");
    }
  };

  const save = async () => {
    const c = canvasRef.current;
    const tab = activeTab();
    if (!c || !tab) return;
    const def = join(dirname(tab.id), `${basename(tab.id).replace(/\.[^.]+$/, "")}-snapshot.png`);
    const path = await pickSavePath(def, [{ name: "Gambar PNG", extensions: ["png"] }]);
    if (!path) return;
    try {
      await api.writeBase64(path, c.toDataURL("image/png").split(",")[1]);
      toast(`Tersimpan: ${basename(path)}`, "success");
      close();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="snapshot" role="dialog" aria-modal="true" aria-label={tl("Snapshot kode")}>
        <div className="compare-head">
          <strong>{tl("Snapshot kode")}</strong>
          <span className="hint">{docs.selectionText(getState().focusedGroup).trim() ? tl("dari seleksi") : tl("seluruh berkas (maks 400 baris)")}</span>
          <span className="spacer" />
          <IconButton label={tl("Tutup")} onClick={close}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="snap-controls">
          <Segmented label={tl("Latar")} value={o.background} onChange={(v) => setO({ ...o, background: v })} options={[{ id: "design", label: tl("Desain") }, { id: "accent", label: tl("Aksen") }, { id: "transparent", label: tl("Transparan") }]} />
          <label className="check">
            <input type="checkbox" checked={o.lineNumbers} onChange={(e) => setO({ ...o, lineNumbers: e.target.checked })} /> Nomor baris
          </label>
          <label className="check">
            <input type="checkbox" checked={o.chrome} onChange={(e) => setO({ ...o, chrome: e.target.checked })} /> Jendela
          </label>
          <label className="check">
            Huruf
            <input type="range" min={11} max={22} value={o.fontSize} onChange={(e) => setO({ ...o, fontSize: Number(e.target.value) })} aria-label={tl("Ukuran huruf")} />
          </label>
        </div>
        <div className="snap-stage checker" ref={stage} />
        <div className="dialog-actions">
          <button className="btn" onClick={() => void copy()}>
            <Copy size={14} /> Salin
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            <Download size={14} /> Simpan PNG
          </button>
        </div>
      </div>
    </div>
  );
}
