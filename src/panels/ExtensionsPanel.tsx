import { ArrowUpCircle, BadgeCheck, Download, Palette, Puzzle, Search, Shapes, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as A from "../app/actions";
import { Empty, IconButton, Segmented, Spinner } from "../components/ui";
import { installExtension, removeExtension, setExtensionEnabled } from "../extensions/install";
import { CHIPS, checkUpdates, fmtDl, searchExtensions, type Chip, type Result, type SortBy, type Update } from "../extensions/market";
import { cmpVersion, useExtensions, type InstalledExt } from "../extensions/registry";
import { errMsg, isNative } from "../lib/ipc";
import { toast, useStore } from "../state/store";
import { AgentExtensions, agentForPackage } from "./AgentExtensions";
import { CompatBadge, useCompat } from "./CompatBadge";
import { tl } from "../i18n";

const chipLabel = (id: string) =>
  ({ all: tl("Semua"), themes: tl("Tema"), icons: tl("Ikon"), langs: tl("Bahasa"), snippets: "Snippet", formatters: "Formatter", linters: "Linter", keymaps: "Keymap" })[id] ?? id;

const SORTS: { id: SortBy | "auto"; label: () => string }[] = [
  { id: "auto", label: () => tl("Urutan otomatis") },
  { id: "relevance", label: () => tl("Paling relevan") },
  { id: "downloadCount", label: () => tl("Terbanyak diunduh") },
  { id: "averageRating", label: () => tl("Rating tertinggi") },
  { id: "timestamp", label: () => tl("Terbaru") },
];

/** Bagian di beranda "Rekomendasi": 5 teratas tiap kelompok, dengan tombol Lihat semua. */
const HOME: { chip: string; title: () => string }[] = [
  { chip: "themes", title: () => tl("Tema populer") },
  { chip: "icons", title: () => tl("Tema ikon populer") },
  { chip: "langs", title: () => tl("Bahasa & grammar") },
  { chip: "snippets", title: () => tl("Snippet populer") },
];
const homeCache = new Map<string, Result[]>();

function ResultItem({ r, installed, onInstall, busy }: { r: Result; installed: boolean; onInstall: (r: Result) => void; busy: string | null }) {
  const isAgent = !!agentForPackage(r.namespace, r.name);
  const compat = useCompat(isAgent ? { namespace: r.namespace, name: r.name, manifestUrl: null } : r);
  const unsupported = !isAgent && compat?.level === "none";
  return (
    <div className="ext-item">
      {r.icon ? <img className="ext-icon" src={r.icon} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="ext-icon ph"><Puzzle size={16} /></div>}
      <div className="ext-main">
        <div className="ext-name">
          <button className="ext-link ext-id" title={tl("Buka detail {name}", { name: r.displayName })} onClick={() => A.openExtension(r.namespace, r.name, r.displayName)}>
            {r.displayName}
          </button>
          {r.verified && <BadgeCheck size={12} className="tone-success-fg ext-badge" aria-label={tl("Penerbit terverifikasi")} />}
        </div>
        <div className="ext-meta" title={r.id}>
          <span className="ext-id">{r.namespace}</span>
          <span>
            · <Download size={10} aria-hidden /> {fmtDl(r.downloads)}
          </span>
          {r.rating != null && r.reviews > 0 && (
            <span>
              · <Star size={10} aria-hidden /> {r.rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="ext-desc">{r.description}</div>
        <div className="ext-actions">
          {installed ? (
            <span className="hint">{tl("Terpasang")}</span>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => onInstall(r)} disabled={!!busy || unsupported} aria-label={tl("Pasang {name}", { name: r.displayName })}>
              {busy === r.id ? <Spinner size={11} /> : tl("Pasang")}
            </button>
          )}
          {!isAgent && <CompatBadge compat={compat} />}
        </div>
        {unsupported && compat?.alt && <div className="hint ext-alt">{tl(compat.alt)}</div>}
      </div>
    </div>
  );
}

function InstalledItem({ ext, update }: { ext: InstalledExt; update?: Update }) {
  const active = useStore((s) => s.settings.extTheme);
  const activeIcons = useStore((s) => s.settings.iconTheme);
  const disabled = useStore((s) => s.settings.disabledExts.includes(ext.id));
  const [busy, setBusy] = useState(false);
  const canUpdate = update && ext.namespace && ext.name;
  return (
    <div className={`ext-item ext-installed ${disabled ? "is-disabled" : ""}`}>
      <div className="ext-head">
        <div className="ext-main">
          <div className="ext-name">
            <button
              className="ext-link ext-id"
              title={ext.displayName}
              disabled={!ext.namespace || !ext.name}
              onClick={() => ext.namespace && ext.name && A.openExtension(ext.namespace, ext.name, ext.displayName)}
            >
              {ext.displayName}
            </button>
          </div>
          <div className="ext-meta" title={ext.id}>
            <span className="ext-id">{ext.id}</span>
            <span>· v{ext.version}</span>
          </div>
          <div className="ext-contrib">
            {ext.themes.length > 0 && <span className="todo-tag">{ext.themes.length} {tl("tema")}</span>}
            {ext.iconThemes.length > 0 && <span className="todo-tag">{ext.iconThemes.length} {tl("tema ikon")}</span>}
            {ext.snippets.length > 0 && <span className="todo-tag">{ext.snippets.length} snippet</span>}
            {ext.grammars.length > 0 && <span className="todo-tag">{ext.grammars.length} grammar</span>}
            {ext.languages.some((l) => l.configuration) && <span className="todo-tag">{tl("konfigurasi bahasa")}</span>}
            {ext.id.startsWith("vscode.") && <span className="todo-tag" title={tl("Grammar bawaan VS Code, dipasang otomatis karena dipakai ekstensi lain")}>{tl("pendukung")}</span>}
            {disabled && <span className="todo-tag">{tl("nonaktif")}</span>}
          </div>
        </div>
        <IconButton label={disabled ? tl("Aktifkan ekstensi") : tl("Nonaktifkan ekstensi")} onClick={() => setExtensionEnabled(ext.id, disabled)}>
          <span className={`switch switch-sm ${disabled ? "" : "is-on"}`} aria-hidden />
        </IconButton>
        <IconButton label={tl("Hapus ekstensi")} onClick={() => void removeExtension(ext)}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      {canUpdate && (
        <button
          className="btn btn-sm btn-primary ext-update"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await installExtension(ext.namespace!, ext.name!, { quiet: true });
            setBusy(false);
          }}
        >
          {busy ? <Spinner size={11} /> : <ArrowUpCircle size={12} aria-hidden />} {tl("Perbarui ke {v}", { v: update!.latest })}
        </button>
      )}
      {!disabled &&
        ext.themes.map((t) => {
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
      {!disabled &&
        ext.iconThemes.map((t) => {
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
              <span className="right">{on ? tl("Aktif") : tl("Pakai ikon")}</span>
            </button>
          );
        })}
    </div>
  );
}

/** Beranda: kelompok terkurasi (teratas menurut unduhan) tanpa perlu mencari. */
function Home({ install, busy, installedIds, go }: { install: (r: Result) => void; busy: string | null; installedIds: Set<string>; go: (chip: string) => void }) {
  const [data, setData] = useState<Record<string, Result[]>>(() => Object.fromEntries(homeCache));
  useEffect(() => {
    let alive = true;
    for (const h of HOME) {
      if (homeCache.has(h.chip)) continue;
      const c = CHIPS.find((x) => x.id === h.chip)!;
      searchExtensions({ query: c.query ?? "", category: c.category, sortBy: c.sort, size: 5 })
        .then((p) => {
          homeCache.set(h.chip, p.items);
          if (alive) setData((d) => ({ ...d, [h.chip]: p.items }));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      {HOME.map((h) => (
        <section key={h.chip}>
          <div className="git-section-head">
            <span>{h.title()}</span>
            <button className="ext-link ext-more" onClick={() => go(h.chip)}>
              {tl("Lihat semua")}
            </button>
          </div>
          {!data[h.chip] ? (
            <div className="pad">
              <Spinner />
            </div>
          ) : (
            data[h.chip].map((r) => <ResultItem key={r.id} r={r} installed={installedIds.has(r.id)} onInstall={install} busy={busy} />)
          )}
        </section>
      ))}
    </>
  );
}

let lastUpdateCheck = 0;
let lastUpdates: Update[] = [];

export default function ExtensionsPanel() {
  const installed = useExtensions((s) => s.list);
  const loaded = useExtensions((s) => s.loaded);
  const [view, setView] = useState<"browse" | "installed">("browse");
  const [q, setQ] = useState("");
  const [chipId, setChipId] = useState("all");
  const [sort, setSort] = useState<SortBy | "auto">("auto");
  const [res, setRes] = useState<Result[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [updates, setUpdates] = useState<Update[]>(lastUpdates);
  const seq = useRef(0);

  const chip: Chip = CHIPS.find((c) => c.id === chipId) ?? CHIPS[0];
  const home = view === "browse" && chipId === "all" && !q.trim();
  const sortBy: SortBy = sort === "auto" ? (q.trim() ? "relevance" : chip.sort) : sort;
  const query = [chip.query, q.trim()].filter(Boolean).join(" ");

  useEffect(() => {
    if (!isNative || home || view !== "browse") return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const p = await searchExtensions({ query, category: chip.category, sortBy });
        if (id !== seq.current) return;
        setRes(p.items);
        setTotal(p.total);
      } catch (e) {
        if (id === seq.current) {
          setRes([]);
          setTotal(0);
          toast(tl("Gagal menghubungi Open VSX: {error}", { error: errMsg(e) }), "error");
        }
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, chip.category, sortBy, home, view]);

  // Pembaruan: cek saat tab Terpasang dibuka (paling sering tiap 10 menit).
  useEffect(() => {
    if (!isNative || view !== "installed" || Date.now() - lastUpdateCheck < 10 * 60_000) return;
    lastUpdateCheck = Date.now();
    checkUpdates()
      .then((u) => {
        lastUpdates = u;
        setUpdates(u);
      })
      .catch(() => {
        lastUpdateCheck = 0;
      });
  }, [view]);

  if (!isNative) return <Empty icon={<Puzzle size={24} />} title={tl("Ekstensi")}>{tl("Pasang tema & snippet dari Open VSX di aplikasi desktop Alexel Studio.")}</Empty>;

  const loadMore = async () => {
    if (!res) return;
    setMore(true);
    try {
      const p = await searchExtensions({ query, category: chip.category, sortBy, offset: res.length });
      setRes((cur) => [...(cur ?? []), ...p.items.filter((i) => !(cur ?? []).some((c) => c.id === i.id))]);
      setTotal(p.total);
    } catch (e) {
      toast(tl("Gagal menghubungi Open VSX: {error}", { error: errMsg(e) }), "error");
    } finally {
      setMore(false);
    }
  };

  const install = async (r: Result) => {
    setInstalling(r.id);
    const m = await installExtension(r.namespace, r.name);
    setInstalling(null);
    if (m) {
      lastUpdates = lastUpdates.filter((u) => u.id !== m.id);
      setUpdates(lastUpdates);
    }
  };

  const installedIds = new Set(installed.map((i) => i.id));
  const byUpdate = new Map(updates.map((u) => [u.id, u]));
  const sorted = [...installed].sort((a, b) => Number(a.id.startsWith("vscode.")) - Number(b.id.startsWith("vscode.")));
  const pending = installed.filter((e) => byUpdate.has(e.id) && cmpVersion(byUpdate.get(e.id)!.latest, e.version) > 0);

  const updateAll = async () => {
    for (const e of pending) if (e.namespace && e.name) await installExtension(e.namespace, e.name, { quiet: true });
    lastUpdates = [];
    setUpdates([]);
  };

  return (
    <div className="ext-panel">
      <div className="side-head">
        <span className="side-title">{tl("Ekstensi")}</span>
      </div>
      <div className="search-form">
        <Segmented
          label={tl("Tampilan")}
          value={view}
          onChange={setView}
          options={[
            { id: "browse", label: tl("Telusuri") },
            { id: "installed", label: <>{tl("Terpasang")} {installed.length > 0 && <span className="count-badge">{installed.length}</span>}{pending.length > 0 && <span className="count-badge ext-upd-badge" title={tl("Ada pembaruan")}>{pending.length}</span>}</> },
          ]}
        />
        {view === "browse" && (
          <>
            <div className="input-wrap">
              <input className="input" placeholder={tl("Cari di Open VSX (mis. dracula, svelte)")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tl("Cari ekstensi")} />
              <div className="input-tools">{busy ? <Spinner size={12} /> : <Search size={13} aria-hidden style={{ margin: 6, color: "var(--fg-subtle)" }} />}</div>
            </div>
            <div className="chip-row" role="tablist" aria-label={tl("Kategori")}>
              {CHIPS.map((c) => (
                <button key={c.id} role="tab" aria-selected={chipId === c.id} className={`chip ${chipId === c.id ? "is-on" : ""}`} onClick={() => setChipId(c.id)}>
                  {chipLabel(c.id)}
                </button>
              ))}
            </div>
            {!home && (
              <select className="input ext-sort" value={sort} onChange={(e) => setSort(e.target.value as SortBy | "auto")} aria-label={tl("Urutkan")}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label()}
                  </option>
                ))}
              </select>
            )}
            <p className="hint ext-note">{tl("Alexel Studio memakai tema, tema ikon, snippet, grammar, dan konfigurasi bahasa dari ekstensi. Kode JavaScript ekstensi tidak pernah dijalankan.")}</p>
          </>
        )}
      </div>
      <div className="ext-scroll">
        {view === "browse" && home && <AgentExtensions />}
        {view === "installed" && (
          <section>
            {pending.length > 0 && (
              <div className="ext-updates">
                <span>{tl("{n} pembaruan tersedia", { n: pending.length })}</span>
                <button className="btn btn-sm btn-primary" onClick={() => void updateAll()}>
                  {tl("Perbarui semua")}
                </button>
              </div>
            )}
            {!loaded ? (
              <Spinner />
            ) : sorted.length === 0 ? (
              <div className="hint pad-x">{tl("Belum ada ekstensi terpasang.")}</div>
            ) : (
              sorted.map((e) => <InstalledItem key={e.id} ext={e} update={byUpdate.get(e.id)} />)
            )}
          </section>
        )}
        {view === "browse" &&
          (home ? (
            <Home install={(r) => void install(r)} busy={installing} installedIds={installedIds} go={setChipId} />
          ) : (
            <section>
              <div className="git-section-head">
                <span>{q.trim() ? tl("Hasil") : tl("Terpopuler")}</span>
                {res && total > 0 && <span className="count-badge">{total.toLocaleString()}</span>}
              </div>
              {res === null ? (
                <div className="pad">
                  <Spinner />
                </div>
              ) : res.length === 0 ? (
                <div className="hint pad-x">{tl("Tidak ada hasil.")}</div>
              ) : (
                <>
                  {res.map((r) => (
                    <ResultItem key={r.id} r={r} installed={installedIds.has(r.id)} onInstall={(x) => void install(x)} busy={installing} />
                  ))}
                  {res.length < total && (
                    <div className="pad">
                      <button className="btn btn-sm" disabled={more} onClick={() => void loadMore()}>
                        {more ? <Spinner size={11} /> : tl("Muat lebih banyak")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          ))}
      </div>
    </div>
  );
}