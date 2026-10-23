// DocumentSelector VS Code: "ts", {language, scheme, pattern}, atau larik keduanya.

import type { HostDocument } from "./document";
import { globMatch } from "./glob";

export type DocumentFilter = { language?: string; scheme?: string; pattern?: string | { baseUri?: { fsPath: string }; base?: string; pattern: string } };
export type DocumentSelector = string | DocumentFilter | (string | DocumentFilter)[];

export const normalizeSelector = (s: DocumentSelector): DocumentFilter[] =>
  (Array.isArray(s) ? s : [s]).map((x) => (typeof x === "string" ? (x === "*" ? {} : { language: x }) : { language: x.language, scheme: x.scheme, pattern: typeof x.pattern === "string" ? x.pattern : x.pattern ? { base: x.pattern.base ?? x.pattern.baseUri?.fsPath, pattern: x.pattern.pattern } : undefined } as DocumentFilter));

export function matchFilter(f: DocumentFilter, doc: { languageId: string; uri: { scheme: string; fsPath: string } }): boolean {
  if (f.language && f.language !== "*" && f.language !== doc.languageId) return false;
  if (f.scheme && f.scheme !== "*" && f.scheme !== doc.uri.scheme) return false;
  if (f.pattern) {
    if (typeof f.pattern === "string") {
      const p = doc.uri.fsPath.replace(/\\/g, "/");
      if (!globMatch(f.pattern.startsWith("**/") || f.pattern.startsWith("/") ? f.pattern : f.pattern.includes("/") ? f.pattern : `**/${f.pattern}`, p.startsWith("/") ? p.slice(1) : p)) return false;
    } else {
      const base = (f.pattern.base ?? "").replace(/\\/g, "/").replace(/\/$/, "");
      const p = doc.uri.fsPath.replace(/\\/g, "/");
      if (base && !p.startsWith(base + "/")) return false;
      if (!globMatch(f.pattern.pattern, base ? p.slice(base.length + 1) : p)) return false;
    }
  }
  return true;
}

export const matchSelector = (sel: DocumentFilter[], doc: HostDocument): boolean => sel.some((f) => matchFilter(f, doc));
