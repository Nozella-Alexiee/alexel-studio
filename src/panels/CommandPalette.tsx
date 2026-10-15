// Satu kotak untuk semuanya. Awalan: (kosong) berkas · ">" perintah · ":" baris ·
// "@" simbol · "!" Smart Run · "?" tanya Claude.

import { CornerDownLeft, Hash, Play, SquareFunction, Terminal } from "lucide-react";
import { CrabMascot } from "../components/CrabMascot";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { prettyKeys, visibleCommands } from "../app/commands";
import * as A from "../app/actions";
import { runTarget } from "../app/run";
import { FileIcon } from "../components/FileIcon";
import { Highlighted } from "../components/ui";
import * as docs from "../editor/documents";
import { extractSymbols } from "../editor/symbols";
import { fuzzyFilter } from "../lib/fuzzy";
import { join } from "../lib/paths";
import { activeTab, getState, setState, useStore } from "../state/store";
import { modKey } from "../lib/keys";
import { projectFiles } from "../lib/projectFiles";

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
  "": { placeholder: "Cari berkas…  (ketik > perintah, : baris, @ simbol, ! run, ? Claude)", label: "Berkas" },
  ">": { placeholder: "Ketik perintah…", label: "Perintah" },
  ":": { placeholder: "Nomor baris, mis. 42 atau 42:10", label: "Pergi ke baris" },
  "@": { placeholder: "Simbol di berkas ini…", label: "Simbol" },
  "!": { placeholder: "Target Smart Run…", label: "Smart Run" },
  "?": { placeholder: "Tanya Claude tentang project ini…", label: "Claude" },
};

export function CommandPalette() {
  const palette = useStore((s) => s.palette);
  const root = useStore((s) => s.root);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!palette.open) return;
    setValue(palette.initial);
    setSel(0);
    requestAnimationFrame(() => input.current?.focus());
    if (root) void projectFiles(root).then(setFiles);
  }, [palette.open, palette.initial, root]);

  const prefix = MODES[value[0]] && value[0] !== "" ? value[0] : "";
  const query = prefix ? value.slice(1).trimStart() : value;
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
        keys: c.keys,
        run: () => void c.run(),
      }));
    }
    if (prefix === ":") {
      const m = query.match(/^(\d+)(?::(\d+))?/);
      const tab = activeTab();
      if (!m || tab?.kind !== "text") return [];
      return [{ key: "line", icon: <Hash size={14} aria-hidden />, label: `Pergi ke baris ${m[1]}${m[2] ? `, kolom ${m[2]}` : ""}`, run: () => docs.revealPosition(s.focusedGroup, Number(m[1]), Number(m[2] ?? 1)) }];
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
      return [{ key: "ask", icon: <CrabMascot size={15} />, label: `Tanya Claude: ${query}`, detail: "dengan berkas aktif sebagai konteks", run: () => void import("../claude/claude").then((m) => m.sendToClaude(query, { includeFile: s.settings.claudeIncludeFile })) }];
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
    return fuzzyFilter(q, rels, (r) => r, 60).map(({ item: rel, positions }) => {
      const nameStart = rel.lastIndexOf("/") + 1;
      return {
        key: rel,
        icon: <FileIcon filename={rel} size={14} />,
        label: rel.slice(nameStart),
        positions: positions.filter((p) => p >= nameStart).map((p) => p - nameStart),
        detail: rel.slice(0, Math.max(0, nameStart - 1)),
        run: (side?: boolean) => void A.openFile(join(rootDir, rel), { group: side ? 1 : undefined, line: lineMatch ? Number(lineMatch[2]) : undefined }),
      };
    });
  }, [palette.open, prefix, query, files, root]);

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
          {!items.length && <div className="pal-empty">{prefix === ":" ? "Ketik nomor baris." : prefix === "?" ? "Ketik pertanyaanmu." : !root && !prefix ? "Buka folder dulu untuk mencari berkas." : "Tidak ada hasil."}</div>}
        </div>
        <div className="pal-foot">
          <span>
            <CornerDownLeft size={11} aria-hidden /> pilih
          </span>
          <span>{prettyKeys("Mod+Enter")} buka di kanan</span>
          <span>esc tutup</span>
        </div>
      </div>
    </div>
  );
}
