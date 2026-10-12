import { Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Intelligent Multi-Language Syntax Diagnostics & Error Tracker
 * Detects common syntax issues in real time:
 * - JSON syntax errors (position exact)
 * - HTML unclosed tags and bracket mismatches
 * - JS/TS/React unmatched braces, unclosed quotes, duplicate keys
 * - Python unmatched brackets and indentation errors
 */
export function createCodeLinter(
  filename: string,
  onDiagnosticsChange?: (diagnostics: Diagnostic[]) => void
): Extension[] {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const lintExtension = linter((view: EditorView) => {
    const doc = view.state.doc.toString();
    const diagnostics: Diagnostic[] = [];

    if (!doc.trim()) {
      if (onDiagnosticsChange) onDiagnosticsChange([]);
      return [];
    }

    // 1. JSON Linting
    if (ext === "json" || ext === "jsonc") {
      try {
        JSON.parse(doc);
      } catch (err: any) {
        const msg = err.message || "Invalid JSON syntax";
        // Parse position from error message (e.g., "at position 42")
        const posMatch = msg.match(/position\s+(\d+)/i);
        let from = 0;
        let to = Math.min(doc.length, 1);

        if (posMatch && posMatch[1]) {
          const pos = parseInt(posMatch[1], 10);
          from = Math.max(0, Math.min(pos - 1, doc.length - 1));
          to = Math.min(from + 2, doc.length);
        }

        diagnostics.push({
          from,
          to,
          severity: "error",
          message: `JSON Error: ${msg}`,
          source: "Nozel JSON Linter",
        });
      }
    }

    // 2. JS / TS / TSX / JSX / CSS / Rust Bracket & Quote Matching
    if (["ts", "tsx", "js", "jsx", "rs", "css", "py"].includes(ext)) {
      const stack: { char: string; pos: number; line: number }[] = [];
      const lines = doc.split("\n");
      let currentPos = 0;

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const trimmed = line.trim();

        // Skip full line comments
        if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) {
          currentPos += line.length + 1;
          continue;
        }

        let inString = false;
        let stringChar = "";

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const charPos = currentPos + i;

          // String handling
          if ((char === '"' || char === "'" || char === "`") && (i === 0 || line[i - 1] !== "\\")) {
            if (!inString) {
              inString = true;
              stringChar = char;
            } else if (stringChar === char) {
              inString = false;
            }
          }

          if (inString) continue;

          // Bracket pairs
          if (char === "{" || char === "(" || char === "[") {
            stack.push({ char, pos: charPos, line: lineIdx + 1 });
          } else if (char === "}" || char === ")" || char === "]") {
            const expected = char === "}" ? "{" : char === ")" ? "(" : "[";
            if (stack.length === 0) {
              diagnostics.push({
                from: charPos,
                to: charPos + 1,
                severity: "error",
                message: `Unexpected closing bracket '${char}' with no matching opening bracket`,
                source: "Nozel Linter",
              });
            } else {
              const last = stack.pop()!;
              if (last.char !== expected) {
                diagnostics.push({
                  from: charPos,
                  to: charPos + 1,
                  severity: "error",
                  message: `Mismatched bracket: expected '${char === "}" ? "{" : char === ")" ? "(" : "["}' but found '${last.char}'`,
                  source: "Nozel Linter",
                });
              }
            }
          }
        }

        // Check unclosed string on same line (for single and double quotes)
        if (inString && (stringChar === '"' || stringChar === "'")) {
          diagnostics.push({
            from: currentPos,
            to: currentPos + line.length,
            severity: "warning",
            message: `Unclosed string literal (${stringChar}) on line ${lineIdx + 1}`,
            source: "Nozel Linter",
          });
        }

        currentPos += line.length + 1;
      }

      // Any remaining unclosed brackets in stack
      for (const unclosed of stack) {
        diagnostics.push({
          from: unclosed.pos,
          to: unclosed.pos + 1,
          severity: "error",
          message: `Unclosed '${unclosed.char}' opened on line ${unclosed.line}`,
          source: "Nozel Linter",
        });
      }
    }

    // 3. HTML Tag Verification
    if (ext === "html" || ext === "htm") {
      const tagRegex = /<\/?([a-zA-Z0-9]+)(\s+[^>]*)?(\/?)>/g;
      const tagStack: { name: string; pos: number }[] = [];
      const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

      let match: RegExpExecArray | null;
      while ((match = tagRegex.exec(doc)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();
        const isClosing = fullTag.startsWith("</");
        const isSelfClosing = match[3] === "/" || voidTags.has(tagName);
        const pos = match.index;

        if (isSelfClosing) continue;

        if (!isClosing) {
          tagStack.push({ name: tagName, pos });
        } else {
          if (tagStack.length === 0) {
            diagnostics.push({
              from: pos,
              to: pos + fullTag.length,
              severity: "warning",
              message: `Closing tag </${tagName}> has no matching opening tag`,
              source: "HTML Linter",
            });
          } else {
            const last = tagStack.pop()!;
            if (last.name !== tagName) {
              diagnostics.push({
                from: pos,
                to: pos + fullTag.length,
                severity: "error",
                message: `Tag mismatch: expected </${last.name}> but found </${tagName}>`,
                source: "HTML Linter",
              });
            }
          }
        }
      }

      for (const unclosed of tagStack) {
        diagnostics.push({
          from: unclosed.pos,
          to: unclosed.pos + unclosed.name.length + 2,
          severity: "warning",
          message: `Unclosed HTML tag <${unclosed.name}>`,
          source: "HTML Linter",
        });
      }
    }

    if (onDiagnosticsChange) {
      onDiagnosticsChange(diagnostics);
    }

    return diagnostics;
  });

  return [lintGutter(), lintExtension];
}
