import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Apple Studio Pro (macOS Sequoia & Xcode Dark) Syntax Highlighting
 * Carefully calibrated for maximum legibility, high contrast, and zero eye strain:
 * - Rose/Magenta: Keywords, tags
 * - Coral/Melon: Strings, template literals
 * - Sky Blue / Teal: Functions, methods
 * - Warm Gold / Lilac: Types, interfaces, classes
 * - Soft Gold / Mint: Numbers, booleans
 * - Silver / Slate: Variables, properties
 * - Muted Slate Italic: Comments
 */
export const appleStudioHighlightStyle = HighlightStyle.define([
  // Keywords & Control Flow (Apple Rose / Magenta)
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "#ff7ab2", fontWeight: "600" },
  { tag: [t.tagName, t.angleBracket], color: "#ff7ab2", fontWeight: "600" },

  // Strings (Apple Coral Melon)
  { tag: [t.string, t.special(t.string), t.character], color: "#ff8170" },
  { tag: t.regexp, color: "#f97316" },

  // Numbers, Booleans (Apple Mint & Soft Gold)
  { tag: [t.number, t.integer, t.float], color: "#d9c97c", fontWeight: "600" },
  { tag: [t.bool, t.null], color: "#78c2b4", fontWeight: "700" },

  // Functions, Methods, Calls (Apple Sky Blue & Teal)
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#66c2cd", fontWeight: "600" },
  { tag: t.attributeName, color: "#66c2cd" },

  // Types, Classes, Interfaces (Apple Warm Wheat / Lilac)
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: "#daba8b", fontWeight: "600" },

  // Variables & Identifiers (Apple Silver)
  { tag: t.definition(t.variableName), color: "#ffffff", fontWeight: "600" },
  { tag: t.variableName, color: "#e2e8f0" },
  { tag: t.propertyName, color: "#cbd5e1" },

  // Operators, Punctuation (Apple Peach)
  { tag: [t.operator, t.operatorKeyword], color: "#ff9e64" },
  { tag: [t.punctuation, t.separator], color: "#94a3b8" },
  { tag: [t.bracket, t.paren, t.brace], color: "#daba8b" },

  // Comments (Apple Slate Italic)
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#7f8c98", fontStyle: "italic" },

  // Markdown
  { tag: t.heading, color: "#ff7ab2", fontWeight: "700" },
  { tag: t.link, color: "#38bdf8", textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic", color: "#ff8170" },
  { tag: t.strong, fontWeight: "700", color: "#ffffff" },
]);

/**
 * Apple Studio Light High Contrast Syntax Highlighting
 */
export const appleLightHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "#ad3da4", fontWeight: "600" },
  { tag: [t.tagName, t.angleBracket], color: "#ad3da4", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.character], color: "#c41a16" },
  { tag: [t.number, t.integer, t.float], color: "#1c00cf", fontWeight: "600" },
  { tag: [t.bool, t.null], color: "#059669", fontWeight: "700" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#326d74", fontWeight: "600" },
  { tag: t.attributeName, color: "#326d74" },
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: "#703daa", fontWeight: "600" },
  { tag: t.definition(t.variableName), color: "#0f172a", fontWeight: "600" },
  { tag: t.variableName, color: "#1e293b" },
  { tag: t.propertyName, color: "#475569" },
  { tag: [t.operator, t.operatorKeyword], color: "#ea580c" },
  { tag: [t.punctuation, t.separator], color: "#64748b" },
  { tag: [t.bracket, t.paren, t.brace], color: "#703daa" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#5c6570", fontStyle: "italic" },
]);

export function getSyntaxTheme(theme: "dark" | "light"): Extension {
  if (theme === "dark") {
    return [
      syntaxHighlighting(appleStudioHighlightStyle),
      EditorView.theme({
        "&": {
          color: "#e2e8f0",
          backgroundColor: "#1a1c24",
        },
        ".cm-cursor": {
          borderLeftColor: "#38bdf8",
          borderLeftWidth: "2px",
        },
        ".cm-selectionBackground, ::selection": {
          backgroundColor: "rgba(56, 189, 248, 0.28) !important",
        },
        ".cm-gutters": {
          backgroundColor: "#16181e",
          color: "#64748b",
          borderRight: "1px solid rgba(255, 255, 255, 0.07)",
        },
        ".cm-activeLine": {
          backgroundColor: "rgba(255, 255, 255, 0.035) !important",
          borderLeft: "2.5px solid #38bdf8",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "#1a1c24 !important",
          color: "#38bdf8 !important",
          fontWeight: "600",
        },
      }),
    ];
  }

  return [
    syntaxHighlighting(appleLightHighlightStyle),
    EditorView.theme({
      "&": {
        color: "#1e293b",
        backgroundColor: "#ffffff",
      },
      ".cm-cursor": {
        borderLeftColor: "#0284c7",
        borderLeftWidth: "2px",
      },
      ".cm-selectionBackground, ::selection": {
        backgroundColor: "rgba(14, 165, 233, 0.22) !important",
      },
      ".cm-gutters": {
        backgroundColor: "#f8fafc",
        color: "#64748b",
        borderRight: "1px solid rgba(0, 0, 0, 0.08)",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(14, 165, 233, 0.06) !important",
        borderLeft: "2.5px solid #0284c7",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "#f1f5f9 !important",
        color: "#0284c7 !important",
        fontWeight: "600",
      },
    }),
  ];
}
