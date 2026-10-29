// Pratinjau Markdown (disanitasi DOMPurify, link dibuka di browser) dan HTML
// (iframe ber-sandbox dari origin terpisah nozelpreview://, tanpa allow-same-origin).

import DOMPurify from "dompurify";
import { marked } from "marked";
import { Minus, Plus, RotateCcw, Maximize2, ExternalLink, RefreshCw } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, errMsg, isNative, openExternal, previewUrl } from "../lib/ipc";
import { dirname, isInside, localImageSrc, normalizePath } from "../lib/paths";
import { formatBytes } from "../lib/format";
import { getState, toast } from "../state/store";
import * as docs from "./documents";
import { IconButton, Spinner } from "../components/ui";
import { tl } from "../i18n";

function useDocText(path: string, delay = 250) {
  const [text, setText] = useState(() => docs.currentText(path) ?? "");
  useEffect(() => {
    setText(docs.currentText(path) ?? "");
    let t = 0;
    const off = docs.onDocTextChange((p) => {
      if (p !== path) return;
      clearTimeout(t);
      t = window.setTimeout(() => setText(docs.currentText(path) ?? ""), delay);
    });
    return () => {
      clearTimeout(t);
      off();
    };
  }, [path, delay]);
  return text;
}

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function MarkdownPreview({ path }: { path: string }) {
  const text = useDocText(path);
  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false, gfm: true, breaks: false }) as string;
    const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button"], FORBID_ATTR: ["style"] });
    // Gambar relatif → dilayani protokol pratinjau (hanya di dalam project).
    const root = getState().root;
    if (!isNative || !root) return clean;
    const base = dirname(path);
    return clean.replace(/<img([^>]*?)src="(?!https?:|data:)([^"]+)"/gi, (_m, pre, src: string) => {
      // `../` dirapikan dulu supaya tidak lolos keluar project lewat isInside; %20 dll. didekode (nama berkas berspasi).
      const abs = normalizePath(localImageSrc(src, base));
      return isInside(root, abs) ? `<img${pre}src="${previewUrl(abs)}"` : `<img${pre}`;
    });
  }, [text, path]);

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      let id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* "#%" dsb.: pakai apa adanya */
      }
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    } else if (/^(https?:|mailto:)/i.test(href)) {
      void openExternal(href);
    } else if (href && !/^[a-z][\w+.-]*:/i.test(href.replace(/^[A-Za-z]:[\\/]/, ""))) {
      // Tautan relatif ke berkas lain (skema lain seperti file:/javascript: diabaikan).
      const target = normalizePath(localImageSrc(href, dirname(path)));
      void import("../app/actions").then((m) => m.openFile(target));
    }
  };

  return <article className="md-preview" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function HtmlPreview({ path }: { path: string }) {
  const text = useDocText(path, 400);
  const [nonce, setNonce] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  // Isi yang belum disimpan dikirim ke backend supaya protokol pratinjau memakainya.
  useEffect(() => {
    if (!isNative) return;
    void api.previewOverride(path, text).then(() => setNonce((n) => n + 1), () => {});
  }, [path, text]);
  useEffect(() => () => void api.previewOverride(path, null).catch(() => {}), [path]);

  return (
    <div className="html-preview">
      <div className="preview-bar">
        <span className="preview-url">{path.split("/").slice(-2).join("/")}</span>
        <IconButton label={tl("Muat ulang")} onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw size={13} />
        </IconButton>
        <IconButton label={tl("Buka di browser")} onClick={() => void api.commandForFile(path).then(async (t) => (await import("../app/run")).runTarget(t)).catch((e) => toast(errMsg(e), "error"))}>
          <ExternalLink size={13} />
        </IconButton>
      </div>
      {isNative ? (
        <iframe key={nonce} ref={frame} title={tl("Pratinjau HTML")} src={`${previewUrl(path)}?v=${nonce}`} sandbox="allow-scripts allow-forms" />
      ) : (
        <iframe title={tl("Pratinjau HTML")} srcDoc={text} sandbox="allow-scripts" />
      )}
    </div>
  );
}

export function ImageViewer({ path }: { path: string }) {
  const [data, setData] = useState<{ url: string; size: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    setZoom(1);
    setDims(null);
    api
      .readImage(path)
      // Pindah gambar cepat: hasil baca gambar sebelumnya tidak boleh menimpa yang baru.
      .then((d) => live && setData({ url: d.data_url, size: d.size_bytes }))
      .catch((e) => live && setErr(errMsg(e)));
    return () => {
      live = false;
    };
  }, [path]);

  // Wheel non-pasif supaya ⌘/pinch zoom tidak ikut men-zoom seluruh jendela.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.min(16, Math.max(0.05, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const fit = () => {
    if (!dims || !box.current) return;
    setZoom(Math.min(1, (box.current.clientWidth - 64) / dims.w, (box.current.clientHeight - 64) / dims.h));
  };

  return (
    <div className="image-viewer">
      <div className="preview-bar">
        <span className="preview-url">{dims ? `${dims.w} × ${dims.h}` : ""}{data ? ` · ${formatBytes(data.size)}` : ""}</span>
        <IconButton label={tl("Perkecil")} onClick={() => setZoom((z) => Math.max(0.05, z / 1.25))}>
          <Minus size={13} />
        </IconButton>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <IconButton label={tl("Perbesar")} onClick={() => setZoom((z) => Math.min(16, z * 1.25))}>
          <Plus size={13} />
        </IconButton>
        <IconButton label={tl("Pas layar")} onClick={fit}>
          <Maximize2 size={13} />
        </IconButton>
        <IconButton label={tl("Ukuran asli")} onClick={() => setZoom(1)}>
          <RotateCcw size={13} />
        </IconButton>
      </div>
      <div className="image-stage checker" ref={box}>
        {err ? (
          <div className="empty-body">{err}</div>
        ) : !data ? (
          <Spinner />
        ) : (
          <img src={data.url} alt="" style={{ width: dims ? dims.w * zoom : undefined }} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} draggable={false} />
        )}
      </div>
    </div>
  );
}
