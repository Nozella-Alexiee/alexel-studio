import { describe, it, expect } from "vitest";
import { detectLanguage } from "./editorLanguage";

describe("detectLanguage", () => {
  it("detects TypeScript and TSX files", () => {
    const ts = detectLanguage("app.ts");
    expect(ts.name).toBe("TypeScript");
    expect(ts.extension).toBeDefined();

    const tsx = detectLanguage("Component.tsx");
    expect(tsx.name).toBe("TypeScript (TSX)");
    expect(tsx.extension).toBeDefined();
  });

  it("detects JavaScript and JSX files", () => {
    const js = detectLanguage("index.js");
    expect(js.name).toBe("JavaScript");

    const jsx = detectLanguage("View.jsx");
    expect(jsx.name).toBe("JavaScript (JSX)");
  });

  it("detects JSON, HTML, CSS, Markdown", () => {
    expect(detectLanguage("data.json").name).toBe("JSON");
    expect(detectLanguage("page.html").name).toBe("HTML");
    expect(detectLanguage("styles.css").name).toBe("CSS");
    expect(detectLanguage("README.md").name).toBe("Markdown");
  });

  it("detects Python and Rust files", () => {
    expect(detectLanguage("script.py").name).toBe("Python");
    expect(detectLanguage("main.rs").name).toBe("Rust");
  });

  it("handles unknown or extensionless files gracefully", () => {
    const txt = detectLanguage("notes.txt");
    expect(txt.name).toBe("Plain Text");

    const dotfile = detectLanguage(".gitignore");
    expect(dotfile.name).toBe("Plain Text");
  });
});
