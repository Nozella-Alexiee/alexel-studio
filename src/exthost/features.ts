// Fitur editor dari ekstensi: autocomplete, hover, diagnostik, dekorasi. Dipasang ke tiap dokumen lewat
// `hostFeatures()`; tanpa extension host yang berjalan semuanya diam (tidak ada biaya).

import { snippet, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { forceLinting, linter, type Diagnostic } from "@codemirror/lint";
import { EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, hoverTooltip, type DecorationSet } from "@codemirror/view";
import * as docs from "../editor/documents";
import { fileUri } from "../editor/lsp";
import { convertSnippetBody } from "../extensions/registry";
import { globMatch } from "../lib/glob";
import { renderRemoteMarkdown } from "../lib/markdown";
import { hostCall } from "./client";
import { hostDiagRaw } from "./handlers";
import { vscodeLanguageId } from "./lang";
import { useExtHost, type HostProvider } from "./state";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
interface JPos { l: number; c: number }
interface JRange { s: JPos; e: JPos }

// ---- pencocokan provider -----------------------------------------------------------------

function selectorMatches(p: HostProvider, path: string, langId: string): boolean {
  if (!p.selector.length) return true;
  return p.selector.some((f) => {
    if (f.language && f.language !== "*" && f.language !== langId) return false;
    if (f.scheme && f.scheme !== "file") return false;
    if (f.pattern) {
      const pat = typeof f.pattern === "string" ? f.pattern : f.pattern.pattern;
      const p2 = path.startsWith("/") ? path.slice(1) : path;
      if (!globMatch(pat.includes("/") ? pat : `**/${pat}`, p2)) return false;
    }
    return true;
  });
}

/** Ada provider ekstensi untuk jenis fitur ini di berkas ini? */
export function hostProviders(kind: string, path: string): HostProvider[] {
  const st = useExtHost.getState();
  if (!st.running) return [];
  const d = docs.getDoc(path);
  const langId = d ? vscodeLanguageId(path, d.langId) : "plaintext";
  return Object.values(st.providers).filter((p) => p.kind === kind && selectorMatches(p, path, langId));
}

const offsetOf = (state: EditorState, p: JPos) => {
  const line = state.doc.line(Math.min(Math.max(p.l + 1, 1), state.doc.lines));
  return Math.min(line.from + p.c, line.to);
};
const posOf = (state: EditorState, offset: number): JPos => {
  const line = state.doc.lineAt(offset);
  return { l: line.number - 1, c: offset - line.from };
};

// ---- completion --------------------------------------------------------------------------

const KIND_TYPE: Record<number, string> = { 0: "text", 1: "method", 2: "function", 3: "class", 4: "property", 5: "variable", 6: "class", 7: "interface", 8: "namespace", 9: "property", 10: "constant", 11: "constant", 12: "enum", 13: "keyword", 14: "text", 15: "constant", 16: "text", 17: "text", 18: "text", 19: "enum", 20: "constant", 21: "class", 22: "variable", 23: "keyword", 24: "type" };

function toCompletion(it: Any): Completion {
  return {
    label: it.label,
    detail: it.detail,
    type: KIND_TYPE[it.kind] ?? "text",
    info: it.doc ? () => {
      const el = document.createElement("div");
      el.className = "md-preview cm-ext-doc";
      el.innerHTML = renderRemoteMarkdown(it.doc);
      return el;
    } : undefined,
    boost: it.preselect ? 10 : 0,
    apply: (view: EditorView, completion: Completion, from: number, to: number) => {
      let r = it.range ? { from: offsetOf(view.state, it.range.s), to: offsetOf(view.state, it.range.e) } : { from, to };
      const text: string = it.insert ?? it.label;
      if (it.additional?.length) {
        // Edit tambahan (mis. import otomatis) dihitung terhadap dokumen sebelum penyisipan; posisi sisipan ikut bergeser.
        const extra = (it.additional as { range: JRange; newText: string }[]).map((e) => ({ from: offsetOf(view.state, e.range.s), to: offsetOf(view.state, e.range.e), insert: e.newText }));
        const cs = view.state.changes(extra);
        view.dispatch({ changes: cs });
        r = { from: cs.mapPos(r.from, -1), to: cs.mapPos(r.to, 1) };
      }
      if (it.snippet) snippet(convertSnippetBody(text))(view, completion, r.from, r.to);
      else view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length }, userEvent: "input.complete" });
      if (it.command?.command) void hostCall("command/execute", { id: it.command.command, args: it.command.arguments }).catch(() => {});
    },
  };
}

function completionSource(path: string) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const providers = hostProviders("completion", path);
    if (!providers.length) return null;
    const word = ctx.matchBefore(/[\w$-]*/);
    const prev = ctx.pos > 0 ? ctx.state.sliceDoc(ctx.pos - 1, ctx.pos) : "";
    const triggers = new Set(providers.flatMap((p) => p.triggerCharacters ?? []));
    const byTrigger = triggers.has(prev);
    if (!ctx.explicit && !byTrigger && (!word || word.from === word.to)) return null;
    try {
      const r = (await hostCall<{ items: Any[]; incomplete: boolean }>("provide", { kind: "completion", uri: fileUri(path), pos: posOf(ctx.state, ctx.pos), opts: byTrigger ? { character: prev } : {} }));
      if (!r?.items?.length) return null;
      return { from: byTrigger && (!word || word.from === word.to) ? ctx.pos : word!.from, options: r.items.map((i) => toCompletion(i)), validFor: r.incomplete ? undefined : /^[\w$-]*$/ };
    } catch {
      return null;
    }
  };
}

// ---- hover -------------------------------------------------------------------------------

function hoverSource(path: string) {
  return hoverTooltip(async (view, pos) => {
    if (!hostProviders("hover", path).length) return null;
    try {
      const r = await hostCall<{ contents: string[]; range: JRange | null } | null>("provide", { kind: "hover", uri: fileUri(path), pos: posOf(view.state, pos) });
      if (!r?.contents?.length) return null;
      const from = r.range ? offsetOf(view.state, r.range.s) : pos;
      const to = r.range ? offsetOf(view.state, r.range.e) : pos;
      return {
        pos: from,
        end: to,
        above: true,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "cm-ext-hover md-preview";
          dom.innerHTML = r.contents.map((c) => renderRemoteMarkdown(c)).join("<hr/>");
          return { dom };
        },
      };
    } catch {
      return null;
    }
  });
}

// ---- diagnostik --------------------------------------------------------------------------

function hostDiagnosticsFor(view: EditorView, path: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [k, items] of hostDiagRaw) {
    if (!k.endsWith(`|${path}`)) continue;
    for (const d of items) {
      const from = offsetOf(view.state, d.range.s);
      const to = Math.max(from, offsetOf(view.state, d.range.e));
      out.push({ from, to: to === from ? Math.min(from + 1, view.state.doc.length) : to, severity: d.severity === 0 ? "error" : d.severity === 1 ? "warning" : "info", message: String(d.message), source: d.source });
    }
  }
  return out;
}

/** Perbarui garis diagnostik di editor yang menampilkan berkas ini. */
export function refreshHostDiagnostics(path: string) {
  for (const v of docs.viewsShowing(path)) forceLinting(v);
}

// ---- dekorasi ----------------------------------------------------------------------------

interface DecItem { range: JRange; hover?: string; render?: Any }
const decTypes = new Map<number, Any>();
const decByPath = new Map<string, Map<number, DecItem[]>>();
const decChanged = StateEffect.define<null>();

export function defineDecorationType(key: number, options: Any) {
  decTypes.set(key, options);
}
export function removeDecorationType(key: number) {
  decTypes.delete(key);
  for (const [path, m] of decByPath) {
    if (m.delete(key)) for (const v of docs.viewsShowing(path)) v.dispatch({ effects: decChanged.of(null) });
  }
}
/** Buang semua dekorasi dari host (host berhenti/dimulai ulang). */
export function clearHostDecorations() {
  const paths = [...decByPath.keys()];
  decTypes.clear();
  decByPath.clear();
  for (const path of paths) for (const v of docs.viewsShowing(path)) v.dispatch({ effects: decChanged.of(null) });
}
export function applyHostDecorations(path: string, type: number, items: DecItem[]) {
  let m = decByPath.get(path);
  if (!m) decByPath.set(path, (m = new Map()));
  if (items.length) m.set(type, items);
  else m.delete(type);
  for (const v of docs.viewsShowing(path)) v.dispatch({ effects: decChanged.of(null) });
}

class TextWidget extends WidgetType {
  constructor(readonly text: string, readonly css: string) {
    super();
  }
  eq(o: TextWidget) {
    return o.text === this.text && o.css === this.css;
  }
  toDOM() {
    const s = document.createElement("span");
    s.textContent = this.text;
    s.style.cssText = this.css;
    s.className = "cm-ext-widget";
    return s;
  }
  ignoreEvent() {
    return true;
  }
}

/** ThemeColor VS Code → variabel warna desain aktif (perkiraan; id tak dikenal = warna teks redup). */
function themeVar(id: string): string {
  const k = id.toLowerCase();
  if (/error|danger|invalid/.test(k)) return "var(--danger)";
  if (/warn/.test(k)) return "var(--warning)";
  if (/info|hint/.test(k)) return "var(--info, var(--accent))";
  if (/success|added|ok|passed/.test(k)) return "var(--success)";
  if (/foreground|text/.test(k)) return "var(--fg-muted)";
  if (/selection|highlight|find|match/.test(k)) return "var(--accent)";
  return "var(--fg-muted)";
}

const colorOf = (v: Any, background: boolean): string => {
  if (v && typeof v === "object" && v.id) {
    const c = themeVar(String(v.id));
    return background ? `color-mix(in srgb, ${c} 16%, transparent)` : c;
  }
  return String(v);
};

const cssOf = (o: Any): string => {
  if (!o) return "";
  const map: Record<string, string> = { backgroundColor: "background-color", color: "color", border: "border", borderRadius: "border-radius", fontWeight: "font-weight", fontStyle: "font-style", textDecoration: "text-decoration", opacity: "opacity", outline: "outline", margin: "margin", width: "width", height: "height", letterSpacing: "letter-spacing", cursor: "cursor" };
  return Object.entries(map).map(([k, css]) => (o[k] ? `${css}:${k === "color" || k === "backgroundColor" || k === "border" || k === "outline" ? colorOf(o[k], k === "backgroundColor") : o[k]}` : "")).filter(Boolean).join(";");
};

function buildDecorations(state: EditorState, path: string): DecorationSet {
  const m = decByPath.get(path);
  if (!m) return Decoration.none;
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const dark = document.documentElement.dataset.scheme !== "light";
  for (const [type, items] of m) {
    const opt = decTypes.get(type) ?? {};
    const themed = { ...opt, ...(dark ? opt.dark : opt.light) };
    const base = cssOf(themed);
    for (const it of items) {
      const from = offsetOf(state, it.range.s);
      const to = offsetOf(state, it.range.e);
      const r = it.render ? { ...themed, ...(dark ? it.render.dark : it.render.light), ...it.render } : themed;
      if (base && (themed.isWholeLine || from !== to)) {
        if (themed.isWholeLine) ranges.push({ from: state.doc.lineAt(from).from, to: state.doc.lineAt(from).from, deco: Decoration.line({ attributes: { style: base } }) });
        else ranges.push({ from, to, deco: Decoration.mark({ attributes: { style: base, ...(it.hover ? { title: it.hover.replace(/[`*_]/g, "") } : {}) } }) });
      }
      for (const [side, which] of [["before", -1], ["after", 1]] as const) {
        const w = r[side] ?? themed[side];
        if (w?.contentText) ranges.push({ from: which < 0 ? from : to, to: which < 0 ? from : to, deco: Decoration.widget({ widget: new TextWidget(w.contentText, cssOf({ ...w, ...(dark ? w.dark : w.light) })), side: which }) });
      }
    }
  }
  ranges.sort((a, b) => a.from - b.from || (a.deco.spec.side ?? 0) - (b.deco.spec.side ?? 0));
  const b = new RangeSetBuilder<Decoration>();
  for (const r of ranges) b.add(r.from, r.to, r.deco);
  return b.finish();
}

function decorationField(path: string) {
  return StateField.define<DecorationSet>({
    create: (s) => buildDecorations(s, path),
    update: (deco, tr) => (tr.docChanged || tr.effects.some((e) => e.is(decChanged)) ? buildDecorations(tr.state, path) : deco),
    provide: (f) => EditorView.decorations.from(f),
  });
}

// ---- paket fitur per dokumen -------------------------------------------------------------

export function hostFeatures(doc: { path: string }): Extension {
  const path = doc.path;
  return [
    EditorState.languageData.of(() => [{ autocomplete: completionSource(path) }]),
    hoverSource(path),
    linter((view) => hostDiagnosticsFor(view, path), { delay: 100 }),
    decorationField(path),
  ];
}

// ---- perintah editor yang diteruskan ke provider ekstensi -------------------------------

type Loc = { uri: string; range: JRange; selection?: JRange };

async function openLocation(l: Loc) {
  const { uriToPath } = await import("../editor/lsp");
  const A = await import("../app/actions");
  const r = l.selection ?? l.range;
  await A.openFile(uriToPath(l.uri), { line: r.s.l + 1, col: r.s.c + 1 });
}


export async function hostDefinition(path: string, view: EditorView, kind: "definition" | "typeDefinition" | "implementation" | "declaration" = "definition"): Promise<boolean> {
  if (!hostProviders(kind, path).length) return false;
  const r = await hostCall<Loc[]>("provide", { kind, uri: fileUri(path), pos: posOf(view.state, view.state.selection.main.head) }).catch(() => []);
  if (!r?.length) return true;
  await openLocation(r[0]);
  return true;
}

export async function hostReferences(path: string, view: EditorView): Promise<Loc[] | null> {
  if (!hostProviders("references", path).length) return null;
  return hostCall<Loc[]>("provide", { kind: "references", uri: fileUri(path), pos: posOf(view.state, view.state.selection.main.head) }).catch(() => []);
}

export async function hostFormat(path: string, view: EditorView, tabSize: number): Promise<boolean> {
  const sel = view.state.selection.main;
  const useRange = !sel.empty && hostProviders("rangeFormatting", path).length > 0;
  const kind = useRange ? "rangeFormatting" : "formatting";
  if (!hostProviders(kind, path).length) return false;
  const edits = await hostCall<{ range: JRange; newText: string }[]>("provide", { kind, uri: fileUri(path), range: useRange ? { s: posOf(view.state, sel.from), e: posOf(view.state, sel.to) } : undefined, opts: { tabSize, insertSpaces: true } }).catch(() => []);
  if (!edits?.length) return true;
  await docs.applyTextEdits(path, edits);
  return true;
}

export async function hostRename(path: string, view: EditorView, newName: string): Promise<{ files: { uri: string; edits: docs.WireEdit[] }[]; error?: string } | null> {
  if (!hostProviders("rename", path).length) return null;
  return hostCall("provide", { kind: "rename", uri: fileUri(path), pos: posOf(view.state, view.state.selection.main.head), opts: { newName } }).catch((e) => ({ files: [], error: String(e) })) as Promise<{ files: { uri: string; edits: docs.WireEdit[] }[]; error?: string }>;
}
