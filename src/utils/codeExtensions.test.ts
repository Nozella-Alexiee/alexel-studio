import { describe, it, expect } from "vitest";
import { createCodeLinter } from "./codeLinter";
import { createCodeAutocomplete } from "./codeAutocomplete";

describe("Code Extensions", () => {
  it("should create code linter for json files", () => {
    let capturedDiagnostics: any[] = [];
    const linterExt = createCodeLinter("package.json", (diagnostics) => {
      capturedDiagnostics = diagnostics;
    });
    expect(linterExt).toBeDefined();
    expect(capturedDiagnostics).toEqual([]);
  });

  it("should create code linter for tsx files", () => {
    const linterExt = createCodeLinter("App.tsx", () => {});
    expect(linterExt).toBeDefined();
  });

  it("should create autocomplete extension for python, rust, and php files", () => {
    const pyExt = createCodeAutocomplete("script.py");
    const rsExt = createCodeAutocomplete("main.rs");
    const phpExt = createCodeAutocomplete("server.php");
    expect(pyExt).toBeDefined();
    expect(rsExt).toBeDefined();
    expect(phpExt).toBeDefined();
  });
});
