import { describe, it, expect } from "vitest";
import { detectLanguage, enhancedPhpLanguage, enhancedPhp } from "./editorLanguage";
import { appleStudioHighlightStyle, appleLightHighlightStyle } from "./syntaxTheme";
import { tags as t, highlightTree } from "@lezer/highlight";

describe("PHP Syntax Highlighting and Token Styles", () => {
  it("detects PHP language with active CodeMirror LanguageSupport extension", () => {
    const lang = detectLanguage("app.php");
    expect(lang.name).toBe("PHP");
    expect(lang.extension).toBeDefined();
    expect(enhancedPhpLanguage).toBeDefined();

    const phtml = detectLanguage("template.phtml");
    expect(phtml.name).toBe("PHP");
  });

  it("provides comprehensive dark theme highlight coverage for all PHP syntax tags", () => {
    // <?php, ?>, <?=
    expect(appleStudioHighlightStyle.style([t.processingInstruction])).toBeTruthy();

    // public, private, protected, static, readonly
    expect(appleStudioHighlightStyle.style([t.modifier])).toBeTruthy();

    // class, function, namespace, return, echo
    expect(appleStudioHighlightStyle.style([t.keyword])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.definitionKeyword])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.controlKeyword])).toBeTruthy();

    // $this, self, parent (both special(variableName) and special(propertyName))
    expect(appleStudioHighlightStyle.style([t.self])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.special(t.variableName)])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.special(t.propertyName)])).toBeTruthy();

    // $variable
    expect(appleStudioHighlightStyle.style([t.variableName])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.definition(t.variableName)])).toBeTruthy();

    // types, classes, interfaces
    expect(appleStudioHighlightStyle.style([t.typeName])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.className])).toBeTruthy();

    // namespaces & use statements
    expect(appleStudioHighlightStyle.style([t.namespace])).toBeTruthy();

    // constants
    expect(appleStudioHighlightStyle.style([t.constant(t.variableName)])).toBeTruthy();

    // attributes & annotations (PHP 8 #[Route])
    expect(appleStudioHighlightStyle.style([t.annotation])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.attributeName])).toBeTruthy();

    // object properties ($this->serviceName)
    expect(appleStudioHighlightStyle.style([t.propertyName])).toBeTruthy();

    // strings & numbers
    expect(appleStudioHighlightStyle.style([t.string])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.special(t.string)])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.number])).toBeTruthy();

    // operators (=, ->, =>, +, ?, ?->)
    expect(appleStudioHighlightStyle.style([t.operator])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.derefOperator])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.definitionOperator])).toBeTruthy();

    // comments
    expect(appleStudioHighlightStyle.style([t.comment])).toBeTruthy();
    expect(appleStudioHighlightStyle.style([t.lineComment])).toBeTruthy();
  });

  it("provides comprehensive light theme highlight coverage for PHP tokens", () => {
    expect(appleLightHighlightStyle.style([t.processingInstruction])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.modifier])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.self])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.special(t.propertyName)])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.variableName])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.definition(t.variableName)])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.propertyName])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.namespace])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.constant(t.variableName)])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.annotation])).toBeTruthy();
    expect(appleLightHighlightStyle.style([t.definitionOperator])).toBeTruthy();
  });

  it("ensures property names do NOT fall back to plain default text color", () => {
    // In dark theme, default plain text is #e2e8f0. Property names MUST be vibrant (e.g. #c4b5fd).
    const propStyleDark = appleStudioHighlightStyle.style([t.propertyName]);
    expect(propStyleDark).toBeTruthy();
    expect(propStyleDark).not.toContain("color: #e2e8f0");

    // $this must be Orchid/Lilac, NOT dull gray or plain text
    const thisStyleDark = appleStudioHighlightStyle.style([t.special(t.propertyName)]);
    expect(thisStyleDark).toBeTruthy();
    expect(thisStyleDark).not.toContain("color: #e2e8f0");
  });

  it("parses and highlights rich PHP 8.3 code including readonly, attributes, heredoc, and rocket operators", () => {
    const phpCode = `<?php
declare(strict_types=1);

namespace App\\Services;

use Exception;
use DateTimeImmutable;

#[Route(path: "/api/test", methods: ["GET"])]
class ApiHandler extends BaseHandler implements Testable {
    public const MAX_RETRIES = 3;
    public readonly DateTimeImmutable $bootTime;
    private string $serviceName;

    public function __construct(string $serviceName) {
        $this->serviceName = $serviceName;
        $this->bootTime = new DateTimeImmutable();
        self::$count++;
    }

    public function run(): array {
        $status = $this->serviceName ? "active" : "standby";
        $data = ["status" => $status, "code" => 200];
        $template = <<<HTML
        <div>\${this->serviceName}</div>
HTML;
        return $data;
    }
}

echo "API initialized";
?>
<div class="result"><?= $status ?></div>`;

    const langSupport = enhancedPhp();
    const tree = langSupport.language.parser.parse(phpCode);
    expect(tree).toBeDefined();

    const highlightedTokens: { text: string; classes: string }[] = [];
    highlightTree(tree, appleStudioHighlightStyle, (from, to, classes) => {
      highlightedTokens.push({ text: phpCode.slice(from, to), classes });
    });

    const tokenMap = new Map<string, string[]>();
    for (const token of highlightedTokens) {
      if (!tokenMap.has(token.text)) {
        tokenMap.set(token.text, []);
      }
      tokenMap.get(token.text)!.push(token.classes);
    }

    // 1. PHP Open tag
    expect(tokenMap.has("<?php")).toBe(true);

    // 2. Modifiers: readonly, public, private
    expect(tokenMap.has("readonly")).toBe(true);
    expect(tokenMap.has("public")).toBe(true);
    expect(tokenMap.has("private")).toBe(true);

    // 3. Class inheritance and instantiation
    expect(tokenMap.has("BaseHandler")).toBe(true);
    expect(tokenMap.has("Testable")).toBe(true);
    expect(tokenMap.has("DateTimeImmutable")).toBe(true);

    // 4. Attributes (PHP 8 #[Route])
    expect(tokenMap.has("Route")).toBe(true);

    // 5. Constants (MAX_RETRIES)
    expect(tokenMap.has("MAX_RETRIES")).toBe(true);

    // 6. $this and object properties (serviceName)
    expect(tokenMap.has("$this")).toBe(true);
    expect(tokenMap.has("serviceName")).toBe(true);

    // 7. Scoped references (self)
    expect(tokenMap.has("self")).toBe(true);

    // 8. Rocket operator (=>)
    expect(tokenMap.has("=>")).toBe(true);

    // 9. Heredoc string template (<<<HTML)
    const hasHeredoc = highlightedTokens.some((t) => t.text.includes("<<<HTML"));
    expect(hasHeredoc).toBe(true);

    // 10. Embedded HTML tags and attributes
    expect(tokenMap.has("div")).toBe(true);
    expect(tokenMap.has("class")).toBe(true);
    expect(tokenMap.has("<?=")).toBe(true);
  });
});
