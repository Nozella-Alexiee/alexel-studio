import { tl } from "../i18n";
// Desain Alexel Studio. Masing-masing mengubah warna, font, kepadatan,
// DAN tata letak. Warna & ukuran ada di src/styles/tokens.css per [data-design].

export type DesignId = "studio" | "studio-light" | "aurora" | "zen" | "control" | "antartika" | "tuxedo" | "kawanan";
export type ShellId = "studio" | "aurora" | "zen" | "control";

export interface DesignInfo {
  id: DesignId;
  name: string;
  tagline: string;
  scheme: "dark" | "light";
  /** Tata letak yang dipakai desain ini. */
  shell: ShellId;
  /** Gaya maskot Nozi (khusus desain pinguin). */
  penguin?: "antartika" | "tuxedo" | "kawanan";
  group: "Klasik" | "Pinguin";
  /** Warna contoh untuk kartu pratinjau di Pengaturan. */
  swatch: { bg: string; panel: string; accent: string; text: string; alt: string };
}

export const DESIGNS: DesignInfo[] = [
  {
    id: "studio",
    name: "Studio Gelap",
    tagline: tl("Tata letak seperti VS Code: activity bar, sidebar, panel bawah, dan agen AI di sidebar kanan."),
    scheme: "dark",
    shell: "studio",
    group: "Klasik",
    swatch: { bg: "#1f1f1f", panel: "#181818", accent: "#0078d4", text: "#cccccc", alt: "#d97757" },
  },
  {
    id: "studio-light",
    name: "Studio Terang",
    tagline: tl("Tata letak seperti VS Code dengan warna terang yang bersih."),
    scheme: "light",
    shell: "studio",
    group: "Klasik",
    swatch: { bg: "#ffffff", panel: "#f8f8f8", accent: "#005fb8", text: "#3b3b3b", alt: "#c4613f" },
  },
  {
    id: "aurora",
    name: "Aurora Glass",
    tagline: tl("Gelap ala macOS. Sidebar kaca, palette di title bar, agen AI di kanan, terminal melayang."),
    scheme: "dark",
    shell: "aurora",
    group: "Klasik",
    swatch: { bg: "#0e1016", panel: "#13151d", accent: "#7aa2f7", text: "#c9d1e0", alt: "#d97757" },
  },
  {
    id: "zen",
    name: "Zen Paper",
    tagline: tl("Terang dan hangat. Satu kolom fokus tanpa activity bar, saran AI inline, omnibar di bawah."),
    scheme: "light",
    shell: "zen",
    group: "Klasik",
    swatch: { bg: "#faf9f5", panel: "#f3f0e6", accent: "#d97757", text: "#3d3d3a", alt: "#2f6fb5" },
  },
  {
    id: "control",
    name: "Control Room",
    tagline: tl("Padat ala IDE. Toolbar run, split editor, panel Git dengan staging, terminal multi-tab."),
    scheme: "dark",
    shell: "control",
    group: "Klasik",
    swatch: { bg: "#07090d", panel: "#0d121a", accent: "#8be9fd", text: "#b8c2d4", alt: "#ff79c6" },
  },
  {
    id: "antartika",
    name: "Antartika",
    tagline: tl("Gelap biru es. Nozi berkupluk menemani di sidebar dan beranda, aksen oranye paruh."),
    scheme: "dark",
    shell: "aurora",
    penguin: "antartika",
    group: "Pinguin",
    swatch: { bg: "#0b1220", panel: "#0f1a2e", accent: "#6cc4ff", text: "#d6e2f5", alt: "#ff9a3c" },
  },
  {
    id: "tuxedo",
    name: "Tuxedo",
    tagline: tl("Hitam-putih kontras tinggi, Nozi berdasi kupu-kupu kuning. Rapi dan profesional."),
    scheme: "dark",
    shell: "control",
    penguin: "tuxedo",
    group: "Pinguin",
    swatch: { bg: "#0a0a0a", panel: "#151515", accent: "#ffd23f", text: "#ededed", alt: "#ffffff" },
  },
  {
    id: "kawanan",
    name: "Kawanan",
    tagline: tl("Terang seperti salju, kawanan Nozi berselendang di beranda. Ceria dan bulat."),
    scheme: "light",
    shell: "zen",
    penguin: "kawanan",
    group: "Pinguin",
    swatch: { bg: "#f3f8fc", panel: "#ffffff", accent: "#ff8a3d", text: "#2b3a55", alt: "#3a7bd5" },
  },
];

export const designById = (id: DesignId) => DESIGNS.find((d) => d.id === id) ?? DESIGNS[0];

export const ACCENTS: Record<DesignId, string[]> = {
  studio: ["#0078d4", "#d97757", "#2ea043", "#a371f7"],
  "studio-light": ["#005fb8", "#c4613f", "#1a7f37", "#8250df"],
  aurora: ["#7aa2f7", "#5ee0a0", "#c792ea", "#d97757"],
  zen: ["#d97757", "#2f6fb5", "#5b7d3a", "#7a5fc0"],
  control: ["#8be9fd", "#ff79c6", "#50fa7b", "#bd93f9"],
  antartika: ["#6cc4ff", "#ff9a3c", "#7ee0a5", "#c3a6ff"],
  tuxedo: ["#ffd23f", "#ffffff", "#7ee0a5", "#ff8a8a"],
  kawanan: ["#ff8a3d", "#3a7bd5", "#2f855a", "#7c3aed"],
};

const CACHE_KEY = "nozel:design";

/** Terapkan desain ke <html> segera (dipanggil sebelum React render supaya tidak berkedip). */
export function applyDesign(id: DesignId, accent?: string | null) {
  const root = document.documentElement;
  root.dataset.design = id;
  root.dataset.scheme = designById(id).scheme;
  root.dataset.shell = designById(id).shell;
  if (designById(id).penguin) root.dataset.penguin = designById(id).penguin;
  else delete root.dataset.penguin;
  if (accent) root.style.setProperty("--accent", accent);
  else root.style.removeProperty("--accent");
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id, accent: accent ?? null }));
  } catch {
    /* localStorage bisa tidak tersedia */
  }
}

export function cachedDesign(): { id: DesignId; accent: string | null } {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (v && DESIGNS.some((d) => d.id === v.id)) return v;
  } catch {
    /* abaikan */
  }
  return { id: "studio", accent: null };
}
