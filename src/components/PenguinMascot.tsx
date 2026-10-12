import React, { useState, useEffect } from "react";

interface PenguinMascotProps {
  customMessage?: string | null;
  onClearMessage?: () => void;
}

const CODER_QUOTES = [
  "Nozel Code: 38 MB RAM! 🐧⚡",
  "Claude Pro CLI terhubung! 🚀",
  "Semangat ngoding hari ini! 💻✨",
  "Cmd+S buat simpan file ya!",
  "Zero memory bloat, super kencang!",
];

export const PenguinMascot: React.FC<PenguinMascotProps> = ({
  customMessage,
  onClearMessage,
}) => {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [showBubble, setShowBubble] = useState(false);
  const [isWaving, setIsWaving] = useState(false);

  useEffect(() => {
    if (customMessage) {
      setShowBubble(true);
      setIsWaving(true);
      const timer = setTimeout(() => {
        setIsWaving(false);
        if (onClearMessage) onClearMessage();
        setShowBubble(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [customMessage, onClearMessage]);

  const handleMascotClick = () => {
    setIsWaving(true);
    setQuoteIndex((prev) => (prev + 1) % CODER_QUOTES.length);
    setShowBubble(true);
    setTimeout(() => setIsWaving(false), 1200);
    setTimeout(() => setShowBubble(false), 4000);
  };

  const currentDisplay = customMessage || CODER_QUOTES[quoteIndex];

  return (
    <div
      className="tuxy-mascot-container"
      onClick={handleMascotClick}
      title="Tuxy the Coder Penguin (Klik untuk sapaan!)"
    >
      {/* Speech Bubble Tooltip */}
      {showBubble && (
        <div className="tuxy-speech-bubble" onClick={(e) => e.stopPropagation()}>
          <div className="speech-text">{currentDisplay}</div>
          <div className="speech-arrow" />
        </div>
      )}

      {/* 3D Glossy Coder Penguin */}
      <div className={`tuxy-mascot-avatar ${isWaving ? "waving" : ""}`}>
        <svg
          viewBox="0 0 160 160"
          className="tuxy-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* 3D Body Radial Gradient */}
            <radialGradient id="body3D" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#3d4454" />
              <stop offset="45%" stopColor="#1e222d" />
              <stop offset="85%" stopColor="#0d0e14" />
              <stop offset="100%" stopColor="#050608" />
            </radialGradient>

            {/* Glossy Belly Gradient */}
            <radialGradient id="belly3D" cx="50%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="65%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>

            {/* Glowing Metallic Blue Headphones */}
            <linearGradient id="phoneGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>

            {/* Beak & Feet Orange 3D */}
            <linearGradient id="beakGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="70%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>

            {/* Soft Shadow */}
            <filter id="mascotGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Under-body Shadow */}
          <ellipse cx="80" cy="148" rx="48" ry="8" fill="rgba(0,0,0,0.4)" />

          {/* Feet */}
          <ellipse cx="58" cy="144" rx="16" ry="7" fill="url(#beakGrad)" />
          <ellipse cx="102" cy="144" rx="16" ry="7" fill="url(#beakGrad)" />

          {/* Main 3D Glossy Body */}
          <ellipse cx="80" cy="88" rx="46" ry="54" fill="url(#body3D)" filter="url(#mascotGlow)" />

          {/* Specular Highlight on Head */}
          <ellipse cx="72" cy="52" rx="22" ry="12" fill="rgba(255,255,255,0.08)" />

          {/* 3D Belly */}
          <ellipse cx="80" cy="98" rx="32" ry="38" fill="url(#belly3D)" />

          {/* Left Wing (Resting) */}
          <path
            d="M 36 84 C 22 96, 24 116, 38 118 C 44 110, 42 96, 36 84 Z"
            fill="#1e222d"
          />

          {/* Right Wing (Waving Upwards like mockup) */}
          <g className="tuxy-waving-arm">
            <path
              d="M 124 84 C 142 70, 148 52, 136 46 C 126 44, 118 64, 124 84 Z"
              fill="#1e222d"
            />
            {/* Wing highlight */}
            <ellipse cx="134" cy="56" rx="4" ry="10" transform="rotate(25 134 56)" fill="rgba(255,255,255,0.12)" />
          </g>

          {/* Cute Eyes (Big 3D eyes) */}
          <ellipse cx="65" cy="62" rx="10" ry="12" fill="#0f172a" />
          <ellipse cx="95" cy="62" rx="10" ry="12" fill="#0f172a" />

          {/* Eye Sparkles */}
          <circle cx="68" cy="58" r="3.8" fill="#ffffff" />
          <circle cx="62" cy="66" r="1.6" fill="#ffffff" />
          <circle cx="98" cy="58" r="3.8" fill="#ffffff" />
          <circle cx="92" cy="66" r="1.6" fill="#ffffff" />

          {/* 3D Blue Glasses Frame (Matching Mockup) */}
          <rect x="50" y="49" width="30" height="25" rx="7" fill="none" stroke="#38bdf8" strokeWidth="3.5" />
          <rect x="80" y="49" width="30" height="25" rx="7" fill="none" stroke="#38bdf8" strokeWidth="3.5" />
          <line x1="78" y1="61" x2="82" y2="61" stroke="#38bdf8" strokeWidth="3.5" />
          {/* Glasses Glass Reflection */}
          <line x1="55" y1="53" x2="65" y2="53" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="85" y1="53" x2="95" y2="53" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />

          {/* 3D Beak */}
          <polygon points="72,71 88,71 80,84" fill="url(#beakGrad)" />
          <ellipse cx="80" cy="71" rx="8" ry="2" fill="#fbbf24" />

          {/* Cute Rosy Cheeks */}
          <ellipse cx="50" cy="74" rx="5.5" ry="3.5" fill="rgba(244, 63, 94, 0.45)" />
          <ellipse cx="110" cy="74" rx="5.5" ry="3.5" fill="rgba(244, 63, 94, 0.45)" />

          {/* Metallic Blue Headphones (Matching Mockup) */}
          {/* Headband */}
          <path
            d="M 38 60 A 44 44 0 0 1 122 60"
            fill="none"
            stroke="url(#phoneGlow)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Headband cushion */}
          <path
            d="M 52 40 A 40 40 0 0 1 108 40"
            fill="none"
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {/* Left Earcup */}
          <rect x="29" y="53" width="10" height="20" rx="5" fill="url(#phoneGlow)" filter="url(#mascotGlow)" />
          <ellipse cx="34" cy="63" rx="3" ry="7" fill="#60a5fa" />
          {/* Right Earcup */}
          <rect x="121" y="53" width="10" height="20" rx="5" fill="url(#phoneGlow)" filter="url(#mascotGlow)" />
          <ellipse cx="126" cy="63" rx="3" ry="7" fill="#60a5fa" />
        </svg>
      </div>
    </div>
  );
};
