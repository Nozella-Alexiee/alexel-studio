// Tema editor berbasis variabel CSS. Warna diambil dari --syn-* dan --ed-*
// yang didefinisikan per desain di tokens.css, jadi ganti desain = warna editor
// ikut berubah tanpa membangun ulang editor.

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

export const nozelHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.operatorKeyword], color: "var(--syn-keyword)" },
  { tag: [t.processingInstruction, t.tagName, t.angleBracket], color: "var(--syn-tag)" },
  { tag: [t.self, t.special(t.variableName)], color: "var(--syn-self)", fontStyle: "italic" },
  { tag: [t.string, t.special(t.string), t.character, t.attributeValue, t.docString], color: "var(--syn-string)" },
  { tag: [t.regexp, t.escape], color: "var(--syn-regexp)" },
  { tag: [t.number, t.integer, t.float], color: "var(--syn-number)" },
  { tag: [t.bool, t.null, t.atom, t.unit], color: "var(--syn-atom)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName)), t.macroName], color: "var(--syn-function)" },
  { tag: [t.annotation, t.attributeName, t.meta], color: "var(--syn-attr)" },
  { tag: [t.typeName, t.className, t.standard(t.typeName), t.definition(t.typeName)], color: "var(--syn-type)" },
  { tag: t.namespace, color: "var(--syn-namespace)" },
  { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: "var(--syn-constant)" },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: "var(--syn-definition)" },
  { tag: t.variableName, color: "var(--syn-variable)" },
  { tag: [t.propertyName, t.labelName], color: "var(--syn-property)" },
  { tag: [t.operator, t.derefOperator, t.definitionOperator, t.compareOperator, t.arithmeticOperator, t.logicOperator], color: "var(--syn-operator)" },
  { tag: [t.punctuation, t.separator, t.bracket, t.paren, t.brace, t.squareBracket], color: "var(--syn-punct)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: t.heading, color: "var(--syn-heading)", fontWeight: "600" },
  { tag: t.link, color: "var(--syn-link)", textDecoration: "underline" },
  { tag: t.url, color: "var(--syn-link)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.inserted], color: "var(--success)" },
  { tag: [t.deleted], color: "var(--danger)" },
  { tag: t.invalid, color: "var(--danger)" },
]);

export const nozelTheme = EditorView.theme({
  "&": { color: "var(--ed-fg)", backgroundColor: "var(--ed-bg)", height: "100%" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "var(--code-line-height)" },
  ".cm-content": { caretColor: "var(--accent)", padding: "var(--code-pad-y) 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--ed-selection)",
  },
  ".cm-activeLine": { backgroundColor: "var(--ed-active-line)" },
  ".cm-gutters": { backgroundColor: "var(--ed-gutter-bg)", color: "var(--ed-gutter-fg)", border: "none", paddingRight: "4px" },
  ".cm-activeLineGutter": { backgroundColor: "var(--ed-active-line)", color: "var(--accent)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 14px", minWidth: "36px" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--surface-3)", border: "none", color: "var(--fg-muted)", padding: "0 6px", borderRadius: "4px" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--ed-bracket)", outline: "none" },
  ".cm-selectionMatch": { backgroundColor: "var(--ed-match)" },
  ".cm-searchMatch": { backgroundColor: "var(--ed-match)", outline: "1px solid var(--accent-soft)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--accent-soft)" },
  ".cm-tooltip": { backgroundColor: "var(--surface-popover)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "var(--shadow-pop)" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--fg)" },
  ".cm-completionDetail": { color: "var(--fg-muted)", fontStyle: "normal", marginLeft: "8px" },
  ".cm-completionMatchedText": { color: "var(--accent)", textDecoration: "none", fontWeight: "600" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "var(--fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-panel.cm-search": { padding: "6px 10px", fontFamily: "var(--font-ui)" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": { fontFamily: "var(--font-ui)" },
  ".cm-textfield": { backgroundColor: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--fg)", padding: "3px 8px" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--fg)" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--danger)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--warning)" },
  ".cm-lintRange-error": { backgroundImage: "var(--wavy-danger)" },
  ".cm-lintRange-warning": { backgroundImage: "var(--wavy-warning)" },
});

export const nozelEditorTheme = [nozelTheme, syntaxHighlighting(nozelHighlight)];
