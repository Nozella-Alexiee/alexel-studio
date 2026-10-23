// Markdown dari sumber luar (README ekstensi) → HTML aman: disanitasi DOMPurify, tanpa gambar
// dari host selain Open VSX (CSP juga menolaknya), tautan dibuka di browser.

import DOMPurify from "dompurify";
import { marked } from "marked";

let instance: ReturnType<typeof DOMPurify> | null = null;
/** DOMPurify dibuat saat pertama dipakai (modul ini ikut diimpor di lingkungan tanpa `window`, mis. uji). */
const purifier = () => {
  if (!instance) {
    instance = DOMPurify(window);
    instance.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") node.setAttribute("rel", "noopener noreferrer");
    });
  }
  return instance;
};

export function renderRemoteMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false, gfm: true, breaks: false }) as string;
  const clean = purifier().sanitize(raw, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button", "iframe"], FORBID_ATTR: ["style"] });
  // <img> dari host lain diganti teks alt-nya.
  return clean.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc="([^"]*)"/i.exec(tag)?.[1] ?? "";
    if (/^(https:\/\/open-vsx\.org\/|data:image\/)/i.test(src)) return tag;
    const alt = /\salt="([^"]*)"/i.exec(tag)?.[1];
    return alt ? `<em>${alt}</em>` : "";
  });
}
