// Nozi, maskot Nozel. Tiga gaya (Antartika, Tuxedo, Kawanan) × empat ekspresi.
// Digambar sebagai SVG supaya tajam di semua ukuran dan bisa dipakai untuk ikon app.

import { memo, useEffect, useState } from "react";
import { designById } from "../design/designs";
import { Kepi } from "./CrabMascot";
import { getState, setState, toast, useStore } from "../state/store";

export type PenguinVariant = "antartika" | "tuxedo" | "kawanan";
export type PenguinMood = "idle" | "sibuk" | "error" | "sukses" | "jempol" | "hati" | "semangat";

interface Palette {
  body: string;
  belly: string;
  face: string;
  beak: string;
  beakLine: string;
  eye: string;
  cheek: string;
  extra: string;
  extra2: string;
  accent: string;
  outline?: string;
  shadow: string;
}

const PALETTES: Record<PenguinVariant, Palette> = {
  antartika: { body: "#22345c", belly: "#f4f8ff", face: "#f4f8ff", beak: "#ff9a3c", beakLine: "#c96a1c", eye: "#0d1526", cheek: "#ff8fa3", extra: "#6cc4ff", extra2: "#e9f6ff", accent: "#6cc4ff", shadow: "rgba(0,0,0,.22)" },
  tuxedo: { body: "#0f0f0f", belly: "#fafafa", face: "#0f0f0f", beak: "#ffd23f", beakLine: "#b58f12", eye: "#fafafa", cheek: "#ffd23f", extra: "#ffd23f", extra2: "#b58f12", accent: "#ffd23f", outline: "#3a3a3a", shadow: "rgba(0,0,0,.35)" },
  kawanan: { body: "#2b3a55", belly: "#ffffff", face: "#ffffff", beak: "#ff8a3d", beakLine: "#c85d17", eye: "#1c2433", cheek: "#ff9fb2", extra: "#ff8a3d", extra2: "#ffd166", accent: "#ff8a3d", shadow: "rgba(43,58,85,.18)" },
};

export const MOOD_LABEL: Record<PenguinMood, string> = { idle: "santai", sibuk: "lagi kerja", error: "nemu error", sukses: "senang!", jempol: "kasih jempol", hati: "dielus", semangat: "semangat!" };

export const PenguinMascot = memo(function PenguinMascot({
  variant,
  mood = "idle",
  size = 48,
  title,
  className = "",
}: {
  variant: PenguinVariant;
  mood?: PenguinMood;
  size?: number;
  title?: string;
  className?: string;
}) {
  const c = PALETTES[variant];
  const h = Math.round((size * 140) / 120);
  const cheek = variant === "tuxedo" ? 0 : mood === "sukses" || mood === "hati" ? 0.9 : 0.55;
  const happy = mood === "sukses" || mood === "jempol" || mood === "hati";
  const label = title ?? `Nozi, ${MOOD_LABEL[mood]}`;
  return (
    <svg viewBox="0 0 120 140" width={size} height={h} role="img" aria-label={label} className={`penguin mood-${mood} ${className}`}>
      <ellipse cx="60" cy="133" rx="32" ry="4.5" fill={c.shadow} />
      <g className="penguin-body">
        <ellipse cx="45" cy="128" rx="10" ry="5" fill={c.beak} />
        <ellipse cx="75" cy="128" rx="10" ry="5" fill={c.beak} />
        <ellipse className="penguin-wing-l" cx="22" cy="86" rx="9" ry="24" fill={c.body} transform="rotate(22 22 86)" />
        {mood === "jempol" ? (
          <g className="penguin-thumb">
            <ellipse cx="104" cy="62" rx="9" ry="22" fill={c.body} transform="rotate(28 104 62)" />
            <rect x="105" y="34" width="9" height="15" rx="4.5" fill={c.beak} />
          </g>
        ) : (
          <ellipse className="penguin-wing-r" cx="98" cy="86" rx="9" ry="24" fill={c.body} transform="rotate(-22 98 86)" />
        )}
        <ellipse cx="60" cy="78" rx="40" ry="52" fill={c.body} stroke={c.outline ?? "none"} strokeWidth={c.outline ? 2 : 0} />
        <ellipse cx="60" cy="90" rx="27" ry="37" fill={c.belly} />
        <path d="M60 40 C40 40 33 54 36 66 C40 76 52 74 60 70 C68 74 80 76 84 66 C87 54 80 40 60 40 Z" fill={c.face} />
        {variant === "antartika" && (
          <g>
            <path d="M26 44 C28 18 92 18 94 44 C80 36 40 36 26 44 Z" fill={c.extra} />
            <rect x="24" y="40" width="72" height="9" rx="4.5" fill={c.extra2} />
            <circle cx="60" cy="17" r="7" fill={c.extra2} />
          </g>
        )}
        {variant === "tuxedo" && (
          <g>
            <path d="M60 84 L46 77 L46 91 Z" fill={c.extra} />
            <path d="M60 84 L74 77 L74 91 Z" fill={c.extra} />
            <rect x="56.5" y="80.5" width="7" height="7" rx="2" fill={c.extra2} />
          </g>
        )}
        {variant === "kawanan" && (
          <g>
            <path d="M30 70 C45 80 75 80 90 70 L90 79 C75 89 45 89 30 79 Z" fill={c.extra} />
            <path d="M76 80 L86 108 L74 108 L68 82 Z" fill={c.extra} />
            <rect x="72" y="98" width="12" height="3" fill={c.extra2} />
            <rect x="42" y="75" width="4" height="9" fill={c.extra2} />
            <rect x="56" y="77" width="4" height="9" fill={c.extra2} />
          </g>
        )}
        <circle cx="42" cy="66" r="4.5" fill={c.cheek} opacity={cheek} />
        <circle cx="78" cy="66" r="4.5" fill={c.cheek} opacity={cheek} />
        {(mood === "idle" || mood === "semangat") && (
          <g className="penguin-eyes">
            <circle cx="49" cy="56" r="5" fill={c.eye} />
            <circle cx="71" cy="56" r="5" fill={c.eye} />
            <circle cx="50.8" cy="54.2" r="1.7" fill="#fff" />
            <circle cx="72.8" cy="54.2" r="1.7" fill="#fff" />
          </g>
        )}
        {mood === "sibuk" && (
          <g>
            <path d="M43 57 L55 57 M65 57 L77 57" stroke={c.eye} strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <path d="M88 34 C84 40 84 44 88 45 C92 44 92 40 88 34 Z" fill="#7cc8ff" />
            <g className="penguin-dots">
              <circle cx="96" cy="16" r="3" fill={c.accent} />
              <circle cx="106" cy="16" r="3" fill={c.accent} opacity=".65" />
              <circle cx="116" cy="16" r="3" fill={c.accent} opacity=".35" />
            </g>
          </g>
        )}
        {mood === "error" && (
          <g>
            <path d="M45 52 L53 60 M53 52 L45 60 M67 52 L75 60 M75 52 L67 60" stroke={c.eye} strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="102" cy="22" r="12" fill="#ff5d5d" />
            <rect x="100" y="13" width="4" height="11" rx="2" fill="#fff" />
            <circle cx="102" cy="29" r="2.2" fill="#fff" />
          </g>
        )}
        {happy && <path d="M43 59 Q49 51 55 59 M65 59 Q71 51 77 59" stroke={c.eye} strokeWidth="3.2" strokeLinecap="round" fill="none" />}
        {mood === "hati" && (
          <g className="penguin-hearts" fill={variant === "tuxedo" ? c.extra : "#ff8fa3"}>
            <path d="M88 40c0-4 6-4 6 0 0-4 6-4 6 0 0 5-6 8-6 10 0-2-6-5-6-10z" />
            <path d="M14 46c0-4 6-4 6 0 0-4 6-4 6 0 0 5-6 8-6 10 0-2-6-5-6-10z" />
            <path d="M54 14c0-4 6-4 6 0 0-4 6-4 6 0 0 5-6 8-6 10 0-2-6-5-6-10z" />
          </g>
        )}
        {mood === "semangat" && <path className="penguin-speed" d="M4 70h12M2 82h12M6 94h10" stroke={c.accent} strokeWidth="3" strokeLinecap="round" />}
        {(mood === "sukses" || mood === "jempol") && (
          <g>
            <path className="penguin-spark" d="M100 10 L102.5 17 L109 19 L102.5 21 L100 28 L97.5 21 L91 19 L97.5 17 Z" fill={c.accent} />
            <path className="penguin-spark" d="M14 26 L15.5 30 L19.5 31.5 L15.5 33 L14 37 L12.5 33 L8.5 31.5 L12.5 30 Z" fill={c.accent} />
          </g>
        )}
        <path d="M51 64 Q60 76 69 64 Q60 59 51 64 Z" fill={c.beak} />
        <path d="M53 66 Q60 70 67 66" stroke={c.beakLine} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
});

// ---------------- Ekspresi mengikuti keadaan aplikasi ----------------

/** Tampilkan ekspresi sesaat (mis. sukses setelah test lolos). */
export function flashPenguin(mood: PenguinMood, ms = 6000) {
  setState({ penguinFlash: { mood, until: Date.now() + ms } });
}

export function usePenguinMood(): PenguinMood {
  const flash = useStore((s) => s.penguinFlash);
  const busy = useStore((s) => !!s.chatRunning || s.terminals.some((t) => t.kind !== "shell" && t.status === "running"));
  const errors = useStore((s) => {
    const id = s.groups[s.focusedGroup]?.active;
    return id ? s.problems[id]?.some((p) => p.severity === "error") ?? false : false;
  });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!flash) return;
    const left = flash.until - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => tick((x) => x + 1), left + 30);
    return () => clearTimeout(t);
  }, [flash]);
  if (flash && flash.until > Date.now()) return flash.mood;
  if (busy) return "sibuk";
  if (errors) return "error";
  return "idle";
}

const TIPS = [
  "Tekan ⌘P untuk lompat ke berkas mana saja.",
  "⌘K membuka semua perintah. Ketik ? untuk tanya Claude.",
  "Klik kanan berkas untuk rename, duplikat, atau buka terminal di situ.",
  "Setiap simpan tercatat. Buka panel Riwayat untuk kembali ke versi lama.",
  "⌘R menjalankan berkas aktif. Smart Run membaca package.json dan Cargo.toml.",
  "Seret folder dari Finder ke jendela untuk membukanya.",
  "⌃⌘T mengganti desain. Ada enam, tiga di antaranya pinguin.",
  "Error di panel Masalah? Klik Jelaskan dan Claude yang bantu.",
];

export function nextTip(): string {
  const i = (getState().penguinTip + 1) % TIPS.length;
  setState({ penguinTip: i });
  return TIPS[i];
}

export function useTip(): string {
  return TIPS[useStore((s) => s.penguinTip) % TIPS.length];
}

export function moodLine(mood: PenguinMood): string {
  switch (mood) {
    case "sibuk":
      return "Nozi lagi nungguin proses yang jalan. Kamu tetap bisa ngedit.";
    case "error":
      return "Ada error di berkas ini. Buka panel Masalah dan klik Jelaskan biar Claude bantu.";
    case "sukses":
      return "Berhasil! Semua beres.";
    case "jempol":
      return "Tersimpan! Versi ini masuk time-travel.";
    case "hati":
      return "Hehe, makasih dielus!";
    case "semangat":
      return "Wuih, ngebut! Nozi ikut semangat.";
    default:
      return "Semua tenang. Buka berkas dengan ⌘P atau ketik apa saja di ⌘K.";
  }
}

// ---------------- Potongan UI siap pakai ----------------


export function usePenguinVariant(): PenguinVariant | undefined {
  return useStore((s) => designById(s.settings.design).penguin);
}

/** Logo kecil di title bar: Nozi + nama aplikasi. */
export function NoziBrand() {
  const v = usePenguinVariant();
  const mood = usePenguinMood();
  if (!v) return null;
  return (
    <div className="nozi-brand">
      <PenguinMascot variant={v} mood={mood} size={22} />
      <span>{v === "tuxedo" ? "NOZEL" : v === "kawanan" ? "nozel" : "Nozel"}</span>
    </div>
  );
}

/** Nozi di status bar; klik untuk tips berikutnya. */
export function NoziStatus() {
  const v = usePenguinVariant();
  const mood = usePenguinMood();
  if (!v) return null;
  return (
    <button
      className="status-item nozi-status"
      onClick={() => {
        flashPenguin("hati", 2600);
        toast(`Nozi: ${nextTip()}`);
      }}
      title="Klik untuk mengelus Nozi dan dapat tips"
    >
      <PenguinMascot variant={v} mood={mood} size={15} />
      Nozi {MOOD_LABEL[mood]}
    </button>
  );
}

/** Nozi mengintip di bawah sidebar sambil memberi tips (Antartika). */
const PEEK_KEY = "nozel.noziPeekHidden";
const readHidden = () => {
  try {
    return localStorage.getItem(PEEK_KEY) === "1";
  } catch {
    return false;
  }
};

export function NoziPeek() {
  const v = usePenguinVariant();
  const mood = usePenguinMood();
  const tip = useTip();
  const [hidden, setHidden] = useState(readHidden);
  useEffect(() => {
    const show = () => setHidden(false);
    window.addEventListener("nozel:peek-show", show);
    return () => window.removeEventListener("nozel:peek-show", show);
  }, []);
  // Gelembung tampil sebentar saat tips/suasana berganti, lalu mengecil supaya Explorer lega.
  const [bubble, setBubble] = useState(true);
  useEffect(() => {
    setBubble(true);
    const t = setTimeout(() => setBubble(false), 9000);
    return () => clearTimeout(t);
  }, [tip, mood]);
  if (!v || hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(PEEK_KEY, "1");
    } catch {
      /* abaikan */
    }
  };
  return (
    <div className={`nozi-peek ${bubble ? "has-bubble" : ""}`} onMouseEnter={() => setBubble(true)} onMouseLeave={() => setBubble(false)}>
      {bubble && (
        <>
          <button className="nozi-bubble" onClick={() => nextTip()} title="Tips berikutnya">
            {mood === "idle" ? tip : moodLine(mood)}
          </button>
          <button className="nozi-peek-x" aria-label="Sembunyikan Nozi" title="Sembunyikan Nozi (bisa dimunculkan lagi di Pengaturan)" onClick={hide}>
            ×
          </button>
        </>
      )}
      <button className="nozi-peek-body" onClick={() => flashPenguin("hati", 2600)} aria-label="Elus Nozi" title="Elus Nozi">
        <PenguinMascot variant={v} mood={mood} size={44} />
      </button>
    </div>
  );
}

/** Munculkan lagi Nozi di sidebar (dipanggil dari Pengaturan). */
export function showNoziPeek() {
  try {
    localStorage.removeItem(PEEK_KEY);
  } catch {
    /* abaikan */
  }
  window.dispatchEvent(new Event("nozel:peek-show"));
}

/** Nozi besar di beranda/dashboard. Kawanan menampilkan tiga pinguin. */
export function NoziHero({ size = 200 }: { size?: number }) {
  const v = usePenguinVariant();
  const mood = usePenguinMood();
  if (!v) return null;
  if (v === "kawanan") {
    return (
      <div className="nozi-hero nozi-flock" aria-hidden={false}>
        <PenguinMascot variant={v} mood="idle" size={Math.round(size * 0.45)} title="Nozi teman" />
        <PenguinMascot variant={v} mood={mood} size={size} />
        <PenguinMascot variant={v} mood="sukses" size={Math.round(size * 0.55)} title="Nozi teman" />
      </div>
    );
  }
  return (
    <div className={`nozi-hero nozi-${v}`}>
      {v === "antartika" && <div className="nozi-floe" aria-hidden />}
      <PenguinMascot variant={v} mood={mood} size={size} />
    </div>
  );
}

/** Daftar proses berjalan sebagai kawanan pinguin kecil (Kawanan). */
export function NoziProcesses() {
  const v = usePenguinVariant();
  const terms = useStore((s) => s.terminals);
  const claudeBusy = useStore((s) => !!s.chatRunning);
  if (!v) return null;
  const items = terms.filter((t) => t.kind !== "shell").map((t) => ({ key: t.key, label: `${t.title}${t.status === "running" ? "" : ` · kode ${t.exitCode ?? "?"}`}`, mood: (t.status === "running" ? "sibuk" : t.exitCode === 0 ? "sukses" : "error") as PenguinMood }));
  return (
    <ul className="nozi-procs">
      {items.map((it) => (
        <li key={it.key}>
          <PenguinMascot variant={v} mood={it.mood} size={20} />
          <span>{it.label}</span>
        </li>
      ))}
      <li key="claude">
        <Kepi size={20} />
        <span>{claudeBusy ? "Claude · bekerja" : "Claude · siap"}</span>
      </li>
    </ul>
  );
}
