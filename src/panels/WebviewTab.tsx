// Isi tab webview ekstensi: iframe ber-sandbox dari nozelweb:// (origin terpisah, tanpa akses ke aplikasi).

import { useEffect, useRef } from "react";
import { listenWebviewMessages, registerFrame, useWebviews, webviewIdOf } from "../exthost/webview";

export default function WebviewTab({ tabId }: { tabId: string }) {
  const id = webviewIdOf(tabId);
  const panel = useWebviews((s) => (id === null ? undefined : s.panels[id]));
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    listenWebviewMessages();
  }, []);
  // Daftarkan frame setiap kali iframe dibuat ulang (rev berubah = HTML baru).
  useEffect(() => {
    if (id === null) return;
    registerFrame(id, ref.current);
    return () => registerFrame(id, null);
  }, [id, panel?.rev]);
  if (id === null || !panel) return <div className="pad hint">Webview sudah ditutup.</div>;
  return <iframe key={panel.rev} ref={ref} className="webview-frame" title={panel.title} src={`nozelweb://v/${id}/index.html`} sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" />;
}
