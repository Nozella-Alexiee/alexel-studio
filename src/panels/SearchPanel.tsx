import { CaseSensitive, ChevronDown, ChevronRight, Regex, Replace, WholeWord } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as A from "../app/actions";
import { FileIcon } from "../components/FileIcon";
import { Empty, IconButton, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/ipc";
import type { SearchMatch, SearchResult } from "../lib/types";
import { confirmDialog, toast, useStore } from "../state/store";

// State pencarian disimpan di luar komponen: panel ini di-unmount saat pindah ke Explorer/Git,
// dan kata kunci, opsi, serta hasilnya harus tetap ada saat kembali.
const kept = new Map<string, unknown>();
function useKept<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => (kept.has(key) ? (kept.get(key) as T) : initial));
  const set = (next: T | ((p: T) => T)) =>
    setV((prev) => {
      const val = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      kept.set(key, val);
      return val;
    });
  return [v, set];
}
const seqRef = { current: 0 };

export default function SearchPanel() {
  const root = useStore((s) => s.root);
  const [q, setQ] = useKept("q", "");
  const [rep, setRep] = useKept("rep", "");
  const [showRep, setShowRep] = useKept("showRep", false);
  const [opts, setOpts] = useKept("opts", { isRegex: false, caseSensitive: false, wholeWord: false });
  const [include, setInclude] = useKept("include", "");
  const [res, setRes] = useKept<SearchResult | null>("res", null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useKept<string | null>("err", null);
  const [collapsed, setCollapsed] = useKept<Record<string, boolean>>("collapsed", {});
  const seq = seqRef;
  const lastKey = useRef(kept.get("key") as string | undefined);

  useEffect(() => {
    // Kembali ke panel dengan pencarian yang sama: pakai hasil yang tersimpan, jangan cari ulang.
    const key = JSON.stringify([root, q, opts, include]);
    if (key === lastKey.current && res) return;
    lastKey.current = key;
    kept.set("key", key);
    if (!root || !q) {
      ++seq.current; // batalkan pencarian yang masih berjalan
      setRes(null);
      setErr(null);
      setBusy(false);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.search(root, q, { ...opts, include });
        if (id === seq.current) {
          setRes(r);
          setErr(null);
        }
      } catch (e) {
        if (id === seq.current) {
          setErr(errMsg(e));
          setRes(null);
        }
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [root, q, opts, include]);

  const byFile = useMemo(() => {
    const m = new Map<string, SearchMatch[]>();
    for (const x of res?.matches ?? []) m.set(x.path, [...(m.get(x.path) ?? []), x]);
    return [...m];
  }, [res]);

  const replaceAll = async () => {
    if (!res?.matches.length || !root) return;
    const files = byFile.map(([p]) => p);
    if (!(await confirmDialog(`Ganti ${res.matches.length} kecocokan di ${files.length} berkas?`, "Berkas yang sedang terbuka akan dimuat ulang. Versi lama tersimpan di time-travel.", "Ganti semua", true))) return;
    try {
      const dirtyOpen = files.filter((f) => useStore.getState().tabs[f]?.dirty);
      if (dirtyOpen.length) return toast("Simpan dulu berkas yang sedang diedit sebelum mengganti.", "error");
      const n = await api.replace(files, q, rep, opts);
      toast(`${n} kecocokan diganti`, "success");
      setQ((x) => x + "");
      setRes(await api.search(root, q, { ...opts, include }));
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  if (!root) return <Empty title="Buka folder dulu">Pencarian berjalan di seluruh project.</Empty>;

  const toggle = (k: keyof typeof opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  return (
    <div className="search-panel">
      <div className="search-form">
        <div className="search-row">
          <IconButton label={showRep ? "Sembunyikan ganti" : "Tampilkan ganti"} onClick={() => setShowRep((v) => !v)} className="search-rep-toggle">
            {showRep ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </IconButton>
          <div className="input-wrap">
            <input id="search-input" className="input" placeholder="Cari" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari di project" spellCheck={false} />
            <div className="input-tools">
              <IconButton label="Cocokkan huruf besar/kecil" active={opts.caseSensitive} onClick={() => toggle("caseSensitive")}>
                <CaseSensitive size={14} />
              </IconButton>
              <IconButton label="Kata utuh" active={opts.wholeWord} onClick={() => toggle("wholeWord")}>
                <WholeWord size={14} />
              </IconButton>
              <IconButton label="Regex" active={opts.isRegex} onClick={() => toggle("isRegex")}>
                <Regex size={14} />
              </IconButton>
            </div>
          </div>
        </div>
        {showRep && (
          <div className="search-row indent">
            <input className="input" placeholder="Ganti dengan" value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Teks pengganti" spellCheck={false} />
            <IconButton label="Ganti semua" onClick={() => void replaceAll()} disabled={!res?.matches.length}>
              <Replace size={14} />
            </IconButton>
          </div>
        )}
        <div className="search-row indent">
          <input className="input input-sm" placeholder="Hanya berkas (mis. .ts, src/)" value={include} onChange={(e) => setInclude(e.target.value)} aria-label="Filter berkas" />
        </div>
      </div>
      <div className="search-meta">
        {busy && <Spinner size={12} />}
        {err ? <span className="tone-danger-fg">{err}</span> : res && q ? <span>{res.matches.length}{res.truncated ? "+" : ""} hasil di {byFile.length} berkas</span> : null}
      </div>
      <div className="search-results" role="tree" aria-label="Hasil pencarian">
        {byFile.map(([path, ms]) => (
          <div key={path} className="search-file" role="treeitem" aria-expanded={!collapsed[path]}>
            <button className="search-file-head" onClick={() => setCollapsed((c) => ({ ...c, [path]: !c[path] }))}>
              {collapsed[path] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              <FileIcon filename={ms[0].rel} size={14} />
              <span className="search-file-name">{ms[0].rel.split("/").pop()}</span>
              <span className="search-file-dir">{ms[0].rel.split("/").slice(0, -1).join("/")}</span>
              <span className="count-badge">{ms.length}</span>
            </button>
            {!collapsed[path] &&
              ms.map((m, i) => {
                const before = m.text.slice(0, Math.max(0, m.col - 1)).trimStart();
                const hit = m.text.slice(m.col - 1, m.col - 1 + m.len);
                const after = m.text.slice(m.col - 1 + m.len);
                return (
                  <button key={i} className="search-hit" onClick={() => void A.openFile(m.path, { line: m.line, col: m.col, len: m.len })}>
                    <span className="search-ln">{m.line}</span>
                    <span className="search-text">
                      {before.length > 40 ? "…" + before.slice(-40) : before}
                      <mark>{hit}</mark>
                      {after}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
