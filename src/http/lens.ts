// "CodeLens" untuk berkas .http: tautan "Kirim request · cURL" di atas tiap request.

import { RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { tl } from "../i18n";
import { parseHttpFile, type ParsedRequest } from "./parse";

export interface LensHandlers {
  send: (req: ParsedRequest, vars: Record<string, string>) => void;
  curl: (req: ParsedRequest, vars: Record<string, string>) => void;
}

class LensWidget extends WidgetType {
  constructor(readonly index: number, readonly label: string, readonly h: LensHandlers) {
    super();
  }
  eq(o: LensWidget) {
    return o.index === this.index && o.label === this.label;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "http-lens";
    const mk = (text: string, fn: () => void, cls = "") => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `http-lens-btn ${cls}`;
      b.textContent = text;
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = (e) => {
        e.preventDefault();
        fn();
      };
      return b;
    };
    const run = (fn: LensHandlers["send"]) => () => {
      const { vars, requests } = parseHttpFile(view.state.doc.toString());
      const r = requests[this.index];
      if (r) fn(r, vars);
    };
    el.append(mk(`▶ ${tl("Kirim request")}`, run(this.h.send), "is-send"), mk("cURL", run(this.h.curl)));
    if (this.label) {
      const s = document.createElement("span");
      s.className = "http-lens-name";
      s.textContent = this.label;
      el.append(s);
    }
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

function build(state: EditorState, h: LensHandlers): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const { requests } = parseHttpFile(state.doc.toString());
  for (const r of requests) {
    if (r.line > state.doc.lines) continue;
    const pos = state.doc.line(r.line).from;
    b.add(pos, pos, Decoration.widget({ widget: new LensWidget(r.index, r.name ? `@${r.name}` : "", h), block: true, side: -1 }));
  }
  return b.finish();
}

export function httpLens(h: LensHandlers): Extension {
  return StateField.define<DecorationSet>({
    create: (s) => build(s, h),
    update: (deco, tr) => (tr.docChanged ? build(tr.state, h) : deco),
    provide: (f) => EditorView.decorations.from(f),
  });
}

/** Request di posisi kursor. */
export function requestAt(text: string, pos: number): { req: ParsedRequest; vars: Record<string, string> } | null {
  const { vars, requests } = parseHttpFile(text);
  const req = requests.find((r) => pos >= r.from && pos <= r.to) ?? null;
  return req ? { req, vars } : null;
}
