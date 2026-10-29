// Tab Browser: bilah alamat + navigasi + perangkat + DevTools; halaman dirender oleh WebContentsView
// di main process yang ditempel tepat di area ini. View disembunyikan saat tab tidak terlihat atau
// ada dialog/menu/palette terbuka (view native selalu berada di atas HTML).

import { ArrowLeft, ArrowRight, Bug, Camera, ExternalLink, Globe, Loader2, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../components/ui";
import { api, errMsg, openExternal } from "../lib/ipc";
import { toast } from "../state/store";
import { tl } from "../i18n";
import { ensureView, useBrowser } from "./state";

export const DEVICES: Record<string, { label: string; width: number; height: number; mobile: boolean; scale?: number } | null> = {
  responsive: null,
  iphone15: { label: "iPhone 15", width: 393, height: 852, mobile: true, scale: 3 },
  pixel8: { label: "Pixel 8", width: 412, height: 915, mobile: true, scale: 2.6 },
  ipad: { label: "iPad Air", width: 820, height: 1180, mobile: true, scale: 2 },
  laptop: { label: "Laptop 1280", width: 1280, height: 800, mobile: false, scale: 1 },
};

const OVERLAY = ".scrim, .palette, .ctx-menu, .mb-menu, .tour, [role='dialog'][aria-modal='true']";

export default function BrowserTab({ tabId }: { tabId: string }) {
  const b = useBrowser((s) => s.tabs[tabId]);
  const area = useRef<HTMLDivElement>(null);
  const [addr, setAddr] = useState(b?.url ?? "");
  const [editing, setEditing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const view = b?.view ?? null;

  useEffect(() => {
    void ensureView(tabId);
  }, [tabId]);
  useEffect(() => {
    if (!editing && b) setAddr(b.url === "about:blank" ? "" : b.url);
  }, [b?.url, editing]);

  // Overlay (dialog, menu, palette) → sembunyikan view supaya tidak menutupi.
  useEffect(() => {
    const check = () => setBlocked(!!document.querySelector(OVERLAY));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // Tempel view ke area tab: posisi diperbarui saat ukuran/tata letak berubah.
  useEffect(() => {
    const el = area.current;
    if (!el || view === null) return;
    let last = "";
    const send = () => {
      const r = el.getBoundingClientRect();
      const visible = !blocked && document.visibilityState === "visible" && r.width > 0 && r.height > 0 && el.offsetParent !== null;
      const key = `${r.x},${r.y},${r.width},${r.height},${visible}`;
      if (key === last) return;
      last = key;
      void api.browserBounds(view, { x: r.x, y: r.y, width: r.width, height: r.height, visible }).catch(() => {});
    };
    // Ukuran berubah (panel, sidebar, split) → ResizeObserver; pergeseran posisi tanpa ubah ukuran
    // tertangkap pemeriksaan ringan berkala.
    const ro = new ResizeObserver(send);
    ro.observe(el);
    window.addEventListener("resize", send);
    const timer = window.setInterval(send, 400);
    send();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", send);
      clearInterval(timer);
      void api.browserBounds(view, { x: 0, y: 0, width: 0, height: 0, visible: false }).catch(() => {});
    };
  }, [view, blocked]);

  if (!b) return null;
  const go = () => {
    setEditing(false);
    if (view !== null) void api.browserNavigate(view, addr).catch((e) => toast(errMsg(e), "error"));
  };
  const ctl = (a: Parameters<typeof api.browserControl>[1]) => view !== null && void api.browserControl(view, a).catch((e) => toast(errMsg(e), "error"));
  const setDevice = (d: string) => {
    useBrowser.setState((s) => ({ tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], device: d } } }));
    if (view !== null) void api.browserEmulate(view, DEVICES[d] ?? null).catch((e) => toast(errMsg(e), "error"));
  };
  const shot = async () => {
    if (view === null) return;
    try {
      const png = await api.browserScreenshot(view);
      const res = await fetch(`data:image/png;base64,${png}`);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": await res.blob() })]);
      toast(tl("Screenshot halaman disalin"), "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const dev = DEVICES[b.device];
  return (
    <div className="br-tab">
      <div className="br-bar">
        <IconButton label={tl("Kembali")} onClick={() => ctl("back")} disabled={!b.canGoBack}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton label={tl("Maju")} onClick={() => ctl("forward")} disabled={!b.canGoForward}>
          <ArrowRight size={14} />
        </IconButton>
        {b.loading ? (
          <IconButton label={tl("Hentikan")} onClick={() => ctl("stop")}>
            <X size={14} />
          </IconButton>
        ) : (
          <IconButton label={tl("Muat ulang")} onClick={() => ctl("reload")}>
            <RotateCw size={13} />
          </IconButton>
        )}
        <div className="br-addr">
          {b.loading ? <Loader2 size={12} className="br-spin" /> : b.favicon ? <img src={b.favicon} alt="" width={14} height={14} /> : <Globe size={12} />}
          <input
            className="br-url"
            value={addr}
            placeholder={tl("Ketik alamat, mis. localhost:5173")}
            onFocus={(e) => (setEditing(true), e.currentTarget.select())}
            onBlur={() => setEditing(false)}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
              if (e.key === "Escape") (setEditing(false), setAddr(b.url), e.currentTarget.blur());
            }}
            aria-label={tl("Alamat")}
            spellCheck={false}
          />
        </div>
        <select className="input select br-device" value={b.device} onChange={(e) => setDevice(e.target.value)} aria-label={tl("Perangkat")}>
          <option value="responsive">{tl("Responsif")}</option>
          {Object.entries(DEVICES).filter(([, d]) => d).map(([k, d]) => (
            <option key={k} value={k}>
              {d!.label} ({d!.width}×{d!.height})
            </option>
          ))}
        </select>
        <IconButton label={tl("Salin screenshot halaman")} onClick={() => void shot()}>
          <Camera size={13} />
        </IconButton>
        <IconButton label={tl("DevTools")} onClick={() => ctl("devtools")}>
          <Bug size={13} />
        </IconButton>
        <IconButton label={tl("Buka di browser sistem")} onClick={() => void openExternal(b.url)} disabled={!/^https?:/.test(b.url)}>
          <ExternalLink size={13} />
        </IconButton>
      </div>
      {b.error && (
        <div className="env-warn">
          <span>{b.error}</span>
          <button className="btn btn-sm" onClick={() => ctl("reload")}>
            {tl("Coba lagi")}
          </button>
        </div>
      )}
      <div className={`br-stage ${dev ? "is-device" : ""}`}>
        <div ref={area} className="br-area" style={dev ? { width: dev.width, maxWidth: "100%", height: dev.height, maxHeight: "100%" } : undefined} />
        {blocked && <div className="br-paused">{tl("Halaman disembunyikan sementara selama dialog terbuka.")}</div>}
      </div>
    </div>
  );
}
