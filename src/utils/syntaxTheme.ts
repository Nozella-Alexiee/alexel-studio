import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Tokyo Night Rainbow & Hyper-Vibrant High-Contrast Syntax Highlighting
 * Tailored for high legibility and rich colors:
 * - Hot Pink: Keywords, HTML/JSX tags
 * - Yellow: Strings, regex, template literals
 * - Lime Green: Numbers, booleans, constants
 * - Electric Cyan: Functions, methods, properties
 * - Lavender / Violet: Types, interfaces, classes
 * - Coral Orange: Operators, punctuation
 * - Muted Teal: Comments
 */
export const tokyoRainbowHighlightStyle = HighlightStyle.define([
  // Keywords & Control Flow (Hot Pink / Magenta)
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "#ff007f", fontWeight: "700" },
  { tag: [t.tagName, t.angleBracket], color: "#f7768e", fontWeight: "600" },

  // Strings & Text (Vivid Golden Yellow)
  { tag: [t.string, t.special(t.string), t.character], color: "#ffc777" },
  { tag: t.regexp, color: "#ff9e64" },

  // Numbers, Booleans, Nulls (Lime Green / Neon Mint)
  { tag: [t.number, t.integer, t.float], color: "#9ece6a", fontWeight: "600" },
  { tag: [t.bool, t.null], color: "#73daca", fontWeight: "700" },

  // Functions, Methods, Calls (Electric Cyan / Sky Blue)
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7dcfff", fontWeight: "600" },
  { tag: t.attributeName, color: "#7dcfff" },

  // Types, Classes, Interfaces (Vibrant Lavender Violet)
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: "#bb9af7", fontWeight: "600" },

  // Variables & Identifiers (Ice Lilac / Crisp White)
  { tag: t.definition(t.variableName), color: "#ffffff", fontWeight: "600" },
  { tag: t.variableName, color: "#c0caf5" },
  { tag: t.propertyName, color: "#2ac3de" },

  // Operators, Punctuation (Coral Orange & Peach)
  { tag: [t.operator, t.operatorKeyword], color: "#ff9e64", fontWeight: "600" },
  { tag: [t.punctuation, t.separator], color: "#ff7a93" },
  { tag: [t.bracket, t.paren, t.brace], color: "#ffc777" },

  // Comments (Teal Slate Italic)
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#565f89", fontStyle: "italic" },

  // Markdown specific
  { tag: t.heading, color: "#ff007f", fontWeight: "700" },
  { tag: t.link, color: "#7aa2f7", textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic", color: "#e0af68" },
  { tag: t.strong, fontWeight: "700", color: "#ff007f" },
]);

/**
 * Light Theme High Contrast Syntax Highlighting
 */
export const tokyoLightHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "#d90429", fontWeight: "700" },
  { tag: [t.tagName, t.angleBracket], color: "#e11d48", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.character], color: "#d97706" },
  { tag: [t.number, t.integer, t.float], color: "#15803d", fontWeight: "600" },
  { tag: [t.bool, t.null], color: "#059669", fontWeight: "700" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#0284c7", fontWeight: "600" },
  { tag: t.attributeName, color: "#0284c7" },
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: "#7c3aed", fontWeight: "600" },
  { tag: t.definition(t.variableName), color: "#0f172a", fontWeight: "600" },
  { tag: t.variableName, color: "#1e293b" },
  { tag: t.propertyName, color: "#0891b2" },
  { tag: [t.operator, t.operatorKeyword], color: "#ea580c", fontWeight: "600" },
  { tag: [t.punctuation, t.separator], color: "#f43f5e" },
  { tag: [t.bracket, t.paren, t.brace], color: "#b45309" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#64748b", fontStyle: "italic" },
]);

export function getSyntaxTheme(theme: "dark" | "light"): Extension {
  if (theme === "dark") {
    return [
      syntaxHighlighting(tokyoRainbowHighlightStyle),
      EditorView.theme({
        "&": {
          color: "#c0caf5",
          backgroundColor: "#161827",
        },
        ".cm-cursor": {
          borderLeftColor: "#ff007f",
          borderLeftWidth: "2px",
        },
        ".cm-selectionBackground, ::selection": {
          backgroundColor: "rgba(122, 162, 247, 0.35) !important",
        },
        ".cm-gutters": {
          backgroundColor: "#131422",
          color: "#565f89",
          borderRight: "1px solid rgba(122, 162, 247, 0.15)",
        },
        ".cm-activeLine": {
          backgroundColor: "rgba(122, 162, 247, 0.1) !important",
          borderLeft: "3px solid #ff007f",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "#17192a !important",
          color: "#ffc777 !important",
          fontWeight: "700",
        },
      }),
    ];
  }

  return [
    syntaxHighlighting(tokyoLightHighlightStyle),
    EditorView.theme({
      "&": {
        color: "#1e293b",
        backgroundColor: "#ffffff",
      },
      ".cm-cursor": {
        borderLeftColor: "#d90429",
        borderLeftWidth: "2px",
      },
      ".cm-selectionBackground, ::selection": {
        backgroundColor: "rgba(14, 165, 233, 0.25) !important",
      },
      ".cm-gutters": {
        backgroundColor: "#f8fafc",
        color: "#64748b",
        borderRight: "1px solid rgba(14, 165, 233, 0.15)",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(14, 165, 233, 0.08) !important",
        borderLeft: "3px solid #d90429",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "#f1f5f9 !important",
        color: "#ea580c !important",
        fontWeight: "700",
      },
    }),
  ];
}
