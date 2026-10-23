// vscode.languages: provider fitur bahasa (didaftarkan ke editor lewat RPC), koleksi diagnostik, konfigurasi bahasa.

import type { HostCtx, LoadedExt } from "./context";
import { diagnostic as jDiag } from "./convert";
import { matchSelector, normalizeSelector, type DocumentSelector } from "./selector";
import { Disposable, EventEmitter, type Diagnostic } from "./types";
import { Uri } from "./uri";

let providerSeq = 0;
let collectionSeq = 0;

/** Provider yang fiturnya dijembatani ke editor Alexel Studio. Sisanya didaftarkan tetapi tanpa tampilan. */
export const BRIDGED = new Set(["completion", "hover", "definition", "declaration", "typeDefinition", "implementation", "references", "formatting", "rangeFormatting", "codeAction", "documentSymbol", "rename", "signatureHelp", "codeLens", "documentHighlight", "documentLink", "foldingRange", "inlayHints"]);

export function languagesApi(hc: HostCtx, ext: LoadedExt | null) {
  const register = (kind: string, selector: DocumentSelector, provider: unknown, extra: Record<string, unknown> = {}) => {
    const id = ++providerSeq;
    const sel = normalizeSelector(selector);
    hc.providers.set(id, { id, kind, selector: sel, provider, ext });
    if (BRIDGED.has(kind)) hc.rpc.notify("ui/providerRegistered", { id, kind, selector: sel, owner: ext?.id, ...extra });
    return new Disposable(() => {
      hc.providers.delete(id);
      hc.rpc.notify("ui/providerRegistered", { id, removed: true });
    });
  };
  const reg = (kind: string) => (selector: DocumentSelector, provider: unknown) => register(kind, selector, provider);

  const collections = new Map<string, Map<string, Diagnostic[]>>();
  const createDiagnosticCollection = (name?: string) => {
    const owner = name ?? `collection-${++collectionSeq}`;
    const data = new Map<string, Diagnostic[]>();
    collections.set(owner, data);
    hc.diagnostics.set(`${ext?.id ?? "host"}:${owner}`, data);
    const push = (uri: Uri) => {
      hc.rpc.notify("ui/diagnostics", { owner: `${ext?.id ?? "host"}:${owner}`, uri: uri.toString(), items: (data.get(uri.toString()) ?? []).map(jDiag) });
      hc.events.diagnostics.fire({ uris: [uri] });
    };
    const col = {
      name: owner,
      set(a: Uri | [Uri, Diagnostic[] | undefined][], diags?: readonly Diagnostic[]) {
        if (Array.isArray(a)) {
          for (const [u, d] of a) {
            if (d) data.set(u.toString(), [...d]);
            else data.delete(u.toString());
            push(u);
          }
        } else {
          if (diags) data.set(a.toString(), [...diags]);
          else data.delete(a.toString());
          push(a);
        }
      },
      delete(uri: Uri) {
        data.delete(uri.toString());
        push(uri);
      },
      clear() {
        for (const k of [...data.keys()]) {
          data.delete(k);
          push(Uri.parse(k));
        }
      },
      forEach(cb: (uri: Uri, diags: readonly Diagnostic[], c: unknown) => void, thisArg?: unknown) {
        for (const [k, v] of data) cb.call(thisArg, Uri.parse(k), v, col);
      },
      get: (uri: Uri) => data.get(uri.toString()),
      has: (uri: Uri) => data.has(uri.toString()),
      dispose() {
        col.clear();
        hc.diagnostics.delete(`${ext?.id ?? "host"}:${owner}`);
        collections.delete(owner);
      },
    };
    return col;
  };

  return {
    registerCompletionItemProvider: (selector: DocumentSelector, provider: unknown, ...triggerCharacters: string[]) => register("completion", selector, provider, { triggerCharacters }),
    registerHoverProvider: reg("hover"),
    registerDefinitionProvider: reg("definition"),
    registerDeclarationProvider: reg("declaration"),
    registerTypeDefinitionProvider: reg("typeDefinition"),
    registerImplementationProvider: reg("implementation"),
    registerReferenceProvider: reg("references"),
    registerDocumentFormattingEditProvider: reg("formatting"),
    registerDocumentRangeFormattingEditProvider: reg("rangeFormatting"),
    registerOnTypeFormattingEditProvider: (selector: DocumentSelector, provider: unknown, first: string, ...more: string[]) => register("onTypeFormatting", selector, provider, { triggerCharacters: [first, ...more] }),
    registerCodeActionsProvider: (selector: DocumentSelector, provider: unknown, meta?: unknown) => register("codeAction", selector, provider, { meta }),
    registerDocumentSymbolProvider: reg("documentSymbol"),
    registerWorkspaceSymbolProvider: (provider: unknown) => register("workspaceSymbol", "*", provider),
    registerRenameProvider: reg("rename"),
    registerSignatureHelpProvider: (selector: DocumentSelector, provider: unknown, ...a: unknown[]) => register("signatureHelp", selector, provider, { triggerCharacters: typeof a[0] === "object" && a[0] ? (a[0] as { triggerCharacters?: string[] }).triggerCharacters : (a as string[]) }),
    registerCodeLensProvider: reg("codeLens"),
    registerDocumentHighlightProvider: reg("documentHighlight"),
    registerDocumentLinkProvider: reg("documentLink"),
    registerFoldingRangeProvider: reg("foldingRange"),
    registerInlayHintsProvider: reg("inlayHints"),
    registerColorProvider: reg("color"),
    registerSelectionRangeProvider: reg("selectionRange"),
    registerCallHierarchyProvider: reg("callHierarchy"),
    registerTypeHierarchyProvider: reg("typeHierarchy"),
    registerLinkedEditingRangeProvider: reg("linkedEditing"),
    registerEvaluatableExpressionProvider: reg("evaluatable"),
    registerInlineValuesProvider: reg("inlineValues"),
    registerDocumentSemanticTokensProvider: reg("semanticTokens"),
    registerDocumentRangeSemanticTokensProvider: reg("semanticTokensRange"),
    registerInlineCompletionItemProvider: reg("inlineCompletion"),
    registerDocumentDropEditProvider: reg("dropEdit"),
    createDiagnosticCollection,
    getDiagnostics(uri?: Uri): unknown {
      if (uri) return [...hc.diagnostics.values()].flatMap((m) => m.get(uri.toString()) ?? []);
      const merged = new Map<string, Diagnostic[]>();
      for (const m of hc.diagnostics.values()) for (const [k, v] of m) merged.set(k, [...(merged.get(k) ?? []), ...v]);
      return [...merged].map(([k, v]) => [Uri.parse(k), v]);
    },
    onDidChangeDiagnostics: hc.events.diagnostics.event,
    async getLanguages() {
      return [...new Set([...hc.docs.values()].map((d) => d.languageId))];
    },
    setLanguageConfiguration(language: string, configuration: Record<string, unknown>) {
      hc.rpc.notify("ui/languageConfiguration", { language, owner: ext?.id, configuration: JSON.parse(JSON.stringify(configuration, (_k, v) => (v instanceof RegExp ? { $regex: v.source, flags: v.flags } : v))) });
      return new Disposable(() => {});
    },
    setTextDocumentLanguage: async (doc: { languageId: string }, lang: string) => {
      doc.languageId = lang;
      return doc;
    },
    match(selector: DocumentSelector, doc: import("./document").HostDocument) {
      return matchSelector(normalizeSelector(selector), doc) ? 10 : 0;
    },
    createLanguageStatusItem: () => ({ dispose() {}, text: "", detail: "", severity: 0 }),
    onDidChangeLanguageStatus: new EventEmitter<unknown>().event,
  };
}
