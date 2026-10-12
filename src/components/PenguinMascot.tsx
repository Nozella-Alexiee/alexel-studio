import React, { useState, useEffect } from "react";

interface PenguinMascotProps {
  customMessage?: string | null;
  onClearMessage?: () => void;
}

const CODER_QUOTES = [
  "RAM 8 GB tetap adem & kenceng di Nozel Code! 🐧⚡",
  "Kopi siap, kode mantap, bebas bloatware Electron!",
  "Claude Pro CLI terhubung tanpa boros token API 🚀",
  "Semangat ngoding! Jangan lupa commit ya! 💻✨",
  "Cold start di bawah 600ms, bye-bye loading lama!",
  "Tekan Cmd+S buat simpan, aku yang jagain kodinganmu!",
  "Tuxy siap nemenin pair programming hari ini 🐧🎧",
];

export const PenguinMascot: React.FC<PenguinMascotProps> = ({
  customMessage,
  onClearMessage,
}) => {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [showBubble, setShowBubble] = useState(true);
  const [isWaving, setIsWaving] = useState(false);

  // If a custom message comes in (e.g. from Save or Claude action), show it prominently
  useEffect(() => {
    if (customMessage) {
      setShowBubble(true);
      setIsWaving(true);
      const timer = setTimeout(() => {
        setIsWaving(false);
        if (onClearMessage) onClearMessage();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [customMessage, onClearMessage]);

  const handleMascotClick = () => {
    setIsWaving(true);
    setQuoteIndex((prev) => (prev + 1) % CODER_QUOTES.length);
    setShowBubble(true);
    setTimeout(() => setIsWaving(false), 800);
  };

  const currentDisplay = customMessage || CODER_QUOTES[quoteIndex];

  return (
    <div className="tuxy-mascot-container" onClick={handleMascotClick} title="Klik Tuxy si Pinguin Coder!">
      {/* Speech Bubble */}
      {showBubble && (
        <div className="tuxy-speech-bubble" onClick={(e) => e.stopPropagation()}>
          <div className="speech-text">{currentDisplay}</div>
          <div className="speech-arrow" />
        </div>
      )}

      {/* 3D-styled Cute SVG Penguin */}
      <div className={`tuxy-mascot-avatar ${isWaving ? "waving" : ""}`}>
        <svg
          viewBox="0 0 120 120"
          className="tuxy-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Body gradient */}
            <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2c303c" />
              <stop offset="40%" stopColor="#1a1c24" />
              <stop offset="100%" stopColor="#0d0e14" />
            </linearGradient>

            {/* Belly gradient */}
            <linearGradient id="bellyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>

            {/* Beak & feet gradient */}
            <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>

            {/* Headphone band gradient */}
            <linearGradient id="phoneGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            {/* Glow shadow */}
            <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#3b82f6" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Shadow underneath */}
          <ellipse cx="60" cy="112" rx="38" ry="6" fill="rgba(0,0,0,0.35)" />

          {/* Feet */}
          <ellipse cx="44" cy="110" rx="12" ry="5" fill="url(#orangeGrad)" />
          <ellipse cx="76" cy="110" rx="12" ry="5" fill="url(#orangeGrad)" />

          {/* Main Body */}
          <ellipse cx="60" cy="68" rx="36" ry="42" fill="url(#bodyGrad)" filter="url(#softGlow)" />

          {/* White Belly */}
          <ellipse cx="60" cy="74" rx="24" ry="30" fill="url(#bellyGrad)" />

          {/* Left Wing */}
          <path
            d="M 25 65 C 16 75, 18 90, 28 92 C 32 85, 30 75, 25 65 Z"
            fill="#1a1c24"
          />

          {/* Right Wing (Waving wing) */}
          <path
            className="tuxy-waving-wing"
            d="M 95 65 C 105 75, 103 90, 93 92 C 89 85, 91 75, 95 65 Z"
            fill="#1a1c24"
          />

          {/* Cute Eyes with Sparkle */}
          <ellipse cx="49" cy="48" rx="7.5" ry="9" fill="#1e293b" />
          <ellipse cx="71" cy="48" rx="7.5" ry="9" fill="#1e293b" />

          {/* Eye Sparkles */}
          <circle cx="51.5" cy="45" r="2.8" fill="#ffffff" />
          <circle cx="47.5" cy="51" r="1.2" fill="#ffffff" />
          <circle cx="73.5" cy="45" r="2.8" fill="#ffffff" />
          <circle cx="69.5" cy="51" r="1.2" fill="#ffffff" />

          {/* Cute Coder Glasses */}
          <rect x="37" y="39" width="22" height="18" rx="5" fill="none" stroke="#38bdf8" strokeWidth="2.5" />
          <rect x="61" y="39" width="22" height="18" rx="5" fill="none" stroke="#38bdf8" strokeWidth="2.5" />
          <line x1="59" y1="48" x2="61" y2="48" stroke="#38bdf8" strokeWidth="2.5" />

          {/* Cute Beak */}
          <polygon points="54,55 66,55 60,65" fill="url(#orangeGrad)" />

          {/* Rosy Cheeks */}
          <ellipse cx="37" cy="57" rx="4" ry="2.5" fill="rgba(244, 63, 94, 0.45)" />
          <ellipse cx="83" cy="57" rx="4" ry="2.5" fill="rgba(244, 63, 94, 0.45)" />

          {/* Coder Headphones */}
          <path
            d="M 28 46 A 34 34 0 0 1 92 46"
            fill="none"
            stroke="url(#phoneGrad)"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          {/* Ear Cups */}
          <rect x="22" y="42" width="7" height="14" rx="3.5" fill="#3b82f6" />
          <rect x="91" y="42" width="7" height="14" rx="3.5" fill="#06b6d4" />
        </svg>
      </div>

      {/* Mascot Info Tag */}
      <div className="tuxy-tag">
        <span className="tuxy-name">Tuxy</span>
        <span className="tuxy-badge">Nozel AI</span>
      </div>
    </div>
  );
};
