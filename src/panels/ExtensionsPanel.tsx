import { BadgeCheck, Download, Palette, Puzzle, Search, Shapes, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as A from "../app/actions";
import { Empty, IconButton, Segmented, Spinner } from "../components/ui";
import { loadExtensions, useExtensions, type InstalledExt } from "../extensions/registry";
import { call, errMsg, isNative } from "../lib/ipc";
import { confirmDialog, toast, useStore } from "../state/store";
import { AgentExtensions, agentForPackage, installAgent } from "./AgentExtensions";
import { tl } from "../i18n";

interface Result {
  id: string;
  namespace: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  downloads: number;
  icon: string | null;
  verified: boolean;
}

const CATS = [
  { id: "Themes", label: tl("Tema") },
  { id: "Snippets", label: "Snippet" },
  { id: "Programming Languages", label: tl("Bahasa") },
] as const;

const fmtDl = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(n));

function Installed({ ext }: { ext: InstalledExt }) {
  const active = useStore((s) => s.settings.extTheme);
  const activeIcons = useStore((s) => s.settings.iconTheme);
  const remove = async () => {
    if (!(await confirmDialog(tl("Hapus {name}?", { name: ext.displayName }), tl("Tema, tema ikon, snippet, dan grammar dari ekstensi ini tidak dipakai lagi."), tl("Hapus"), true))) return;
    if (active?.ext === ext.id) A.updateSettings({ extTheme: null });
    if (activeIcons?.ext === ext.id) A.updateSettings({ iconTheme: null });
    await call("ext_remove", { id: ext.id }).catch((e) => toast(errMsg(e), "error"));
    await loadExtensions();
  };
  return (
    <div className="ext-item ext-installed">
      <div className="ext-head">
        <div className="ext-main">
          <div className="ext-name">
            <span className="ext-id" title={ext.displayName}>{ext.displayName}</span>
          </div>
          <div className="ext-meta" title={ext.id}>
            <span className="ext-id">{ext.id}</span>
            <span>· v{ext.version}</span>
          </div>
          <div className="ext-contrib">
            {ext.themes.length > 0 && <span className="todo-tag">{ext.themes.length} tema</span>}
            {ext.iconThemes.length > 0 && <span className="todo-tag">{ext.iconThemes.length} tema ikon</span>}
            {ext.snippets.length > 0 && <span className="todo-tag">{ext.snippets.length} snippet</span>}
            {ext.grammars.length > 0 && <span className="todo-tag">{ext.grammars.length} grammar</span>}
            {ext.id.startsWith("vscode.") && <span className="todo-tag" title={tl("Grammar bawaan VS Code, dipasang otomatis karena dipakai ekstensi lain")}>{tl("pendukung")}</span>}
          </div>
        </div>
        <IconButton label={tl("Hapus ekstensi")} onClick={() => void remove()}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      {ext.themes.map((t) => {
        const on = active?.ext === ext.id && active.path === t.path;
        return (
          <button
            key={t.path}
            className={`ext-theme ${on ? "is-on" : ""}`}
            title={on ? tl("Klik untuk melepas tema ini") : tl("Pakai tema {name}", { name: t.label })}
            aria-pressed={on}
            onClick={() => A.updateSettings({ extTheme: on ? null : { ext: ext.id, path: t.path, label: t.label, uiTheme: t.uiTheme } })}
          >
            <Palette size={12} aria-hidden />
            <span className="ext-theme-label">{t.label}</span>
            <span className="right">{on ? tl("Aktif") : tl("Pakai")}</span>
          </button>
        );
      })}
      {ext.iconThemes.map((t) => {
        const on = activeIcons?.ext === ext.id && activeIcons.path === t.path;
        return (
          <button
            key={t.path}
            className={`ext-theme ${on ? "is-on" : ""}`}
            title={on ? tl("Klik untuk melepas tema ikon ini") : tl("Pakai tema ikon {name}", { name: t.label })}
            aria-pressed={on}
            onClick={() => A.updateSettings({ iconTheme: on ? null : { ext: ext.id, path: t.path, label: t.label } })}
          >
            <Shapes size={12} aria-hidden />
            <span className="ext-theme-label">{t.label}</span>
            <span className="right">{on ? tl("Aktif") : "Pakai ikon"}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ExtensionsPanel() {
  const installed = useExtensions((s) => s.list);
  const loaded = useExtensions((s) => s.loaded);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("Themes");
  const [res, setRes] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!isNative) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await call<Result[]>("ext_search", { query: q, category: cat });
        if (id === seq.current) setRes(r);
      } catch (e) {
        if (id === seq.current) {
          setRes([]);
          toast(tl("Gagal menghubungi Open VSX: {error}", { error: errMsg(e) }), "error");
        }
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, cat]);

  if (!isNative) return <Empty icon={<Puzzle size={24} />} title={tl("Ekstensi")}>{tl("Pasang tema & snippet dari Open VSX di aplikasi desktop Alexel Studio.")}</Empty>;

  const install = async (r: Result) => {
    // Ekstensi agen (Claude Code, Codex): pasang bineran agennya ke panel Agen AI.
    const agent = agentForPackage(r.namespace, r.name);
    if (agent) {
      setInstalling(r.id);
      await installAgent(agent);
      setInstalling(null);
      return;
    }
    setInstalling(r.id);
    try {
      const m = await call<InstalledExt>("ext_install", { namespace: r.namespace, name: r.name });
      await loadExtensions();
      toast(`${m.displayName} terpasang`, "success");
      if (m.themes[0] && (await confirmDialog(tl("Pakai tema {name}?", { name: m.themes[0].label }), tl("Warnanya diterapkan di atas desain yang sedang dipakai. Tata letak dan Nozi tetap."), tl("Pakai")))) {
        A.updateSettings({ extTheme: { ext: m.id, path: m.themes[0].path, label: m.themes[0].label, uiTheme: m.themes[0].uiTheme } });
      }
      if (m.iconThemes[0] && (await confirmDialog(tl("Pakai tema ikon {name}?", { name: m.iconThemes[0].label }), tl("Ikon berkas & folder di Explorer, tab, dan pencarian ikut berganti."), tl("Pakai")))) {
        A.updateSettings({ iconTheme: { ext: m.id, path: m.iconThemes[0].path, label: m.iconThemes[0].label } });
      }
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setInstalling(null);
    }
  };

  const installedIds = new Set(installed.map((i) => i.id));
  return (
    <div className="ext-panel">
      <div className="side-head">
        <span className="side-title">{tl("Ekstensi")}</span>
      </div>
      <div className="search-form">
        <div className="input-wrap">
          <input className="input" placeholder={tl("Cari di Open VSX (mis. dracula, svelte)")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tl("Cari ekstensi")} />
          <div className="input-tools">{busy ? <Spinner size={12} /> : <Search size={13} aria-hidden style={{ margin: 6, color: "var(--fg-subtle)" }} />}</div>
        </div>
        <Segmented label={tl("Kategori")} value={cat} onChange={setCat} options={CATS.map((c) => ({ id: c.id, label: c.label }))} />
        <p className="hint ext-note">{tl("Alexel Studio memakai tema, tema ikon, snippet, dan grammar dari ekstensi. Kode JavaScript ekstensi tidak pernah dijalankan.")}</p>
      </div>
      <div className="ext-scroll">
        {!q && <AgentExtensions />}
        {installed.length > 0 && (
          <section>
            <div className="git-section-head">
              <span>{tl("Terpasang")}</span>
              <span className="count-badge">{installed.length}</span>
            </div>
            {[...installed].sort((a, b) => Number(a.id.startsWith("vscode.")) - Number(b.id.startsWith("vscode."))).map((e) => (
              <Installed key={e.id} ext={e} />
            ))}
          </section>
        )}
        {!loaded && <Spinner />}
        <section>
          <div className="git-section-head">
            <span>{q ? "Hasil" : "Populer"}</span>
          </div>
          {res === null ? (
            <div className="pad">
              <Spinner />
            </div>
          ) : res.length === 0 ? (
            <div className="hint pad-x">{tl("Tidak ada hasil.")}</div>
          ) : (
            res.map((r) => (
              <div key={r.id} className="ext-item">
                {r.icon ? <img className="ext-icon" src={r.icon} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="ext-icon ph"><Puzzle size={16} /></div>}
                <div className="ext-main">
                  <div className="ext-name">
                    <span className="ext-id" title={r.displayName}>{r.displayName}</span> {r.verified && <BadgeCheck size={12} className="tone-success-fg ext-badge" aria-label={tl("Penerbit terverifikasi")} />}
                  </div>
                  <div className="ext-meta" title={r.id}>
                    <span className="ext-id">{r.namespace}</span>
                    <span>
                      · <Download size={10} aria-hidden /> {fmtDl(r.downloads)}
                    </span>
                  </div>
                  <div className="ext-desc">{r.description}</div>
                  <div className="ext-actions">
                    {installedIds.has(r.id) ? (
                      <span className="hint">{tl("Terpasang")}</span>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => void install(r)} disabled={!!installing} aria-label={tl("Pasang {name}", { name: r.displayName })}>
                        {installing === r.id ? <Spinner size={11} /> : tl("Pasang")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
