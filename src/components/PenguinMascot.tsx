import React, { useState, useEffect } from "react";

interface PenguinMascotProps {
  customMessage?: string | null;
  onClearMessage?: () => void;
}

const CYBER_TELEMETRY = [
  "SYSTEM NOMINAL // 38 MB RAM ⚡",
  "NEURAL CLAUDE PRO // SYNCED 🚀",
  "M1 SILICON // ZERO BLOAT 💻",
  "CORE COMPILED // 0 LATENCY 🛡️",
  "QUANTUM BUFFER // READY ✨",
];

export const PenguinMascot: React.FC<PenguinMascotProps> = ({
  customMessage,
  onClearMessage,
}) => {
  const [telemetryIndex, setTelemetryIndex] = useState(0);
  const [showHud, setShowHud] = useState(false);
  const [isCharging, setIsCharging] = useState(false);

  useEffect(() => {
    if (customMessage) {
      setShowHud(true);
      setIsCharging(true);
      const timer = setTimeout(() => {
        setIsCharging(false);
        if (onClearMessage) onClearMessage();
        setShowHud(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [customMessage, onClearMessage]);

  const handleMascotClick = () => {
    setIsCharging(true);
    setTelemetryIndex((prev) => (prev + 1) % CYBER_TELEMETRY.length);
    setShowHud(true);
    setTimeout(() => setIsCharging(false), 1200);
    setTimeout(() => setShowHud(false), 4000);
  };

  const currentDisplay = customMessage || CYBER_TELEMETRY[telemetryIndex];

  return (
    <div
      className="cyber-tux-container"
      onClick={handleMascotClick}
      title="Mecha-Tux 3.0 // Cyber Coder AI Unit (Click to Ping)"
    >
      {/* Holographic Cyber HUD Bubble */}
      {showHud && (
        <div className="cyber-hud-bubble" onClick={(e) => e.stopPropagation()}>
          <div className="hud-header">
            <span className="hud-dot" />
            <span className="hud-title">MECHA_TUX // TELEMETRY</span>
          </div>
          <div className="hud-text">{currentDisplay}</div>
          <div className="hud-corner-accent" />
        </div>
      )}

      {/* Futuristic Mecha-Tux 3D Vector */}
      <div className={`cyber-tux-avatar ${isCharging ? "charging" : ""}`}>
        <svg
          viewBox="0 0 160 160"
          className="cyber-tux-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Carbon Fiber / Metallic Obsidian Body Gradient */}
            <radialGradient id="carbonBody" cx="40%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#2a3042" />
              <stop offset="35%" stopColor="#141724" />
              <stop offset="75%" stopColor="#080a12" />
              <stop offset="100%" stopColor="#020307" />
            </radialGradient>

            {/* Titanium Chest Plate Gradient */}
            <linearGradient id="titaniumPlate" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="45%" stopColor="#94a3b8" />
              <stop offset="85%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            {/* Electric Cyber Cyan Glow */}
            <linearGradient id="cyberLaser" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00f0ff" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>

            {/* Golden Plasma Beak */}
            <linearGradient id="plasmaGold" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>

            {/* Neon Glow Filter */}
            <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Subtle Drop Shadow */}
            <filter id="chassisShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Holographic Platform Ring */}
          <ellipse cx="80" cy="148" rx="46" ry="7" fill="rgba(0, 240, 255, 0.15)" filter="url(#neonGlow)" />
          <ellipse cx="80" cy="148" rx="36" ry="5" fill="none" stroke="#00f0ff" strokeWidth="1" opacity="0.6" strokeDasharray="4 3" />

          {/* Cyber Thruster / Feet */}
          <path d="M 52 140 L 46 148 L 68 148 L 64 140 Z" fill="url(#plasmaGold)" />
          <path d="M 96 140 L 92 148 L 114 148 L 108 140 Z" fill="url(#plasmaGold)" />

          {/* Main Mecha Body Chassis */}
          <ellipse cx="80" cy="86" rx="44" ry="52" fill="url(#carbonBody)" filter="url(#chassisShadow)" />

          {/* Cybernetic Panel Seam Lines */}
          <path d="M 46 64 C 44 80, 48 108, 58 126" fill="none" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1" />
          <path d="M 114 64 C 116 80, 112 108, 102 126" fill="none" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1" />

          {/* Armor Chest Plate (Titanium Hex Core) */}
          <path
            d="M 62 76 L 98 76 L 104 108 L 80 128 L 56 108 Z"
            fill="url(#titaniumPlate)"
            opacity="0.95"
          />

          {/* Quantum Arc Reactor Core (Glowing Cyan Hexagon) */}
          <polygon
            points="80,94 88,98 88,107 80,111 72,107 72,98"
            fill="#00f0ff"
            filter="url(#neonGlow)"
          />
          <circle cx="80" cy="102.5" r="2.5" fill="#ffffff" />

          {/* Left Wing (Resting Chassis) */}
          <path
            d="M 38 80 C 24 94, 26 112, 40 114 C 44 104, 42 90, 38 80 Z"
            fill="#141724"
            stroke="rgba(0, 240, 255, 0.3)"
            strokeWidth="1"
          />
          {/* Neon circuit line on left wing */}
          <path d="M 34 94 L 38 106" stroke="#00f0ff" strokeWidth="1.5" filter="url(#neonGlow)" />

          {/* Right Cyber Wing (Waving Upward with Thruster Flare) */}
          <g className="cyber-waving-wing">
            <path
              d="M 122 80 C 140 66, 146 48, 134 42 C 124 40, 116 60, 122 80 Z"
              fill="#141724"
              stroke="rgba(0, 240, 255, 0.5)"
              strokeWidth="1"
            />
            {/* Wing Laser Flare */}
            <path d="M 126 50 L 138 46" stroke="#00f0ff" strokeWidth="2" filter="url(#neonGlow)" />
            <circle cx="136" cy="45" r="3" fill="#00f0ff" filter="url(#neonGlow)" />
            <circle cx="136" cy="45" r="1.5" fill="#ffffff" />
          </g>

          {/* Head Chassis */}
          <ellipse cx="80" cy="56" rx="34" ry="26" fill="url(#carbonBody)" />

          {/* Holographic Cyber Visor (Curved Neon HUD Visor) */}
          <path
            d="M 52 50 C 60 46, 100 46, 108 50 C 112 56, 106 66, 80 67 C 54 66, 48 56, 52 50 Z"
            fill="rgba(0, 240, 255, 0.25)"
            stroke="#00f0ff"
            strokeWidth="2"
            filter="url(#neonGlow)"
          />

          {/* Digital HUD Eye Display on Visor */}
          <rect x="62" y="52" width="10" height="7" rx="2" fill="#00f0ff" filter="url(#neonGlow)" />
          <rect x="88" y="52" width="10" height="7" rx="2" fill="#00f0ff" filter="url(#neonGlow)" />
          <circle cx="67" cy="55.5" r="1.5" fill="#ffffff" />
          <circle cx="93" cy="55.5" r="1.5" fill="#ffffff" />

          {/* Visor Scanline Reflection */}
          <path d="M 56 52 L 104 52" stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeLinecap="round" />

          {/* Golden Plasma Beak */}
          <polygon points="74,65 86,65 80,75" fill="url(#plasmaGold)" />
          <polygon points="76,65 84,65 80,71" fill="#fef08a" />

          {/* High-Tech Cyber Headset & Antenna */}
          <path
            d="M 44 54 A 38 38 0 0 1 116 54"
            fill="none"
            stroke="#334155"
            strokeWidth="4"
          />
          {/* Glowing Top Headband Wire */}
          <path
            d="M 56 36 A 32 32 0 0 1 104 36"
            fill="none"
            stroke="#00f0ff"
            strokeWidth="1.5"
            filter="url(#neonGlow)"
          />
          {/* Left Cyber Earpiece */}
          <rect x="38" y="48" width="8" height="16" rx="4" fill="#0f172a" stroke="#00f0ff" strokeWidth="1.5" />
          <circle cx="42" cy="56" r="2" fill="#00f0ff" />
          {/* Right Cyber Earpiece + Holographic Antenna */}
          <rect x="114" y="48" width="8" height="16" rx="4" fill="#0f172a" stroke="#00f0ff" strokeWidth="1.5" />
          <line x1="118" y1="48" x2="126" y2="30" stroke="#00f0ff" strokeWidth="2" filter="url(#neonGlow)" />
          <circle cx="126" cy="30" r="2.5" fill="#00f0ff" filter="url(#neonGlow)" />
          <circle cx="126" cy="30" r="1" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
};
