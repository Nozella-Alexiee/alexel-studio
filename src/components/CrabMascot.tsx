// Kepi, kepiting pixel teman Claude Code. Desain orisinal Nozel (bukan logo/maskot resmi Anthropic).
// Ekspresi mengikuti keadaan Claude: siap, mikir (sedang menjawab), sukses, error, melambai (disapa).

import { memo, useEffect, useState } from "react";
import { setState, useStore } from "../state/store";
import { tl } from "../i18n";

export type KepiMood = "siap" | "mikir" | "sukses" | "error" | "melambai";

export const KEPI_LABEL: Record<KepiMood, string> = { siap: tl("siap"), mikir: tl("lagi mikir"), sukses: tl("beres!"), error: tl("nemu masalah"), melambai: tl("halo!") };

const SHELL = "#d97757";
const SHADE = "#b9583a";
const LIGHT = "#f0a07f";
const EYE = "#fff7f0";
const INK = "#2a1a14";

export const CrabMascot = memo(function CrabMascot({ mood = "siap", size = 24, title, className = "" }: { mood?: KepiMood; size?: number; title?: string; className?: string }) {
  const open = mood === "siap" || mood === "mikir" || mood === "melambai";
  const look = mood === "mikir" ? -2 : 0;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={title ?? `Kepi, ${KEPI_LABEL[mood]}`} className={`crab crab-${mood} ${className}`}>
      <rect x="14" y="58" width="36" height="3" fill="#000" opacity="0.18" />
      <g className="crab-body">
        <rect x="10" y="47" width="6" height="3" fill={SHADE} />
        <rect x="7" y="51" width="6" height="3" fill={SHADE} />
        <rect x="48" y="47" width="6" height="3" fill={SHADE} />
        <rect x="51" y="51" width="6" height="3" fill={SHADE} />
        <rect x="18" y="50" width="4" height="5" fill={SHADE} />
        <rect x="42" y="50" width="4" height="5" fill={SHADE} />
        <rect x="16" y="28" width="32" height="2" fill={SHELL} />
        <rect x="14" y="30" width="36" height="16" fill={SHELL} />
        <rect x="14" y="44" width="36" height="4" fill={SHADE} />
        <rect x="16" y="48" width="32" height="2" fill={SHADE} />
        <rect x="18" y="31" width="10" height="2" fill={LIGHT} />
        <rect x="22" y="20" width="3" height="10" fill={SHELL} />
        <rect x="39" y="20" width="3" height="10" fill={SHELL} />
        <rect x="18" y="12" width="11" height="10" fill={EYE} />
        <rect x="35" y="12" width="11" height="10" fill={EYE} />
        {open && (
          <>
            <rect x={22 + look} y="15" width="4" height="5" fill={INK} />
            <rect x={39 + look} y="15" width="4" height="5" fill={INK} />
            <rect className="crab-lid" x="18" y="12" width="11" height="10" fill={SHELL} />
            <rect className="crab-lid" x="35" y="12" width="11" height="10" fill={SHELL} />
          </>
        )}
        {mood === "sukses" && (
          <g fill={INK}>
            <rect x="20" y="17" width="2" height="2" /><rect x="22" y="15" width="3" height="2" /><rect x="25" y="17" width="2" height="2" />
            <rect x="37" y="17" width="2" height="2" /><rect x="39" y="15" width="3" height="2" /><rect x="42" y="17" width="2" height="2" />
          </g>
        )}
        {mood === "error" && (
          <g fill={INK}>
            <rect x="20" y="14" width="2" height="2" /><rect x="22" y="16" width="3" height="2" /><rect x="25" y="18" width="2" height="2" /><rect x="25" y="14" width="2" height="2" /><rect x="20" y="18" width="2" height="2" />
            <rect x="37" y="14" width="2" height="2" /><rect x="39" y="16" width="3" height="2" /><rect x="42" y="18" width="2" height="2" /><rect x="42" y="14" width="2" height="2" /><rect x="37" y="18" width="2" height="2" />
            <rect x="50" y="6" width="3" height="5" fill="#8fd3ff" /><rect x="49" y="9" width="5" height="3" fill="#8fd3ff" />
          </g>
        )}
        <rect x="18" y="36" width="4" height="3" fill={LIGHT} />
        <rect x="42" y="36" width="4" height="3" fill={LIGHT} />
        {mood === "error" ? (
          <g fill={INK}>
            <rect x="27" y="39" width="2" height="2" /><rect x="29" y="37" width="6" height="2" /><rect x="35" y="39" width="2" height="2" />
          </g>
        ) : (
          <g fill={INK}>
            <rect x="27" y="36" width="2" height="2" /><rect x="29" y="38" width="6" height="2" /><rect x="35" y="36" width="2" height="2" />
          </g>
        )}
        <rect x="8" y="32" width="6" height="4" fill={SHELL} />
        <rect x="50" y="32" width="6" height="4" fill={SHELL} />
        <g className="crab-claw-l">
          <rect x="2" y="27" width="9" height="5" fill={SHELL} />
          <g className="crab-jaw-l">
            <rect x="0" y="18" width="9" height="6" fill={SHELL} />
            <rect x="2" y="20" width="4" height="2" fill={LIGHT} />
          </g>
        </g>
        <g className="crab-claw-r">
          <rect x="53" y="27" width="9" height="5" fill={SHELL} />
          <g className="crab-jaw-r">
            <rect x="55" y="18" width="9" height="6" fill={SHELL} />
            <rect x="58" y="20" width="4" height="2" fill={LIGHT} />
          </g>
        </g>
      </g>
      {mood === "mikir" && (
        <g className="crab-dots" fill={SHELL}>
          <rect x="44" y="3" width="4" height="4" />
          <rect x="51" y="3" width="4" height="4" />
          <rect x="58" y="3" width="4" height="4" />
        </g>
      )}
      {mood === "sukses" && (
        <g className="crab-spark" fill="#ffcf70">
          <rect x="5" y="4" width="2" height="8" /><rect x="2" y="7" width="8" height="2" />
          <rect x="56" y="2" width="2" height="6" /><rect x="54" y="4" width="6" height="2" />
        </g>
      )}
    </svg>
  );
});

/** Tampilkan ekspresi Kepi sesaat (mis. sukses setelah jawaban selesai). */
export function flashKepi(mood: KepiMood, ms = 3500) {
  setState({ kepiFlash: { mood, until: Date.now() + ms } });
}

export function useKepiMood(): KepiMood {
  const flash = useStore((s) => s.kepiFlash);
  const busy = useStore((s) => !!s.chatRunning || !!s.inlineClaudeBusy);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!flash) return;
    const left = flash.until - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => tick((x) => x + 1), left + 30);
    return () => clearTimeout(t);
  }, [flash]);
  if (flash && flash.until > Date.now()) return flash.mood;
  return busy ? "mikir" : "siap";
}

/** Kepi yang mengikuti keadaan Claude; klik untuk melambai. */
export function Kepi({ size = 18, className = "" }: { size?: number; className?: string }) {
  const mood = useKepiMood();
  return <CrabMascot mood={mood} size={size} className={className} />;
}
