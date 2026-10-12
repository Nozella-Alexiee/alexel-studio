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
  // Keywords & Control Flow & Modifiers (Apple Rose / Magenta)
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier], color: "#ff7ab2", fontWeight: "600" },
  { tag: [t.processingInstruction, t.tagName, t.angleBracket], color: "#ec4899", fontWeight: "700" },

  // Self & Special References ($this, self, parent) (Apple Orchid / Lilac)
  { tag: [t.self, t.special(t.variableName), t.special(t.propertyName)], color: "#c084fc", fontWeight: "600" },

  // Strings (Apple Coral Melon)
  { tag: [t.string, t.special(t.string), t.character, t.attributeValue], color: "#ff8170" },
  { tag: t.regexp, color: "#f97316" },

  // Numbers, Booleans, Atoms (Apple Mint & Soft Gold)
  { tag: [t.number, t.integer, t.float], color: "#d9c97c", fontWeight: "600" },
  { tag: [t.bool, t.null, t.atom], color: "#78c2b4", fontWeight: "700" },

  // Functions, Methods, Calls (Apple Sky Blue & Teal)
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#66c2cd", fontWeight: "600" },
  { tag: [t.annotation, t.attributeName], color: "#f472b6", fontWeight: "600" },

  // Types, Classes, Interfaces (Apple Warm Wheat / Lilac)
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: "#daba8b", fontWeight: "600" },

  // Namespaces (Apple Mint Teal)
  { tag: t.namespace, color: "#5eead4", fontWeight: "600" },

  // Constants (Apple Amber Gold)
  { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: "#fbbf24", fontWeight: "600" },

  // Variables & Identifiers (Apple Sky Azure)
  { tag: t.definition(t.variableName), color: "#38bdf8", fontWeight: "600" },
  { tag: t.variableName, color: "#7dd3fc" },

  // Properties & Object Fields (Apple Soft Lavender Periwinkle)
  { tag: t.propertyName, color: "#c4b5fd" },

  // Operators, Punctuation (Apple Peach)
  { tag: [t.operator, t.operatorKeyword, t.derefOperator, t.definitionOperator], color: "#ff9e64" },
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
  // Keywords & Control Flow & Modifiers (Apple Magenta / Plum)
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier], color: "#ad3da4", fontWeight: "600" },
  { tag: [t.processingInstruction, t.tagName, t.angleBracket], color: "#ad3da4", fontWeight: "700" },

  // Self & Special References ($this, self, parent) (Royal Purple)
  { tag: [t.self, t.special(t.variableName), t.special(t.propertyName)], color: "#7c3aed", fontWeight: "600" },

  // Strings (Apple Crimson / Ruby)
  { tag: [t.string, t.special(t.string), t.character, t.attributeValue], color: "#c41a16" },
  { tag: t.regexp, color: "#c2410c" },

  // Numbers, Booleans, Atoms (Royal Cobalt & Emerald)
  { tag: [t.number, t.integer, t.float], color: "#1c00cf", fontWeight: "600" },
  { tag: [t.bool, t.null, t.atom], color: "#059669", fontWeight: "700" },

  // Functions, Methods, Calls (Deep Teal)
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#0f766e", fontWeight: "600" },
  { tag: [t.annotation, t.attributeName], color: "#db2777", fontWeight: "600" },

  // Types, Classes, Interfaces (Deep Purple)
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: "#703daa", fontWeight: "600" },

  // Namespaces (Teal Cyan)
  { tag: t.namespace, color: "#0d9488", fontWeight: "600" },

  // Constants (Deep Amber)
  { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: "#b45309", fontWeight: "600" },

  // Variables & Identifiers (Apple Ocean Blue)
  { tag: t.definition(t.variableName), color: "#0284c7", fontWeight: "600" },
  { tag: t.variableName, color: "#0369a1" },

  // Properties & Object Fields (Vibrant Indigo)
  { tag: t.propertyName, color: "#4f46e5" },

  // Operators, Punctuation (Apple Tangerine & Slate)
  { tag: [t.operator, t.operatorKeyword, t.derefOperator, t.definitionOperator], color: "#ea580c" },
  { tag: [t.punctuation, t.separator], color: "#64748b" },
  { tag: [t.bracket, t.paren, t.brace], color: "#703daa" },

  // Comments (Slate Muted)
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#5c6570", fontStyle: "italic" },
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
