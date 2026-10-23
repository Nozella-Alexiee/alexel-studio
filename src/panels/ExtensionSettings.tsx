// Pengaturan yang dideklarasikan ekstensi (contributes.configuration), dikelompokkan per ekstensi seperti
// di VS Code. Nilai disimpan di settings.extSettings dan terbaca ekstensi lewat getConfiguration().

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import * as A from "../app/actions";
import { configProperties } from "../extensions/featureList";
import { useExtensions } from "../extensions/registry";
import { useStore } from "../state/store";
import { tl } from "../i18n";

type Prop = ReturnType<typeof configProperties>[number];

function Control({ p, value, onChange }: { p: Prop; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  if (p.type === "boolean") return <button role="switch" aria-checked={!!value} aria-label={p.key} className={`switch ${value ? "is-on" : ""}`} onClick={() => onChange(!value)} />;
  if (p.enum) {
    return (
      <select className="input select" value={String(value ?? "")} onChange={(e) => onChange(p.enum!.find((x) => String(x) === e.target.value) ?? e.target.value)} aria-label={p.key}>
        {p.enum.map((x, i) => (
          <option key={String(x)} value={String(x)} title={p.enumDescriptions?.[i]}>
            {String(x)}
          </option>
        ))}
      </select>
    );
  }
  if (p.type === "number" || p.type === "integer") {
    return <input className="input" type="number" value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} aria-label={p.key} />;
  }
  if (p.type === "array" || p.type === "object") {
    return (
      <textarea
        className={`input ${err ? "has-error" : ""}`}
        rows={Math.min(8, Math.max(2, JSON.stringify(value ?? null, null, 2).split("\n").length))}
        value={text ?? JSON.stringify(value ?? null, null, 2)}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setErr(false);
          } catch {
            setErr(true);
          }
        }}
        onBlur={() => !err && setText(null)}
        spellCheck={false}
        aria-label={p.key}
      />
    );
  }
  return <input className="input" value={typeof value === "string" ? value : value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value)} aria-label={p.key} />;
}

export function ExtensionSettings() {
  const list = useExtensions((s) => s.list);
  const settings = useStore((s) => s.settings.extSettings);
  const disabled = useStore((s) => s.settings.disabledExts);
  const groups = list
    .filter((e) => !disabled.includes(e.id))
    .map((e) => ({ ext: e, props: configProperties(e.contributes) }))
    .filter((g) => g.props.length);
  if (!groups.length) return null;
  const set = (key: string, v: unknown) => {
    const next = { ...(useStore.getState().settings.extSettings ?? {}) };
    if (v === undefined) delete next[key];
    else next[key] = v;
    A.updateSettings({ extSettings: next });
  };
  return (
    <section className="set-section" id="set-extensions">
      <h2>{tl("Pengaturan ekstensi")}</h2>
      <p className="hint">{tl("Nilai yang kamu ubah di sini dibaca ekstensi lewat getConfiguration. Disimpan di settings.json (extSettings).")}</p>
      {groups.map(({ ext, props }) => (
        <div key={ext.id} className="ext-set-group">
          <h3 className="ext-set-title">{ext.displayName}</h3>
          {props.map((p) => {
            const overridden = p.key in (settings ?? {});
            const value = overridden ? settings[p.key] : p.def;
            return (
              <div className="set-row" key={p.key}>
                <div className="set-label">
                  <div className="mono">{p.key}</div>
                  {p.desc && <div className="hint">{p.desc.replace(/[*`_]/g, "")}</div>}
                </div>
                <div className="set-control">
                  <Control p={p} value={value} onChange={(v) => set(p.key, v)} />
                  {overridden && (
                    <button className="btn btn-sm btn-ghost" title={tl("Kembalikan ke bawaan")} onClick={() => set(p.key, undefined)} aria-label={tl("Kembalikan ke bawaan")}>
                      <RotateCcw size={12} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
