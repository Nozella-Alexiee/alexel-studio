// Halaman detail ekstensi (tab di editor): README, changelog, kecocokan, versi, pasang/perbarui/hapus.

import { BadgeCheck, Download, ExternalLink, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { installExtension, removeExtension } from "../extensions/install";
import { fetchDetails, fmtDl, type Details } from "../extensions/market";
import { cmpVersion, useExtensions } from "../extensions/registry";
import { Segmented, Spinner } from "../components/ui";
import { errMsg, openExternal } from "../lib/ipc";
import { renderRemoteMarkdown } from "../lib/markdown";
import { tl } from "../i18n";
import { CompatBadge, contribList } from "./CompatBadge";

export const EXT_TAB_PREFIX = "nozel:ext:";

export default function ExtensionDetail({ id }: { id: string }) {
  const [ns, ...rest] = id.split(".");
  const name = rest.join(".");
  const [d, setD] = useState<Details | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"readme" | "changelog">("readme");
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const installed = useExtensions((s) => s.list.find((e) => e.id === id));

  useEffect(() => {
    let alive = true;
    setD(null);
    setErr(null);
    fetchDetails(ns, name)
      .then((x) => {
        if (!alive) return;
        setD(x);
        setVersion(x.version);
      })
      .catch((e) => alive && setErr(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [ns, name]);

  const html = useMemo(() => (d ? renderRemoteMarkdown(tab === "readme" ? d.readme : d.changelog) : ""), [d, tab]);

  if (err) return <div className="ext-detail pad"><p className="hint">{tl("Gagal menghubungi Open VSX: {error}", { error: err })}</p></div>;
  if (!d) return <div className="ext-detail pad"><Spinner /></div>;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const hasUpdate = installed && cmpVersion(d.version, installed.version) > 0;
  const canInstall = d.compat.level !== "none";
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:|^mailto:/.test(href)) void openExternal(href);
  };

  return (
    <div className="ext-detail">
      <header className="ext-detail-head">
        <div className="ext-detail-title">
          <h1>
            {d.displayName} {d.verified && <BadgeCheck size={16} className="tone-success-fg" aria-label={tl("Penerbit terverifikasi")} />}
          </h1>
          <div className="ext-meta">
            <span>{d.publisher}</span>
            <span>
              · <Download size={11} aria-hidden /> {fmtDl(d.downloads)}
            </span>
            {d.rating != null && (
              <span>
                · <Star size={11} aria-hidden /> {d.rating.toFixed(1)} ({d.reviews})
              </span>
            )}
            {d.license && <span>· {d.license}</span>}
          </div>
          <p className="ext-detail-desc">{d.description}</p>
          <div className="ext-detail-compat">
            <CompatBadge compat={d.compat} />
            {d.compat.data.length > 0 && <span className="hint">{contribList(d.compat)}</span>}
          </div>
          {d.compat.alt && <p className="hint ext-alt">{tl(d.compat.alt)}</p>}
          {d.compat.level === "none" && !d.compat.alt && <p className="hint ext-alt">{tl("Ekstensi ini hanya berisi fitur yang butuh kode ekstensi, jadi tidak bisa dipasang di Alexel Studio.")}</p>}
        </div>
        <div className="ext-detail-actions">
          {installed ? (
            <>
              {hasUpdate && (
                <button className="btn btn-primary" disabled={busy} onClick={() => void act(() => installExtension(ns, name, { quiet: true }))}>
                  {busy ? <Spinner size={11} /> : tl("Perbarui ke {v}", { v: d.version })}
                </button>
              )}
              <button className="btn" disabled={busy} onClick={() => void act(() => removeExtension(installed))}>
                {tl("Hapus")}
              </button>
              <span className="hint">{tl("Terpasang")} v{installed.version}</span>
            </>
          ) : (
            <>
              <button className="btn btn-primary" disabled={busy || !canInstall} onClick={() => void act(() => installExtension(ns, name, { version: version !== d.version ? version : undefined }))}>
                {busy ? <Spinner size={11} /> : tl("Pasang")}
              </button>
              {d.versions.length > 1 && (
                <select className="input ext-ver" value={version} onChange={(e) => setVersion(e.target.value)} aria-label={tl("Versi")}>
                  {d.versions.slice(0, 40).map((v) => (
                    <option key={v} value={v}>
                      v{v}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {d.homepage && (
            <button className="btn btn-ghost" onClick={() => void openExternal(d.homepage!)}>
              <ExternalLink size={12} aria-hidden /> {tl("Situs")}
            </button>
          )}
        </div>
      </header>
      <Segmented label={tl("Bagian")} value={tab} onChange={setTab} options={[{ id: "readme", label: "README" }, { id: "changelog", label: "Changelog" }]} />
      {html ? <article className="md-preview ext-readme" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} /> : <p className="hint pad">{tl("Tidak ada isi.")}</p>}
    </div>
  );
}
