// Bahasa antarmuka: Indonesia (teks sumber di kode) atau Inggris (src/i18n/en.ts).
// Bahasa dibaca sekali saat aplikasi dimuat; mengganti bahasa memuat ulang jendela,
// sehingga label menu & perintah yang dihitung saat modul dimuat ikut berganti.

import { EN } from "./en";

export type Lang = "id" | "en";
const KEY = "as.lang";

function detect(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "id" || v === "en") return v;
    // Pengguna lama (versi Nozel berbahasa Indonesia) tetap memakai bahasa Indonesia.
    if (localStorage.getItem("nozel:design") || localStorage.getItem("nozel.tourDone")) return "id";
  } catch {
    /* localStorage tidak tersedia */
  }
  return typeof navigator !== "undefined" && /^id\b/i.test(navigator.language) ? "id" : "en";
}

export const lang: Lang = detect();

/** Preferensi tersimpan: "auto" = ikuti sistem. */
export function langPref(): "auto" | Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === "id" || v === "en" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Terjemahkan teks sumber (Indonesia). `{nama}` di teks diganti dari `vars`. */
export function tl(s: string, vars?: Record<string, string | number>): string {
  let out = lang === "en" ? (EN[s] ?? s) : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** Ganti bahasa lalu muat ulang jendela. */
export function setLanguage(pref: "auto" | Lang) {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* localStorage tidak tersedia */
  }
  location.reload();
}
