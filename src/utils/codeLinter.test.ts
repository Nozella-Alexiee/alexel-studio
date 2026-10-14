import { describe, it, expect } from "vitest";
import { createCodeLinter, computeDiagnostics } from "./codeLinter";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { php } from "@codemirror/lang-php";

describe("codeLinter Real-time Diagnostics Engine", () => {
  it("should create linter extensions with lintGutter and linter", () => {
    const extensions = createCodeLinter("App.tsx");
    expect(extensions).toBeDefined();
    expect(Array.isArray(extensions)).toBe(true);
    expect(extensions.length).toBe(2);
  });

  it("should detect JSON syntax errors with exact position", () => {
    const badJson = '{\n  "name": "nozel",\n  "invalid": ,\n}';
    const diagnostics = computeDiagnostics("data.json", badJson);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("JSON Error");
    expect(diagnostics[0].from).toBeGreaterThan(0);
  });

  it("should detect Lezer AST syntax errors and unclosed brackets in JS/TS", () => {
    const badCode = "function calculate() {\n  const x = (1 + 2;\n  return x;\n}";
    const state = EditorState.create({
      doc: badCode,
      extensions: [javascript()],
    });

    const diagnostics = computeDiagnostics("index.ts", badCode, state);
    expect(diagnostics.length).toBeGreaterThan(0);
    const hasSyntaxOrBracket = diagnostics.some(
      (d) => d.message.includes("Unclosed") || d.message.includes("Syntax error")
    );
    expect(hasSyntaxOrBracket).toBe(true);
  });

  it("should detect unclosed quotes in PHP code", () => {
    const badPhp = '<?php\n$message = "Hello world;\necho $message;';
    const state = EditorState.create({
      doc: badPhp,
      extensions: [php()],
    });

    const diagnostics = computeDiagnostics("server.php", badPhp, state);
    expect(diagnostics.length).toBeGreaterThan(0);
    const hasQuoteOrSyntax = diagnostics.some(
      (d) => d.message.includes("Unclosed string") || d.message.includes("Syntax error")
    );
    expect(hasQuoteOrSyntax).toBe(true);
  });

  it("should detect HTML tag mismatches and unclosed tags", () => {
    const badHtml = "<div><p>Hello world</div></p>";
    const diagnostics = computeDiagnostics("index.html", badHtml);

    expect(diagnostics.length).toBeGreaterThan(0);
    const tagErr = diagnostics.find((d) => d.message.includes("Tag mismatch"));
    expect(tagErr).toBeDefined();
    expect(tagErr?.severity).toBe("error");
  });

  it("should report zero errors on clean code", () => {
    const cleanJson = '{"success": true, "code": 200}';
    const diagnostics = computeDiagnostics("clean.json", cleanJson);
    expect(diagnostics.length).toBe(0);
  });
});
