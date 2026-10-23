// Isi tab webview ekstensi.

import { useWebviews, webviewIdOf } from "../exthost/webview";
import WebviewFrame from "./WebviewFrame";

export default function WebviewTab({ tabId }: { tabId: string }) {
  const id = webviewIdOf(tabId);
  const exists = useWebviews((s) => (id === null ? false : !!s.panels[id]));
  if (id === null || !exists) return <div className="pad hint">Webview sudah ditutup.</div>;
  return <WebviewFrame id={id} />;
}
