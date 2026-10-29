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

/**
 * Markdown dari luar (README ekstensi, hover/dokumentasi ekstensi) → HTML bersih. Gambar https
 * ditampilkan seperti di VS Code (lazy, tanpa referrer); path relatif diarahkan ke `imageBase` (mis.
 * berkas paket di Open VSX). Gambar http/skema lain diganti teks alt-nya.
 */
export function renderRemoteMarkdown(text: string, imageBase?: string): string {
  const raw = marked.parse(text, { async: false, gfm: true, breaks: false }) as string;
  const clean = purifier().sanitize(raw, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button", "iframe"], FORBID_ATTR: ["style"] });
  return clean.replace(/<img\b[^>]*>/gi, (tag) => {
    let src = /\ssrc="([^"]*)"/i.exec(tag)?.[1] ?? "";
    const alt = /\salt="([^"]*)"/i.exec(tag)?.[1];
    if (imageBase && src && !/^[a-z][\w+.-]*:/i.test(src) && !src.startsWith("//")) {
      try {
        src = new URL(src.replace(/^\.?\//, ""), imageBase).href;
      } catch {
        src = "";
      }
    }
    if (!/^(https:\/\/|data:image\/)/i.test(src)) return alt ? `<em>${alt}</em>` : "";
    const rest = tag.replace(/\ssrc="[^"]*"/i, "").replace(/^<img/i, "").replace(/\/?>$/, "");
    return `<img src="${src}"${rest} loading="lazy" referrerpolicy="no-referrer">`;
  });
}
