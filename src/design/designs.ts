// Tiga desain Nozel Code. Masing-masing mengubah warna, font, kepadatan,
// DAN tata letak. Warna & ukuran ada di src/styles/tokens.css per [data-design].

export type DesignId = "aurora" | "zen" | "control";

export interface DesignInfo {
  id: DesignId;
  name: string;
  tagline: string;
  scheme: "dark" | "light";
  /** Warna contoh untuk kartu pratinjau di Pengaturan. */
  swatch: { bg: string; panel: string; accent: string; text: string; alt: string };
}

export const DESIGNS: DesignInfo[] = [
  {
    id: "aurora",
    name: "Aurora Glass",
    tagline: "Gelap ala macOS. Sidebar kaca, palette di title bar, agen Claude di kanan, terminal melayang.",
    scheme: "dark",
    swatch: { bg: "#0e1016", panel: "#13151d", accent: "#7aa2f7", text: "#c9d1e0", alt: "#d97757" },
  },
  {
    id: "zen",
    name: "Zen Paper",
    tagline: "Terang dan hangat. Satu kolom fokus tanpa activity bar, saran Claude inline, omnibar di bawah.",
    scheme: "light",
    swatch: { bg: "#faf9f5", panel: "#f3f0e6", accent: "#d97757", text: "#3d3d3a", alt: "#2f6fb5" },
  },
  {
    id: "control",
    name: "Control Room",
    tagline: "Padat ala IDE. Toolbar run, split editor, panel Git dengan staging, terminal multi-tab.",
    scheme: "dark",
    swatch: { bg: "#07090d", panel: "#0d121a", accent: "#8be9fd", text: "#b8c2d4", alt: "#ff79c6" },
  },
];

export const designById = (id: DesignId) => DESIGNS.find((d) => d.id === id) ?? DESIGNS[0];

export const ACCENTS: Record<DesignId, string[]> = {
  aurora: ["#7aa2f7", "#5ee0a0", "#c792ea", "#d97757"],
  zen: ["#d97757", "#2f6fb5", "#5b7d3a", "#7a5fc0"],
  control: ["#8be9fd", "#ff79c6", "#50fa7b", "#bd93f9"],
};

const CACHE_KEY = "nozel:design";

/** Terapkan desain ke <html> segera (dipanggil sebelum React render supaya tidak berkedip). */
export function applyDesign(id: DesignId, accent?: string | null) {
  const root = document.documentElement;
  root.dataset.design = id;
  root.dataset.scheme = designById(id).scheme;
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
  return { id: "aurora", accent: null };
}
