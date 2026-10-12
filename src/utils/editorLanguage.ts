import { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";

export interface LanguageInfo {
  name: string;
  extension: Extension;
}

export function detectLanguage(filename: string): LanguageInfo {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return { name: "JavaScript", extension: javascript() };
    case "jsx":
      return { name: "JavaScript (JSX)", extension: javascript({ jsx: true }) };
    case "ts":
    case "mts":
    case "cts":
      return { name: "TypeScript", extension: javascript({ typescript: true }) };
    case "tsx":
      return { name: "TypeScript (TSX)", extension: javascript({ jsx: true, typescript: true }) };
    case "json":
    case "jsonc":
      return { name: "JSON", extension: json() };
    case "html":
    case "htm":
      return { name: "HTML", extension: html() };
    case "css":
    case "scss":
    case "less":
      return { name: "CSS", extension: css() };
    case "md":
    case "markdown":
      return { name: "Markdown", extension: markdown() };
    case "py":
    case "pyw":
      return { name: "Python", extension: python() };
    case "rs":
      return { name: "Rust", extension: rust() };
    default:
      return { name: "Plain Text", extension: [] };
  }
}
