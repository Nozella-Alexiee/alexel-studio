import { BatteryCharging, Leaf, Plug } from "lucide-react";
import React from "react";
import { COMMANDS, prettyKeys } from "../app/commands";
import * as A from "../app/actions";
import { Segmented } from "../components/ui";
import { ACCENTS, DESIGNS, type DesignId } from "../design/designs";
import { isSaver, useStore, type Settings } from "../state/store";
import { detectClaude } from "../claude/claude";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <div>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={value} aria-label={label} className={`switch ${value ? "is-on" : ""}`} onClick={() => onChange(!value)} />;
}

/** Miniatur tata letak tiap desain (digambar dengan CSS, bukan gambar). */
function LayoutThumb({ id }: { id: DesignId }) {
  return (
    <div className={`thumb thumb-${id}`} aria-hidden>
      <div className="t-bar" />
      <div className="t-body">
        {id !== "zen" && <div className="t-rail" />}
        <div className="t-side" />
        <div className="t-main">
          <div className="t-code" />
          {id === "aurora" && <div className="t-dock" />}
          {id === "control" && <div className="t-panel" />}
          {id === "zen" && <div className="t-omni" />}
        </div>
        <div className="t-right" />
      </div>
    </div>
  );
}

export default function SettingsView() {
  const s = useStore((st) => st.settings);
  const power = useStore((st) => st.power);
  const saver = useStore((st) => isSaver(st));
  const claude = useStore((st) => st.claude);
  const set = (p: Partial<Settings>) => A.updateSettings(p);
  const shortcuts = COMMANDS.filter((c) => c.keys && !c.hidden);

  return (
    <div className="settings">
      <h1>Pengaturan</h1>

      <section className="set-section">
        <h2>Desain</h2>
        <p className="hint">Ganti kapan saja. Tata letak, warna, font, dan kepadatan ikut berubah. Shortcut: {prettyKeys("Ctrl+Mod+T")}.</p>
        <div className="design-cards">
          {DESIGNS.map((d) => (
            <button key={d.id} className={`design-card ${s.design === d.id ? "is-on" : ""}`} onClick={() => A.setDesign(d.id)} aria-pressed={s.design === d.id} style={{ "--sw-bg": d.swatch.bg, "--sw-panel": d.swatch.panel, "--sw-accent": d.swatch.accent, "--sw-text": d.swatch.text, "--sw-alt": d.swatch.alt } as React.CSSProperties}>
              <LayoutThumb id={d.id} />
              <div className="design-name">{d.name}</div>
              <div className="design-tag">{d.tagline}</div>
            </button>
          ))}
        </div>
        <Row label="Warna aksen" hint="Khusus desain yang sedang dipakai.">
          <div className="accent-row">
            <button className={`accent-dot auto ${!s.accent ? "is-on" : ""}`} onClick={() => set({ accent: null })} aria-label="Bawaan desain">
              A
            </button>
            {ACCENTS[s.design].map((c) => (
              <button key={c} className={`accent-dot ${s.accent === c ? "is-on" : ""}`} style={{ background: c }} onClick={() => set({ accent: c })} aria-label={`Aksen ${c}`} />
            ))}
          </div>
        </Row>
        <Row label="Tata letak" hint="Lebar panel yang kamu geser disimpan per desain.">
          <button className="btn btn-sm" onClick={A.resetLayout}>
            Kembalikan bawaan
          </button>
        </Row>
      </section>

      <section className="set-section">
        <h2>Editor</h2>
        <Row label="Ukuran huruf">
          <div className="stepper">
            <button className="btn btn-sm" onClick={() => set({ fontSize: Math.max(9, s.fontSize - 1) })} aria-label="Perkecil">−</button>
            <span className="mono">{s.fontSize}px</span>
            <button className="btn btn-sm" onClick={() => set({ fontSize: Math.min(28, s.fontSize + 1) })} aria-label="Perbesar">+</button>
          </div>
        </Row>
        <Row label="Lebar tab">
          <Segmented label="Lebar tab" value={String(s.tabSize)} onChange={(v) => set({ tabSize: Number(v) })} options={[{ id: "2", label: "2" }, { id: "4", label: "4" }, { id: "8", label: "8" }]} />
        </Row>
        <Row label="Bungkus baris panjang">
          <Toggle label="Bungkus baris" value={s.wordWrap} onChange={(v) => set({ wordWrap: v })} />
        </Row>
        <Row label="Minimap" hint="Otomatis mati di mode hemat daya.">
          <Toggle label="Minimap" value={s.minimap} onChange={(v) => set({ minimap: v })} />
        </Row>
        <Row label="Simpan otomatis" hint="Menyimpan 1,2 detik setelah berhenti mengetik.">
          <Toggle label="Simpan otomatis" value={s.autoSave === "delay"} onChange={(v) => set({ autoSave: v ? "delay" : "off" })} />
        </Row>
      </section>

      <section className="set-section">
        <h2>
          <Leaf size={16} aria-hidden /> Mode hemat daya
        </h2>
        <p className="hint">Mengurangi polling, animasi, minimap, dan pemindaian di latar saat MacBook memakai baterai.</p>
        <Row label="Aktifkan" hint={power ? `Sekarang: ${power.on_battery ? "baterai" : "listrik"}${power.percent != null ? ` ${power.percent}%` : ""}${power.low_power_mode ? " · Low Power Mode" : ""}` : undefined}>
          <Segmented
            label="Mode hemat daya"
            value={s.powerMode}
            onChange={(v) => set({ powerMode: v })}
            options={[
              { id: "auto", label: "Otomatis" },
              { id: "on", label: "Selalu" },
              { id: "off", label: "Mati" },
            ]}
          />
        </Row>
        <div className={`power-state ${saver ? "on" : ""}`}>
          {saver ? <Leaf size={14} /> : power?.on_battery ? <BatteryCharging size={14} /> : <Plug size={14} />}
          {saver ? "Hemat daya sedang aktif" : "Performa penuh"}
        </div>
      </section>

      <section className="set-section">
        <h2>Git Bot</h2>
        <Row label="Setiap simpan" hint="Hanya berkas yang disimpan yang di-commit. Dilewati saat merge/rebase, konflik, atau berkas mirip rahasia (.env, .pem).">
          <Segmented
            label="Git Bot"
            value={s.gitBot}
            onChange={(v) => set({ gitBot: v })}
            options={[
              { id: "off", label: "Mati" },
              { id: "commit", label: "Commit" },
              { id: "push", label: "Commit + push" },
            ]}
          />
        </Row>
      </section>

      <section className="set-section">
        <h2>Claude Code</h2>
        <Row label="Status" hint={claude?.path ?? undefined}>
          <span className={claude?.installed ? "tone-success-fg" : "tone-danger-fg"}>{claude ? (claude.installed ? claude.version : claude.error) : "belum diperiksa"}</span>
          <button className="btn btn-sm" onClick={() => void detectClaude()}>
            Periksa ulang
          </button>
        </Row>
        <Row label="Tampilkan isi sebelum dikirim" hint="Kamu melihat persis teks dan berkas yang akan dikirim ke Claude.">
          <Toggle label="Konfirmasi kirim" value={s.claudeConfirm} onChange={(v) => set({ claudeConfirm: v })} />
        </Row>
        <Row label="Sertakan berkas aktif secara bawaan">
          <Toggle label="Sertakan berkas aktif" value={s.claudeIncludeFile} onChange={(v) => set({ claudeIncludeFile: v })} />
        </Row>
      </section>

      <section className="set-section">
        <h2>Terminal & berkas</h2>
        <Row label="Ukuran huruf terminal">
          <div className="stepper">
            <button className="btn btn-sm" onClick={() => set({ terminalFontSize: Math.max(9, s.terminalFontSize - 1) })} aria-label="Perkecil">−</button>
            <span className="mono">{s.terminalFontSize}px</span>
            <button className="btn btn-sm" onClick={() => set({ terminalFontSize: Math.min(24, s.terminalFontSize + 1) })} aria-label="Perbesar">+</button>
          </div>
        </Row>
        <Row label="Tanya sebelum memindah ke Trash">
          <Toggle label="Konfirmasi hapus" value={s.confirmDelete} onChange={(v) => set({ confirmDelete: v })} />
        </Row>
      </section>

      <section className="set-section">
        <h2>Shortcut keyboard</h2>
        <table className="shortcut-table">
          <tbody>
            {shortcuts.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>
                  <kbd className="kbd">{prettyKeys(c.keys)}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="set-section">
        <button className="btn btn-danger btn-sm" onClick={A.resetSettings}>
          Kembalikan semua pengaturan
        </button>
      </section>
    </div>
  );
}
