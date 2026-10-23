// Konversi objek API `vscode` ⇄ JSON polos untuk dikirim ke editor (renderer) dan sebaliknya.

import { Diagnostic, DiagnosticSeverity, Location, LocationLink, MarkdownString, Position, Range, SnippetString, TextEdit } from "./types";
import { Uri } from "./uri";

export interface JPos {
  l: number;
  c: number;
}
export interface JRange {
  s: JPos;
  e: JPos;
}

export const pos = (p: Position): JPos => ({ l: p.line, c: p.character });
export const range = (r: Range): JRange => ({ s: pos(r.start), e: pos(r.end) });
export const toPos = (p: JPos) => new Position(p.l, p.c);
export const toRange = (r: JRange) => new Range(toPos(r.s), toPos(r.e));

export const md = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v instanceof MarkdownString) return v.value;
  const o = v as { language?: string; value?: string } | null;
  if (o && typeof o.value === "string") return o.language ? "```" + o.language + "\n" + o.value + "\n```" : o.value;
  return "";
};

export const edits = (list: TextEdit[] | undefined | null) => (list ?? []).filter(Boolean).map((e) => ({ range: range(e.range), newText: e.newText }));

export function diagnostic(d: Diagnostic) {
  const code = d.code && typeof d.code === "object" ? d.code.value : d.code;
  return { range: range(d.range), message: d.message, severity: d.severity ?? DiagnosticSeverity.Error, source: d.source, code: code === undefined ? undefined : String(code), tags: d.tags };
}

export function locations(v: unknown): { uri: string; range: JRange; selection?: JRange }[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  const out: { uri: string; range: JRange; selection?: JRange }[] = [];
  for (const x of arr) {
    if (x instanceof Location) out.push({ uri: x.uri.toString(), range: range(x.range) });
    else if (x instanceof LocationLink) out.push({ uri: x.targetUri.toString(), range: range(x.targetRange), selection: x.targetSelectionRange ? range(x.targetSelectionRange) : undefined });
    else if (x && typeof x === "object" && "uri" in x && "range" in x) out.push({ uri: Uri.revive((x as { uri: unknown }).uri).toString(), range: range((x as { range: Range }).range) });
    else if (x && typeof x === "object" && "targetUri" in x) {
      const l = x as LocationLink;
      out.push({ uri: Uri.revive(l.targetUri).toString(), range: range(l.targetRange), selection: l.targetSelectionRange ? range(l.targetSelectionRange) : undefined });
    }
  }
  return out;
}

export function completion(item: import("./types").CompletionItem) {
  const label = typeof item.label === "string" ? item.label : item.label.label;
  const labelDetail = typeof item.label === "string" ? undefined : item.label.detail ?? item.label.description;
  const ins = item.insertText;
  const r = item.range && !(item.range instanceof Range) ? item.range.replacing : (item.range as Range | undefined);
  return {
    label,
    detail: item.detail ?? labelDetail,
    kind: item.kind,
    doc: item.documentation === undefined ? undefined : md(item.documentation),
    sortText: item.sortText,
    filterText: item.filterText,
    insert: ins === undefined ? undefined : typeof ins === "string" ? ins : ins instanceof SnippetString ? ins.value : String(ins),
    snippet: ins instanceof SnippetString,
    range: r ? range(r) : undefined,
    additional: edits(item.additionalTextEdits),
    commit: item.commitCharacters,
    deprecated: item.tags?.includes(1) || undefined,
    command: item.command?.command ? { command: item.command.command, arguments: item.command.arguments } : undefined,
  };
}
