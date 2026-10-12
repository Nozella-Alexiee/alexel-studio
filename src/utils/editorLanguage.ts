import { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { phpLanguage } from "@codemirror/lang-php";
import { parseMixed } from "@lezer/common";
import { LanguageSupport } from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";

export interface LanguageInfo {
  name: string;
  extension: Extension;
}

/**
 * Rich AST Style Tags for PHP 8+
 * Extends the upstream Lezer PHP parser with high-contrast styles for:
 * - readonly modifiers
 * - Heredoc / Nowdoc multi-line template strings
 * - Class inheritance ('extends BaseClass', 'implements Interface')
 * - Class instantiations ('new CustomClass()')
 * - Namespace declarations and use statements
 * - Class constants ('const MAX_ATTEMPTS = 5')
 * - PHP 8 attributes ('#[Route(...)]')
 * - Named arguments ('fn(path: ...)')
 * - Array & match rocket operators ('=>')
 */
export const phpEnhancedStyleTags = styleTags({
  "BaseClause/Name BaseClause/QualifiedName/...": t.className,
  "ClassInterfaceClause/Name ClassInterfaceClause/QualifiedName/...": t.className,
  "NewExpression/Name NewExpression/QualifiedName/...": t.className,
  "NamespaceUseDeclaration/Name NamespaceUseDeclaration/QualifiedName/...": t.namespace,
  "UseClause/Name UseClause/QualifiedName/...": t.namespace,
  "NamespaceDefinition/QualifiedName/...": t.namespace,
  "ScopedExpression/Name ScopedExpression/QualifiedName/...": t.className,
  "ConstDeclaration/VariableDeclarator/Name": t.constant(t.variableName),
  "Attribute/Name Attribute/QualifiedName/...": t.annotation,
  "NamedArgument/Name": t.propertyName,
  readonly: t.modifier,
  HeredocString: t.special(t.string),
  "=>": t.definitionOperator,
});

export const enhancedPhpLanguage = phpLanguage.configure({
  props: [phpEnhancedStyleTags],
});

export function enhancedPhp(config: { plain?: boolean } = {}): LanguageSupport {
  const htmlSupport = html({ matchClosingTags: false });
  const base = htmlSupport.language;
  return new LanguageSupport(
    phpLanguage.configure({
      wrap: config.plain
        ? undefined
        : parseMixed((node) => {
            if (!node.type.isTop) return null;
            return {
              parser: base.parser,
              overlay: (n) => n.name === "Text",
            };
          }),
      top: config.plain ? "Program" : "Template",
      props: [phpEnhancedStyleTags],
    }),
    config.plain ? [] : [htmlSupport.support]
  );
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
    case "php":
    case "phtml":
    case "php3":
    case "php4":
    case "php5":
    case "php7":
    case "phps":
      return { name: "PHP", extension: enhancedPhp() };
    default:
      return { name: "Plain Text", extension: [] };
  }
}
