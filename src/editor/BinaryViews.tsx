// Penampil berkas non-teks: PDF (penampil bawaan Chromium) dan hex baca-saja untuk berkas biner.

import { FolderOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Spinner } from "../components/ui";
import { api, errMsg, previewUrl } from "../lib/ipc";
import { formatBytes } from "../lib/format";
import { isInside } from "../lib/paths";
import { useStore } from "../state/store";
import { tl } from "../i18n";

function OpenExternally({ path }: { path: string }) {
  return (
    // Hanya menampilkan berkas di Finder/Explorer: membuka berkas biner sembarangan bisa menjalankan program.
    <button className="btn" onClick={() => void api.reveal(path)}>
      <FolderOpen size={13} /> {tl("Tampilkan di folder")}
    </button>
  );
}

export function PdfViewer({ path }: { path: string }) {
  const root = useStore((s) => s.root);
  // Dilayani nozelpreview:// (hanya berkas di dalam folder project).
  if (!root || !isInside(root, path)) {
    return <Empty title={tl("PDF di luar folder project")} action={<OpenExternally path={path} />}>{tl("Pratinjau PDF hanya untuk berkas di dalam folder project.")}</Empty>;
  }
  return <iframe className="pdf-frame" title={path} src={previewUrl(path)} />;
}

const ROW = 16;
const ROW_H = 20;

/** Satu baris hex dump: offset, 16 byte hex, dan teks ASCII (karakter tak tercetak jadi "."). */
export function hexRow(bytes: Uint8Array, offset: number): { off: string; hex: string; ascii: string } {
  const slice = bytes.subarray(offset, offset + ROW);
  const hex: string[] = [];
  let ascii = "";
  for (let i = 0; i < ROW; i++) {
    if (i < slice.length) {
      hex.push(slice[i].toString(16).padStart(2, "0"));
      ascii += slice[i] >= 0x20 && slice[i] < 0x7f ? String.fromCharCode(slice[i]) : ".";
    } else hex.push("  ");
    if (i === 7) hex.push("");
  }
  return { off: offset.toString(16).padStart(8, "0"), hex: hex.join(" "), ascii };
}

export function HexViewer({ path }: { path: string }) {
  const [data, setData] = useState<{ bytes: Uint8Array; size: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setData(null);
    setErr(null);
    api
      .readHead(path)
      .then((r) => setData({ bytes: Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0)), size: r.size }))
      .catch((e) => setErr(errMsg(e)));
  }, [path]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);
  const rows = data ? Math.ceil(data.bytes.length / ROW) : 0;
  const first = Math.max(0, Math.floor(top / ROW_H) - 5);
  const last = Math.min(rows, first + Math.ceil(height / ROW_H) + 10);
  const visible = useMemo(() => (data ? Array.from({ length: Math.max(0, last - first) }, (_, i) => hexRow(data.bytes, (first + i) * ROW)) : []), [data, first, last]);
  if (err) return <Empty title={tl("Berkas tidak bisa dibaca")}>{err}</Empty>;
  if (!data) return <div className="pad"><Spinner /></div>;
  return (
    <div className="hex-view">
      <div className="hex-head">
        <span>{tl("Berkas biner · {size} · baca-saja", { size: formatBytes(data.size) })}</span>
        {data.size > data.bytes.length && <span className="hint">{tl("Menampilkan {n} pertama", { n: formatBytes(data.bytes.length) })}</span>}
        <span className="spacer" />
        <OpenExternally path={path} />
      </div>
      <div className="hex-scroll" ref={box} onScroll={(e) => setTop(e.currentTarget.scrollTop)} role="table" aria-label={tl("Isi berkas dalam hex")}>
        <div style={{ height: rows * ROW_H, position: "relative" }}>
          {visible.map((r, i) => (
            <div key={first + i} className="hex-row" role="row" style={{ top: (first + i) * ROW_H }}>
              <span className="hex-off">{r.off}</span>
              <span className="hex-bytes">{r.hex}</span>
              <span className="hex-ascii">{r.ascii}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
