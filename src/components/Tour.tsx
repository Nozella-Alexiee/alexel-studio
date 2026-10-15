// Tur singkat 4 langkah: muncul sekali setelah project pertama dibuka, bisa diulang dari
// palette perintah ("Tur singkat") atau Pengaturan. Menyorot elemen asli di layar.

import { useEffect, useLayoutEffect, useState } from "react";
import { create } from "zustand";
import { prettyKeys } from "../app/commands";
import { useStore } from "../state/store";
import { PenguinMascot, usePenguinVariant } from "./PenguinMascot";
import { CrabMascot } from "./CrabMascot";

const DONE_KEY = "nozel.tourDone";

interface Step {
  target: string;
  title: string;
  body: () => string;
}

const STEPS: Step[] = [
  { target: ".sidebar, .zen-nav", title: "Seret berkas ke editor", body: () => "Tarik berkas dari Explorer ke editor untuk membukanya. Lepas di tepi kanan editor untuk membuka berdampingan." },
  { target: ".tabstrip", title: "Tab bisa digeser", body: () => `Seret tab untuk mengurutkan, atau ke tepi kanan editor untuk membelah. Tab yang tertutup bisa dibuka lagi dengan ${prettyKeys("Mod+Shift+T")}.` },
  { target: ".cm-editor", title: `Seleksi kode, lalu ${prettyKeys("Mod+K")}`, body: () => "Claude mengubah kode langsung di tempat. Setiap perubahan tampil hijau/merah dan bisa diterima atau ditolak satu per satu. Klik kanan untuk aksi lainnya." },
  { target: ".nozi-status, .sb-claude, .statusbar", title: "Nozi & Kepi ikut bereaksi", body: () => "Nozi senang saat simpan, run, dan commit berhasil, dan ikut panik saat ada error. Kepi menemani Claude. Klik mereka untuk menyapa." },
];

const useTour = create<{ step: number }>(() => ({ step: -1 }));

export function startTour() {
  useTour.setState({ step: 0 });
}

function markDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* abaikan */
  }
}

function seen(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true;
  }
}

function rectOf(sel: string): DOMRect | null {
  for (const s of sel.split(",")) {
    const el = document.querySelector(s.trim());
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) return r;
    }
  }
  return null;
}

export function TourHost() {
  const step = useTour((s) => s.step);
  const root = useStore((s) => s.root);
  const hasTab = useStore((s) => !!s.groups[0]?.active);
  const penguin = usePenguinVariant();
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Pertama kali: tunggu sampai ada project & berkas terbuka supaya semua bagian bisa disorot.
  useEffect(() => {
    if (root && hasTab && !seen() && useTour.getState().step < 0) {
      const t = setTimeout(() => useTour.setState({ step: 0 }), 900);
      return () => clearTimeout(t);
    }
  }, [root, hasTab]);

  useLayoutEffect(() => {
    if (step < 0) return;
    const update = () => setRect(rectOf(STEPS[step].target));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [step]);

  useEffect(() => {
    if (step < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (step < 0) return null;
  const s = STEPS[step];
  const end = () => {
    markDone();
    useTour.setState({ step: -1 });
  };
  const next = () => {
    if (step >= STEPS.length - 1) {
      end();
      void import("./PenguinMascot").then((m) => m.flashPenguin("jempol", 2600));
    } else useTour.setState({ step: step + 1 });
  };
  // Letak gelembung: di samping sorotan, tetap di dalam jendela.
  const W = 320;
  const pad = 14;
  let left = window.innerWidth / 2 - W / 2;
  let top = window.innerHeight / 2 - 90;
  if (rect) {
    const roomRight = window.innerWidth - rect.right;
    if (roomRight > W + pad * 2) left = rect.right + pad;
    else if (rect.left > W + pad * 2) left = rect.left - W - pad;
    else left = Math.min(Math.max(pad, rect.left), window.innerWidth - W - pad);
    top = roomRight > W + pad * 2 || rect.left > W + pad * 2 ? Math.min(Math.max(pad, rect.top + 20), window.innerHeight - 220) : Math.min(rect.bottom + pad, window.innerHeight - 220);
  }
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? <div className="tour-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="tour-dim" />}
      <div className="tour-card" style={{ left, top, width: W }}>
        <div className="tour-head">
          {step === 2 ? <CrabMascot mood="melambai" size={34} /> : penguin ? <PenguinMascot variant={penguin} mood="sukses" size={34} /> : <CrabMascot mood="siap" size={34} />}
          <div>
            <div className="tour-step">
              Langkah {step + 1} dari {STEPS.length}
            </div>
            <div className="tour-title" id="tour-title">
              {s.title}
            </div>
          </div>
        </div>
        <p className="tour-body">{s.body()}</p>
        <div className="tour-foot">
          {STEPS.map((_, i) => (
            <span key={i} className={`tour-dot ${i === step ? "is-on" : ""}`} />
          ))}
          <span className="spacer" />
          <button className="btn btn-sm" onClick={end}>
            Lewati
          </button>
          <button className="btn btn-sm btn-primary" onClick={next} autoFocus>
            {step >= STEPS.length - 1 ? "Selesai" : "Berikutnya"}
          </button>
        </div>
      </div>
    </div>
  );
}
