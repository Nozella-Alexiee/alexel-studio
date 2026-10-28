// Iframe webview ekstensi (dipakai tab editor dan tampilan sidebar): sandbox, origin terpisah (nozelweb://).

import { useEffect, useRef } from "react";
import { frameLoaded, listenWebviewMessages, registerFrame, useWebviews, webviewSrc } from "../exthost/webview";

export default function WebviewFrame({ id, className = "webview-frame" }: { id: number; className?: string }) {
  const panel = useWebviews((s) => s.panels[id]);
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    listenWebviewMessages();
  }, []);
  // Daftarkan frame setiap kali iframe dibuat ulang (rev berubah = HTML baru).
  useEffect(() => {
    registerFrame(id, ref.current);
    return () => registerFrame(id, null);
  }, [id, panel?.rev]);
  if (!panel) return null;
  return <iframe key={panel.rev} ref={ref} onLoad={(e) => frameLoaded(id, e.currentTarget)} className={className} title={panel.title} src={webviewSrc(id, panel.owner)} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" />;
}
