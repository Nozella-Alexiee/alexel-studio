import { BatteryCharging, Leaf, Plug } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { serverStatus, type ServerStatus } from "../editor/lsp";
import { COMMANDS, commandWithKeys, defaultKeysOf, keysOf, prettyKeys, recordCombo } from "../app/commands";
import * as A from "../app/actions";
import { PenguinMascot, showNoziPeek } from "../components/PenguinMascot";
import { Segmented } from "../components/ui";
import { ACCENTS, DESIGNS, type DesignInfo } from "../design/designs";
import { isSaver, useStore, type Settings } from "../state/store";
import { detectClaude, selectAgent } from "../claude/claude";
import { AGENTS, type AgentId } from "../agents/registry";
import { isMac } from "../lib/ipc";
import { EFFORTS, modelChoices, PERM_MODES } from "../claude/options";
import { tl } from "../i18n";

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
function LayoutThumb({ d }: { d: DesignInfo }) {
  const id = d.shell;
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
      {d.penguin && (
        <div className="thumb-penguin">
          <PenguinMascot variant={d.penguin} size={30} />
        </div>
      )}
    </div>
  );
}

function LanguageServers() {
  const [list, setList] = useState<ServerStatus[] | null>(null);
  const refresh = () => void serverStatus(true).then(setList);
  useEffect(refresh, []);
  return (
    <section className="set-section">
      <h2>Server bahasa (autocomplete & go-to-definition)</h2>
      <p className="hint">{tl("TypeScript/JavaScript sudah dibundel. Bahasa lain memakai server yang terpasang di komputermu. Pintasan: F12 ke definisi (atau {mod}+klik), F2 rename, {fmt} format, {refs} referensi.", { mod: isMac ? "⌘" : "Ctrl", fmt: prettyKeys("Shift+Alt+F"), refs: prettyKeys("Shift+F12") })}</p>
      {list === null ? (
        <p className="hint">{tl("Memeriksa…")}</p>
      ) : list.length === 0 ? (
        <p className="hint">{tl("Hanya tersedia di aplikasi desktop.")}</p>
      ) : (
        list.map((s) => (
          <Row key={s.id} label={s.name} hint={s.bundled ? "Dibundel bersama Alexel Studio" : s.available ? tl("Terpasang") : s.install ?? undefined}>
            {s.available ? (
              <span className="tone-success-fg">{tl("Aktif")}</span>
            ) : (
              <button
                className="btn btn-sm"
                onClick={() =>
                  void import("../terminal/terminals").then(async (m) => {
                    await m.newTerminal({ kind: "run", title: tl("Pasang {name}", { name: s.id }), command: s.install! });
                  })
                }
              >
                {tl("Pasang")}
              </button>
            )}
          </Row>
        ))
      )}
      {list && list.length > 0 && (
        <button className="btn btn-sm btn-ghost" onClick={refresh}>
          {tl("Periksa ulang")}
        </button>
      )}
    </section>
  );
}

function Keybindings() {
  const over = useStore((st) => st.settings.keybindings);
  const [editing, setEditing] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const list = COMMANDS.filter((c) => !c.hidden).sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setEditing(null);
      const next = { ...useStore.getState().settings.keybindings };
      if (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey) next[editing] = "";
      else {
        const combo = recordCombo(e);
        if (!combo) return;
        const other = commandWithKeys(combo);
        setWarn(other && other.id !== editing ? tl("{keys} sebelumnya dipakai \"{cmd}\" dan dilepas dari perintah itu.", { keys: prettyKeys(combo), cmd: other.label }) : null);
        if (other && other.id !== editing) next[other.id] = "";
        next[editing] = combo;
      }
      A.updateSettings({ keybindings: next });
      setEditing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editing]);
  return (
    <>
      {warn && <p className="hint tone-warning-fg">{warn}</p>}
      <table className="shortcut-table">
        <tbody>
          {list.map((c) => {
            const changed = c.id in over;
            const k = keysOf(c);
            return (
              <tr key={c.id} className={changed ? "is-changed" : ""}>
                <td>
                  <span className="hint">{c.group}:</span> {c.label}
                </td>
                <td>{editing === c.id ? <span className="kbd is-recording">{tl("Tekan kombinasi…")}</span> : k ? <kbd className="kbd">{prettyKeys(k)}</kbd> : <span className="hint">—</span>}</td>
                <td className="shortcut-actions">
                  {!c.shownKeys && (
                    <button className="link-btn" onClick={() => setEditing(c.id)}>
                      {tl("Ubah")}
                    </button>
                  )}
                  {changed && (
                    <button
                      className="link-btn"
                      onClick={() => {
                        const next = { ...over };
                        delete next[c.id];
                        A.updateSettings({ keybindings: next });
                      }}
                      title={defaultKeysOf(c.id) ? `Bawaan: ${prettyKeys(defaultKeysOf(c.id))}` : "Bawaan: tanpa shortcut"}
                    >
                      {tl("Kembalikan")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export default function SettingsView() {
  const s = useStore((st) => st.settings);
  const power = useStore((st) => st.power);
  const saver = useStore((st) => isSaver(st));
  const claude = useStore((st) => st.claude);
  const models = useStore((st) => st.claudeModels);
  const set = (p: Partial<Settings>) => A.updateSettings(p);
  const [q, setQ] = useState("");
  const [noHits, setNoHits] = useState(false);
  const rootEl = useRef<HTMLDivElement>(null);
  // Saring baris & bagian berdasarkan teksnya (judul, label, petunjuk).
  useEffect(() => {
    const el = rootEl.current;
    if (!el) return;
    const needle = q.trim().toLowerCase();
    let hits = 0;
    for (const sec of el.querySelectorAll<HTMLElement>(".set-section")) {
      const head = sec.querySelector("h2")?.textContent?.toLowerCase() ?? "";
      const headHit = !!needle && head.includes(needle);
      let any = false;
      for (const row of sec.querySelectorAll<HTMLElement>(".set-row, .shortcut-table tr")) {
        const hit = !needle || headHit || (row.textContent ?? "").toLowerCase().includes(needle);
        row.style.display = hit ? "" : "none";
        if (hit) any = true;
      }
      const show = !needle || headHit || any;
      sec.style.display = show ? "" : "none";
      if (show && needle) hits++;
    }
    setNoHits(!!needle && hits === 0);
  }, [q]);

  return (
    <div className="settings" ref={rootEl}>
      <div className="settings-top">
        <h1>{tl("Pengaturan")}</h1>
        <input className="input settings-search" type="search" placeholder={tl("Cari pengaturan…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tl("Cari pengaturan")} autoFocus />
        <button className="btn btn-sm" onClick={() => void A.openSettingsJson()} title={tl("Edit semua pengaturan sebagai JSON")}>
          {tl("Buka settings.json")}
        </button>
      </div>
      {q && noHits && <p className="hint">{tl("Tidak ada pengaturan yang cocok dengan \"{q}\".", { q })}</p>}

      <section className="set-section">
        <h2>{tl("Desain")}</h2>
        <p className="hint">{tl("Ganti kapan saja. Tata letak, warna, font, dan kepadatan ikut berubah. Shortcut: {keys}.", { keys: prettyKeys("Ctrl+Mod+T") })}</p>
        {(["Pinguin", "Klasik"] as const).map((group) => (
          <React.Fragment key={group}>
            <h3 className="design-group-title">{group === "Pinguin" ? tl("Identitas Nozi") : tl("Klasik")}</h3>
            <div className="design-cards">
              {DESIGNS.filter((d) => d.group === group).map((d) => (
                <button key={d.id} className={`design-card ${s.design === d.id ? "is-on" : ""}`} onClick={() => A.setDesign(d.id)} aria-pressed={s.design === d.id} style={{ "--sw-bg": d.swatch.bg, "--sw-panel": d.swatch.panel, "--sw-accent": d.swatch.accent, "--sw-text": d.swatch.text, "--sw-alt": d.swatch.alt } as React.CSSProperties}>
                  <LayoutThumb d={d} />
                  <div className="design-name">{d.name}</div>
                  <div className="design-tag">{d.tagline}</div>
                </button>
              ))}
            </div>
          </React.Fragment>
        ))}
        <Row label={tl("Warna aksen")} hint={tl("Khusus desain yang sedang dipakai.")}>
          <div className="accent-row">
            <button className={`accent-dot auto ${!s.accent ? "is-on" : ""}`} onClick={() => set({ accent: null })} aria-label={tl("Bawaan desain")}>
              A
            </button>
            {ACCENTS[s.design].map((c) => (
              <button key={c} className={`accent-dot ${s.accent === c ? "is-on" : ""}`} style={{ background: c }} onClick={() => set({ accent: c })} aria-label={`Aksen ${c}`} />
            ))}
          </div>
        </Row>
        <Row label={tl("Tata letak")} hint={tl("Lebar panel yang kamu geser disimpan per desain.")}>
          <button className="btn btn-sm" onClick={A.resetLayout}>
            {tl("Kembalikan bawaan")}
          </button>
        </Row>
        <Row label={tl("Tur singkat")} hint={tl("Kenalan lagi dengan fitur utama: seret tab, AI inline, dan maskot.")}>
          <button className="btn btn-sm" onClick={() => void import("../components/Tour").then((m) => m.startTour())}>
            {tl("Mulai tur")}
          </button>
        </Row>
        <Row label={tl("Nozi di sidebar")} hint={tl("Nozi kecil dengan tips di bawah Explorer (desain Pinguin).")}>
          <button
            className="btn btn-sm"
            onClick={showNoziPeek}
          >
            {tl("Munculkan lagi")}
          </button>
        </Row>
      </section>

      <section className="set-section">
        <h2>Editor</h2>
        <Row label={tl("Ukuran huruf")}>
          <div className="stepper">
            <button className="btn btn-sm" onClick={() => set({ fontSize: Math.max(9, s.fontSize - 1) })} aria-label={tl("Perkecil")}>−</button>
            <span className="mono">{s.fontSize}px</span>
            <button className="btn btn-sm" onClick={() => set({ fontSize: Math.min(28, s.fontSize + 1) })} aria-label={tl("Perbesar")}>+</button>
          </div>
        </Row>
        <Row label={tl("Lebar tab")}>
          <Segmented label={tl("Lebar tab")} value={String(s.tabSize)} onChange={(v) => set({ tabSize: Number(v) })} options={[{ id: "2", label: "2" }, { id: "4", label: "4" }, { id: "8", label: "8" }]} />
        </Row>
        <Row label={tl("Bungkus baris panjang")}>
          <Toggle label={tl("Bungkus baris")} value={s.wordWrap} onChange={(v) => set({ wordWrap: v })} />
        </Row>
        <Row label="Minimap" hint={tl("Otomatis mati di mode hemat daya.")}>
          <Toggle label="Minimap" value={s.minimap} onChange={(v) => set({ minimap: v })} />
        </Row>
        <Row label={tl("Simpan otomatis")} hint={tl(s.autoSave === "delay" ? "Menyimpan 1,2 detik setelah berhenti mengetik." : s.autoSave === "focus" ? "Menyimpan saat pindah tab atau jendela kehilangan fokus." : "Simpan sendiri dengan Simpan.")}>
          <Segmented
            label={tl("Simpan otomatis")}
            value={s.autoSave}
            onChange={(v) => set({ autoSave: v })}
            options={[
              { id: "off", label: tl("Mati") },
              { id: "delay", label: tl("Setelah jeda") },
              { id: "focus", label: tl("Saat pindah") },
            ]}
          />
        </Row>
        <Row label={tl("Bahasa aplikasi")} hint={tl("Aplikasi dimuat ulang untuk mengganti bahasa.")}>
          <Segmented
            label={tl("Bahasa aplikasi")}
            value={s.language}
            onChange={(v) => void A.setAppLanguage(v)}
            options={[
              { id: "auto", label: tl("Mengikuti sistem") },
              { id: "id", label: "Indonesia" },
              { id: "en", label: "English" },
            ]}
          />
        </Row>
        <Row label={tl("Cek pembaruan otomatis")} hint={tl("Sekali sehari menanyakan versi terbaru ke GitHub Releases. Tidak ada data lain yang dikirim.")}>
          <Toggle label={tl("Cek pembaruan otomatis")} value={s.updateCheck} onChange={(v) => set({ updateCheck: v })} />
        </Row>
        <Row label={tl("RAM & CPU di status bar")} hint={tl("Pemakaian memori dan prosesor Alexel Studio.")}>
          <Toggle label={tl("RAM & CPU di status bar")} value={s.showResources} onChange={(v) => set({ showResources: v })} />
        </Row>
      </section>

      <section className="set-section">
        <h2>
          <Leaf size={16} aria-hidden /> Mode hemat daya
        </h2>
        <p className="hint">{tl("Mengurangi polling, animasi, minimap, dan pemindaian di latar saat laptop memakai baterai.")}</p>
        <Row label={tl("Aktifkan")} hint={power ? `Sekarang: ${power.on_battery ? "baterai" : "listrik"}${power.percent != null ? ` ${power.percent}%` : ""}${power.low_power_mode ? " · Low Power Mode" : ""}` : undefined}>
          <Segmented
            label={tl("Mode hemat daya")}
            value={s.powerMode}
            onChange={(v) => set({ powerMode: v })}
            options={[
              { id: "auto", label: tl("Otomatis") },
              { id: "on", label: tl("Selalu") },
              { id: "off", label: tl("Mati") },
            ]}
          />
        </Row>
        <div className={`power-state ${saver ? "on" : ""}`}>
          {saver ? <Leaf size={14} /> : power?.on_battery ? <BatteryCharging size={14} /> : <Plug size={14} />}
          {saver ? tl("Hemat daya sedang aktif") : tl("Performa penuh")}
        </div>
      </section>

      <section className="set-section">
        <h2>Git Bot</h2>
        <Row label={tl("Setiap simpan")} hint={tl("Hanya berkas yang disimpan yang di-commit. Dilewati saat merge/rebase, konflik, atau berkas mirip rahasia (.env, .pem).")}>
          <Segmented
            label="Git Bot"
            value={s.gitBot}
            onChange={(v) => set({ gitBot: v })}
            options={[
              { id: "off", label: tl("Mati") },
              { id: "commit", label: "Commit" },
              { id: "push", label: "Commit + push" },
            ]}
          />
        </Row>
      </section>

      <section className="set-section">
        <h2 id="set-agents">{tl("Agen AI")}</h2>
        <Row label={tl("Agen bawaan")} hint={tl("Agen yang dipakai panel Agen AI. Pasang agen lain dari panel Ekstensi → Agen AI.")}>
          <select className="input select" value={s.agent} onChange={(e) => void selectAgent(e.target.value as AgentId)} aria-label={tl("Agen AI")}>
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={tl("Perintah agen ACP")} hint={tl("Untuk agen lain yang mendukung Agent Client Protocol, mis. my-agent --acp. Dijalankan di folder project.")}>
          <input className="input" value={s.acpCommand} placeholder={tl("perintah --acp")} onChange={(e) => set({ acpCommand: e.target.value })} aria-label={tl("Perintah agen ACP")} />
        </Row>
        <h3 className="set-sub">Claude Code</h3>
        <Row label="Status" hint={claude?.path ?? undefined}>
          <span className={claude?.installed ? "tone-success-fg" : "tone-danger-fg"}>{claude ? (claude.installed ? claude.version : claude.error) : tl("belum diperiksa")}</span>
          <button className="btn btn-sm" onClick={() => void detectClaude()}>
            {tl("Periksa ulang")}
          </button>
        </Row>
        <Row label={tl("Mode izin bawaan")} hint={PERM_MODES.find((m) => m.id === s.claudeMode)?.hint}>
          <Segmented label={tl("Mode izin")} value={s.claudeMode} onChange={(v) => set({ claudeMode: v })} options={PERM_MODES.map((m) => ({ id: m.id, label: m.label }))} />
        </Row>
        <Row label={tl("Model bawaan")} hint={tl("Bisa diganti per percakapan dari bawah kotak pesan.")}>
          <select className="input select" value={s.claudeModel} onChange={(e) => set({ claudeModel: e.target.value })} aria-label={tl("Model Claude")}>
            {modelChoices(models).map((m) => (
              <option key={m.value} value={m.value}>
                {m.displayName}
              </option>
            ))}
          </select>
        </Row>
        <Row label={tl("Effort bawaan")} hint={tl("Effort lebih tinggi = berpikir lebih lama dan lebih teliti.")}>
          <select className="input select" value={s.claudeEffort} onChange={(e) => set({ claudeEffort: e.target.value })} aria-label={tl("Effort Claude")}>
            {EFFORTS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label={tl("Model untuk Claude inline")} hint={tl("Cepat memakai Sonnet dengan effort rendah (±15 detik). Bawaan mengikuti model Claude Code kamu, bisa beberapa menit.")}>
          <Segmented
            label={tl("Model Claude inline")}
            value={s.claudeInlineModel}
            onChange={(v) => set({ claudeInlineModel: v })}
            options={[
              { id: "fast", label: tl("Cepat") },
              { id: "default", label: tl("Bawaan") },
            ]}
          />
        </Row>
        <Row label={tl("Tampilkan isi sebelum dikirim")} hint={tl("Setiap pesan, kamu melihat dulu persis teks dan berkas yang akan dikirim ke agen.")}>
          <Toggle label={tl("Konfirmasi kirim")} value={s.claudeConfirm} onChange={(v) => set({ claudeConfirm: v })} />
        </Row>
        <Row label={tl("Sertakan berkas aktif secara bawaan")}>
          <Toggle label={tl("Sertakan berkas aktif")} value={s.claudeIncludeFile} onChange={(v) => set({ claudeIncludeFile: v })} />
        </Row>
      </section>

      <LanguageServers />

      <section className="set-section">
        <h2>{tl("Terminal & berkas")}</h2>
        <Row label={tl("Ukuran huruf terminal")}>
          <div className="stepper">
            <button className="btn btn-sm" onClick={() => set({ terminalFontSize: Math.max(9, s.terminalFontSize - 1) })} aria-label={tl("Perkecil")}>−</button>
            <span className="mono">{s.terminalFontSize}px</span>
            <button className="btn btn-sm" onClick={() => set({ terminalFontSize: Math.min(24, s.terminalFontSize + 1) })} aria-label={tl("Perbesar")}>+</button>
          </div>
        </Row>
        <Row label={tl("Tanya sebelum memindah ke Trash")}>
          <Toggle label={tl("Konfirmasi hapus")} value={s.confirmDelete} onChange={(v) => set({ confirmDelete: v })} />
        </Row>
      </section>

      <section className="set-section" id="set-keys">
        <h2>{tl("Shortcut keyboard")}</h2>
        <p className="hint">{tl("Klik Ubah lalu tekan kombinasi baru. Esc membatalkan, Backspace melepas shortcut.")}</p>
        <Keybindings />
      </section>

      <section className="set-section">
        <button className="btn btn-danger btn-sm" onClick={A.resetSettings}>
          {tl("Kembalikan semua pengaturan")}
        </button>
      </section>
    </div>
  );
}
