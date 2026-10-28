// Satu kotak untuk semuanya. Awalan: (kosong) berkas · ">" perintah · ":" baris ·
// "@" simbol · "!" Smart Run · "?" tanya Claude.

import { CornerDownLeft, Hash, Play, SquareFunction, Terminal } from "lucide-react";
import { CrabMascot } from "../components/CrabMascot";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { keysOf, prettyKeys, visibleCommands } from "../app/commands";
import * as A from "../app/actions";
import { runTarget } from "../app/run";
import { FileIcon } from "../components/FileIcon";
import { Highlighted } from "../components/ui";
import * as docs from "../editor/documents";
import { extractSymbols } from "../editor/symbols";
import type { WorkspaceSymbol } from "../editor/lsp";
import { fuzzyFilter } from "../lib/fuzzy";
import { join } from "../lib/paths";
import { activeTab, getState, setState, useStore } from "../state/store";
import { modKey } from "../lib/keys";
import { projectFiles, workspaceExtraFiles } from "../lib/projectFiles";
import { tl } from "../i18n";

interface Item {
  key: string;
  icon: React.ReactNode;
  label: string;
  positions?: number[];
  detail?: string;
  keys?: string;
  run: (side?: boolean) => void;
}

const MODES: Record<string, { placeholder: string; label: string }> = {
  "": { placeholder: tl("Cari berkas…  (ketik > perintah, : baris, @ simbol, # simbol project, ! run, ? agen AI)"), label: tl("Berkas") },
  ">": { placeholder: tl("Ketik perintah…"), label: tl("Perintah") },
  ":": { placeholder: tl("Nomor baris, mis. 42 atau 42:10"), label: tl("Pergi ke baris") },
  "@": { placeholder: tl("Simbol di berkas ini…"), label: tl("Simbol") },
  "#": { placeholder: tl("Simbol di seluruh project…"), label: tl("Simbol project") },
  "!": { placeholder: tl("Target Smart Run…"), label: "Smart Run" },
  "?": { placeholder: tl("Tanya agen AI tentang project ini…"), label: tl("Agen AI") },
};

export function CommandPalette() {
  const palette = useStore((s) => s.palette);
  const root = useStore((s) => s.root);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const extraRoots = useStore((s) => s.extraRoots);
  const [extraFiles, setExtraFiles] = useState<{ label: string; abs: string }[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!palette.open) return;
    setValue(palette.initial);
    setSel(0);
    requestAnimationFrame(() => input.current?.focus());
    if (root) void projectFiles(root).then(setFiles);
    if (extraRoots.length) void workspaceExtraFiles(extraRoots).then(setExtraFiles);
    else setExtraFiles([]);
  }, [palette.open, palette.initial, root, extraRoots]);

  const prefix = MODES[value[0]] && value[0] !== "" ? value[0] : "";
  const query = prefix ? value.slice(1).trimStart() : value;
  const [wsSyms, setWsSyms] = useState<WorkspaceSymbol[]>([]);
  useEffect(() => {
    if (!palette.open || prefix !== "#") return;
    let live = true;
    const t = setTimeout(async () => {
      const { workspaceSymbols } = await import("../editor/lsp");
      let found = await workspaceSymbols(query);
      // Tanpa server bahasa: simbol dari berkas yang sedang terbuka.
      if (!found.length)
        found = docs.openDocs().flatMap((d) => extractSymbols(d.langId, docs.currentText(d.path) ?? "").map((x) => ({ name: x.name, kind: x.kind, path: d.path, line: x.line, col: 1 })));
      if (live) setWsSyms(found);
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [palette.open, prefix, query]);
  const close = () => setState({ palette: { open: false, initial: "" } });

  const items: Item[] = useMemo(() => {
    if (!palette.open) return [];
    const s = getState();
    if (prefix === ">") {
      return fuzzyFilter(query, visibleCommands(), (c) => `${c.group}: ${c.label}`, 80).map(({ item: c, positions }) => ({
        key: c.id,
        icon: <Terminal size={14} aria-hidden />,
        label: `${c.group}: ${c.label}`,
        positions,
        keys: keysOf(c),
        run: () => void c.run(),
      }));
    }
    if (prefix === ":") {
      const m = query.match(/^(\d+)(?::(\d+))?/);
      const tab = activeTab();
      if (!m || tab?.kind !== "text") return [];
      return [{ key: "line", icon: <Hash size={14} aria-hidden />, label: m[2] ? tl("Pergi ke baris {line}, kolom {col}", { line: m[1], col: m[2] }) : tl("Pergi ke baris {line}", { line: m[1] }), run: () => docs.revealPosition(s.focusedGroup, Number(m[1]), Number(m[2] ?? 1)) }];
    }
    if (prefix === "@") {
      const tab = activeTab();
      const d = tab?.kind === "text" ? docs.getDoc(tab.id) : null;
      if (!d || !tab) return [];
      const syms = extractSymbols(d.langId, docs.currentText(tab.id) ?? "");
      return fuzzyFilter(query, syms, (x) => x.name, 200).map(({ item: x, positions }) => ({
        key: `${x.name}:${x.line}`,
        icon: <SquareFunction size={14} aria-hidden />,
        label: x.name,
        positions,
        detail: `${x.kind} · baris ${x.line}`,
        run: () => docs.revealPosition(s.focusedGroup, x.line),
      }));
    }
    if (prefix === "#") {
      const rootDir = root ?? "";
      return fuzzyFilter(query, wsSyms, (x) => x.name, 120).map(({ item: x, positions }) => ({
        key: `${x.path}:${x.line}:${x.name}`,
        icon: <SquareFunction size={14} aria-hidden />,
        label: x.name,
        positions,
        detail: `${x.kind} · ${x.path.startsWith(rootDir) ? x.path.slice(rootDir.length + 1) : x.path}:${x.line}`,
        run: () => void A.openFile(x.path, { line: x.line, col: x.col }),
      }));
    }
    if (prefix === "!") {
      return fuzzyFilter(query, s.runTargets, (t) => t.label, 50).map(({ item: t, positions }) => ({
        key: t.id,
        icon: <Play size={14} aria-hidden />,
        label: t.label,
        positions,
        detail: t.command,
        run: () => void runTarget(t),
      }));
    }
    if (prefix === "?") {
      if (!query) return [];
      return [{ key: "ask", icon: <CrabMascot size={15} />, label: `${tl("Tanya agen AI")}: ${query}`, detail: tl("dengan berkas aktif sebagai konteks"), run: () => void import("../claude/claude").then((m) => m.sendToClaude(query, { includeFile: s.settings.claudeIncludeFile })) }];
    }
    // Berkas: tab terbuka dulu (urutan terbaru), lalu seluruh project.
    const openIds = s.groups.flatMap((g) => g.tabs).filter((id, i, a) => a.indexOf(id) === i && s.tabs[id]?.kind !== "settings");
    const rootDir = root ?? "";
    const rels = files.length ? files : openIds.map((p) => p.slice(rootDir.length + 1));
    if (!query) {
      const recent = openIds.slice(-12).reverse();
      return recent.map((p) => ({
        key: p,
        icon: <FileIcon filename={p} size={14} />,
        label: p.split("/").pop()!,
        detail: p.startsWith(rootDir) ? p.slice(rootDir.length + 1) : p,
        run: (side?: boolean) => void A.openFile(p, { group: side ? 1 : undefined }),
      }));
    }
    const lineMatch = query.match(/^(.*?):(\d+)$/);
    const q = lineMatch ? lineMatch[1] : query;
    // Multi-root: berkas folder tambahan berawalan nama foldernya ("api/src/a.ts").
    const absOf = new Map(extraFiles.map((x) => [x.label, x.abs]));
    const all = extraFiles.length ? [...rels, ...extraFiles.map((x) => x.label)] : rels;
    return fuzzyFilter(q, all, (r) => r, 60).map(({ item: rel, positions }) => {
      const nameStart = rel.lastIndexOf("/") + 1;
      return {
        key: rel,
        icon: <FileIcon filename={rel} size={14} />,
        label: rel.slice(nameStart),
        positions: positions.filter((p) => p >= nameStart).map((p) => p - nameStart),
        detail: rel.slice(0, Math.max(0, nameStart - 1)),
        run: (side?: boolean) => void A.openFile(absOf.get(rel) ?? join(rootDir, rel), { group: side ? 1 : undefined, line: lineMatch ? Number(lineMatch[2]) : undefined }),
      };
    });
  }, [palette.open, prefix, query, files, extraFiles, root, wsSyms]);

  useEffect(() => setSel(0), [prefix, query]);
  useEffect(() => {
    list.current?.querySelector(".pal-item.is-sel")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!palette.open) return null;

  const choose = (i: number, side = false) => {
    const it = items[i];
    if (!it) return;
    close();
    it.run(side);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      setSel((v) => Math.min(items.length - 1, v + 1));
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      setSel((v) => Math.max(0, v - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(sel, modKey(e));
    } else if (e.key === "Backspace" && value.length === 1 && prefix) {
      e.preventDefault();
      setValue("");
    }
  };

  const mode = MODES[prefix];
  return (
    <div className="scrim scrim-top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={mode.label}>
        <div className="pal-input-row">
          {prefix && <span className="pal-mode">{mode.label}</span>}
          <input
            ref={input}
            aria-label={mode.label}
            className="pal-input"
            value={value}
            placeholder={mode.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-activedescendant={items[sel] ? `pal-${sel}` : undefined}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="pal-list" id="pal-list" role="listbox" ref={list}>
          {items.map((it, i) => (
            <div key={it.key} id={`pal-${i}`} role="option" aria-selected={i === sel} className={`pal-item ${i === sel ? "is-sel" : ""}`} onMouseMove={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); choose(i, modKey(e)); }}>
              {it.icon}
              <span className="pal-label">{it.positions ? <Highlighted text={it.label} positions={it.positions} /> : it.label}</span>
              {it.detail && <span className="pal-detail">{it.detail}</span>}
              {it.keys && <kbd className="kbd">{prettyKeys(it.keys)}</kbd>}
            </div>
          ))}
          {!items.length && <div className="pal-empty">{prefix === ":" ? tl("Ketik nomor baris.") : prefix === "?" ? tl("Ketik pertanyaanmu.") : !root && !prefix ? tl("Buka folder dulu untuk mencari berkas.") : tl("Tidak ada hasil.")}</div>}
        </div>
        <div className="pal-foot">
          <span>
            <CornerDownLeft size={11} aria-hidden /> pilih
          </span>
          <span>{tl("{keys} buka di kanan", { keys: prettyKeys("Mod+Enter") })}</span>
          <span>{tl("esc tutup")}</span>
        </div>
      </div>
    </div>
  );
}
