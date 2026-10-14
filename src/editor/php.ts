// PHP 8+ dengan highlight lebih kaya (readonly, heredoc, atribut, named argument,
// namespace) dan HTML di luar tag <?php ?>.

import { html } from "@codemirror/lang-html";
import { phpLanguage } from "@codemirror/lang-php";
import { LanguageSupport } from "@codemirror/language";
import { parseMixed } from "@lezer/common";
import { styleTags, tags as t } from "@lezer/highlight";

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

export function enhancedPhp(config: { plain?: boolean } = {}): LanguageSupport {
  const htmlSupport = html({ matchClosingTags: false });
  return new LanguageSupport(
    phpLanguage.configure({
      wrap: config.plain
        ? undefined
        : parseMixed((node) => (node.type.isTop ? { parser: htmlSupport.language.parser, overlay: (n) => n.name === "Text" } : null)),
      top: config.plain ? "Program" : "Template",
      props: [phpEnhancedStyleTags],
    }),
    config.plain ? [] : [htmlSupport.support]
  );
}
