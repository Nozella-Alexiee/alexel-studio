import { Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { Extension, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

/**
 * Pure Diagnostic Computation Function
 * Computes syntax diagnostics in real time:
 * - Lezer AST Syntax Error Nodes (node.type.isError || node.name === "⚠")
 * - Exact JSON parser errors with byte/char offset
 * - Multi-language bracket matching and string literal checks
 * - HTML/XML tag matching and void tag handling
 */
export function computeDiagnostics(
  filename: string,
  doc: string,
  state?: EditorState
): Diagnostic[] {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const diagnostics: Diagnostic[] = [];

  if (!doc.trim()) {
    return [];
  }

  const seenPositions = new Set<number>();

  // 1. Universal Lezer AST Parser Error Node Detection
  if (state) {
    try {
      const tree = syntaxTree(state);
      tree.iterate({
        enter(node) {
          if (node.type.isError || node.name === "⚠") {
            let from = Math.max(0, Math.min(node.from, doc.length));
            let to = Math.max(from + 1, Math.min(node.to, doc.length));
            if (to > doc.length) {
              from = Math.max(0, doc.length - 1);
              to = doc.length;
            }

            if (seenPositions.has(from)) return;
            seenPositions.add(from);

            const snippet = doc.slice(from, Math.min(to + 12, doc.length)).trim();
            const lineObj = state.doc.lineAt(from);
            const tokenSnippet = snippet.length > 25 ? snippet.slice(0, 22) + "..." : snippet;

            diagnostics.push({
              from,
              to,
              severity: "error",
              message: tokenSnippet
                ? `Syntax error near '${tokenSnippet}'`
                : `Syntax error: Unexpected token on line ${lineObj.number}`,
              source: "Syntax Engine",
            });
          }
        },
      });
    } catch (err) {
      console.warn("Syntax tree iteration error:", err);
    }
  }

  // 2. JSON Exact Syntax Linting
  if (ext === "json" || ext === "jsonc") {
    try {
      JSON.parse(doc);
    } catch (err: any) {
      const msg = err.message || "Invalid JSON syntax";
      const posMatch = msg.match(/position\s+(\d+)/i);
      let from = 0;
      let to = Math.min(doc.length, 1);

      if (posMatch && posMatch[1]) {
        const pos = parseInt(posMatch[1], 10);
        from = Math.max(0, Math.min(pos - 1, doc.length - 1));
        to = Math.min(from + 2, doc.length);
      } else if (msg.includes("...")) {
        const dotIdx = msg.indexOf("...");
        const rest = msg.slice(dotIdx + 3);
        const endIdx = rest.lastIndexOf('" is not valid JSON');
        const snippet = endIdx !== -1 ? rest.slice(0, endIdx) : rest.slice(0, 15);
        const idx = doc.indexOf(snippet);
        if (idx !== -1) {
          from = idx;
          to = Math.min(from + Math.max(snippet.length, 1), doc.length);
        }
      }

      if (!seenPositions.has(from)) {
        seenPositions.add(from);
        diagnostics.push({
          from,
          to,
          severity: "error",
          message: `JSON Error: ${msg}`,
          source: "JSON Linter",
        });
      }
    }
  }

  // 3. Multi-Language Bracket & Quote Matching
  const codeExts = [
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "c", "h", "cpp", "hpp", "cc", "cxx",
    "java", "cs", "go", "rs", "py", "php", "phtml",
    "rb", "kt", "kts", "swift", "dart", "lua",
    "sh", "bash", "zsh", "sql", "css", "scss", "less",
    "toml"
  ];

  if (codeExts.includes(ext)) {
    const stack: { char: string; pos: number; line: number }[] = [];
    const lines = doc.split("\n");
    let currentPos = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const trimmed = line.trim();

      // Skip full line comments
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("--")
      ) {
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
            if (!seenPositions.has(charPos)) {
              seenPositions.add(charPos);
              diagnostics.push({
                from: charPos,
                to: charPos + 1,
                severity: "error",
                message: `Unexpected closing bracket '${char}' with no matching opening bracket`,
                source: "Bracket Linter",
              });
            }
          } else {
            const last = stack.pop()!;
            if (last.char !== expected) {
              if (!seenPositions.has(charPos)) {
                seenPositions.add(charPos);
                diagnostics.push({
                  from: charPos,
                  to: charPos + 1,
                  severity: "error",
                  message: `Mismatched bracket: expected '${char === "}" ? "{" : char === ")" ? "(" : "["}' but found '${last.char}'`,
                  source: "Bracket Linter",
                });
              }
            }
          }
        }
      }

      // Check unclosed string on same line
      if (inString && (stringChar === '"' || stringChar === "'")) {
        if (!seenPositions.has(currentPos)) {
          seenPositions.add(currentPos);
          diagnostics.push({
            from: currentPos,
            to: Math.min(currentPos + line.length, doc.length),
            severity: "error",
            message: `Unclosed string literal (${stringChar}) on line ${lineIdx + 1}`,
            source: "Syntax Linter",
          });
        }
      }

      currentPos += line.length + 1;
    }

    // Remaining unclosed brackets in stack
    for (const unclosed of stack) {
      if (!seenPositions.has(unclosed.pos)) {
        seenPositions.add(unclosed.pos);
        diagnostics.push({
          from: unclosed.pos,
          to: Math.min(unclosed.pos + 1, doc.length),
          severity: "error",
          message: `Unclosed '${unclosed.char}' opened on line ${unclosed.line}`,
          source: "Bracket Linter",
        });
      }
    }
  }

  // 4. HTML / XML / SVG Tag Verification
  if (["html", "htm", "xml", "svg", "xsd", "xsl", "plist"].includes(ext)) {
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
          if (!seenPositions.has(pos)) {
            seenPositions.add(pos);
            diagnostics.push({
              from: pos,
              to: pos + fullTag.length,
              severity: "warning",
              message: `Closing tag </${tagName}> has no matching opening tag`,
              source: "HTML Linter",
            });
          }
        } else {
          const last = tagStack.pop()!;
          if (last.name !== tagName) {
            if (!seenPositions.has(pos)) {
              seenPositions.add(pos);
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
    }

    for (const unclosed of tagStack) {
      if (!seenPositions.has(unclosed.pos)) {
        seenPositions.add(unclosed.pos);
        diagnostics.push({
          from: unclosed.pos,
          to: Math.min(unclosed.pos + unclosed.name.length + 2, doc.length),
          severity: "warning",
          message: `Unclosed HTML tag <${unclosed.name}>`,
          source: "HTML Linter",
        });
      }
    }
  }

  diagnostics.sort((a, b) => a.from - b.from);
  return diagnostics;
}

/**
 * Intelligent Multi-Language Syntax Diagnostics & Error Tracker
 * Detects syntax issues in REAL TIME (50ms typing debounce, no Cmd+S required)
 */
export function createCodeLinter(
  filename: string,
  onDiagnosticsChange?: (diagnostics: Diagnostic[], view: EditorView) => void
): Extension[] {
  const lintExtension = linter(
    (view: EditorView) => {
      const doc = view.state.doc.toString();
      const diagnostics = computeDiagnostics(filename, doc, view.state);

      if (onDiagnosticsChange) {
        onDiagnosticsChange(diagnostics, view);
      }

      return diagnostics;
    },
    { delay: 50 } // Ultra-responsive 50ms real-time typing debounce
  );

  return [lintGutter(), lintExtension];
}
