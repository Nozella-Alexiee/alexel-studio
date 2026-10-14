// Grammar TextMate (dari ekstensi) → bahasa CodeMirror lewat StreamLanguage.
// Mesin regex Oniguruma (WASM) dimuat hanya saat grammar pertama dipakai.

import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import type { IGrammar, IToken, StateStack } from "vscode-textmate";
import onigUrl from "vscode-oniguruma/release/onig.wasm?url";

type Reader = (scopeName: string) => Promise<{ content: string; path: string } | null>;

let registryP: Promise<import("vscode-textmate").Registry> | null = null;
let reader: Reader = async () => null;
let injections: (scopeName: string) => string[] = () => [];

export function setGrammarReader(r: Reader, inj?: (scopeName: string) => string[]) {
  reader = r;
  if (inj) injections = inj;
}

async function registry() {
  if (!registryP) {
    registryP = (async () => {
      const [tm, onig] = await Promise.all([import("vscode-textmate"), import("vscode-oniguruma")]);
      const wasm: ArrayBuffer = await (await fetch(onigUrl)).arrayBuffer();
      await onig.loadWASM({ data: wasm });
      return new tm.Registry({
        onigLib: Promise.resolve({ createOnigScanner: (p: string[]) => new onig.OnigScanner(p), createOnigString: (s: string) => new onig.OnigString(s) }),
        getInjections: (scope) => injections(scope),
        loadGrammar: async (scope) => {
          const g = await reader(scope);
          return g ? tm.parseRawGrammar(g.content, g.path) : null;
        },
      });
    })();
  }
  return registryP;
}

/** Scope TextMate paling spesifik → nama token gaya lama CodeMirror (dipetakan ke tag highlight). */
export function styleFor(scopes: string[]): string | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const s = scopes[i];
    if (s.startsWith("comment")) return "comment";
    if (s.startsWith("string.regexp")) return "string-2";
    if (s.startsWith("string")) return "string";
    if (s.startsWith("constant.numeric")) return "number";
    if (s.startsWith("constant.language") || s.startsWith("constant.character")) return "atom";
    if (s.startsWith("constant")) return "atom";
    if (s.startsWith("keyword.operator")) return "operator";
    if (s.startsWith("keyword") || s.startsWith("storage")) return "keyword";
    if (s.startsWith("entity.name.function") || s.startsWith("support.function")) return "def";
    if (s.startsWith("entity.name.type") || s.startsWith("entity.name.class") || s.startsWith("support.type") || s.startsWith("support.class")) return "type";
    if (s.startsWith("entity.name.tag")) return "tag";
    if (s.startsWith("entity.other.attribute-name")) return "attribute";
    if (s.startsWith("variable.other.property") || s.startsWith("support.type.property-name") || s.startsWith("meta.object-literal.key")) return "property";
    if (s.startsWith("variable.language")) return "builtin";
    if (s.startsWith("variable")) return "variable";
    if (s.startsWith("markup.heading") || s.startsWith("entity.name.section")) return "header";
    if (s.startsWith("markup.underline.link")) return "link";
    if (s.startsWith("markup.bold")) return "strong";
    if (s.startsWith("markup.italic")) return "em";
    if (s.startsWith("invalid")) return "error";
    if (s.startsWith("punctuation")) {
      // Tanda pembuka/penutup komentar & string ("//", '"') ikut warna komentar/string-nya.
      const outer = scopes.slice(0, i).reverse().find((x) => x.startsWith("comment") || x.startsWith("string"));
      if (outer) return outer.startsWith("comment") ? "comment" : outer.startsWith("string.regexp") ? "string-2" : "string";
      return "bracket";
    }
    if (s.startsWith("entity.name")) return "def";
  }
  return null;
}

interface TmState {
  stack: StateStack;
  tokens: IToken[] | null;
  i: number;
}

function streamLanguage(name: string, grammar: IGrammar, initial: StateStack) {
  return StreamLanguage.define<TmState>({
    name,
    startState: () => ({ stack: initial, tokens: null, i: 0 }),
    copyState: (s) => ({ stack: s.stack, tokens: s.tokens, i: s.i }),
    blankLine: (s) => {
      s.stack = grammar.tokenizeLine("", s.stack).ruleStack;
      s.tokens = null;
    },
    token(stream, s) {
      if (stream.sol() || !s.tokens) {
        // Baris sangat panjang dilewati supaya editor tetap responsif.
        if (stream.string.length > 5000) {
          stream.skipToEnd();
          s.tokens = null;
          return null;
        }
        const r = grammar.tokenizeLine(stream.string, s.stack, 50);
        s.stack = r.ruleStack;
        s.tokens = r.tokens;
        s.i = 0;
      }
      const toks = s.tokens;
      while (s.i < toks.length && toks[s.i].endIndex <= stream.pos) s.i++;
      const t = toks[s.i];
      if (!t) {
        stream.skipToEnd();
        return null;
      }
      stream.pos = Math.max(t.endIndex, stream.pos + 1);
      s.i++;
      return styleFor(t.scopes);
    },
  });
}

export async function textmateLanguage(name: string, scopeName: string): Promise<Extension> {
  const reg = await registry();
  const grammar = await reg.loadGrammar(scopeName);
  if (!grammar) throw new Error(`Grammar ${scopeName} tidak bisa dimuat.`);
  const { INITIAL } = await import("vscode-textmate");
  return streamLanguage(name, grammar, INITIAL);
}
