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

  it("detects PHP files with rich language support", () => {
    const php = detectLanguage("server.php");
    expect(php.name).toBe("PHP");
    expect(php.extension).toBeDefined();

    const phtml = detectLanguage("template.phtml");
    expect(phtml.name).toBe("PHP");
    expect(phtml.extension).toBeDefined();
  });

  it("detects C, C++, Java, Go, SQL, XML, and YAML files", () => {
    expect(detectLanguage("main.c").name).toBe("C");
    expect(detectLanguage("engine.cpp").name).toBe("C++");
    expect(detectLanguage("App.java").name).toBe("Java");
    expect(detectLanguage("server.go").name).toBe("Go");
    expect(detectLanguage("query.sql").name).toBe("SQL");
    expect(detectLanguage("config.xml").name).toBe("XML");
    expect(detectLanguage("docker-compose.yaml").name).toBe("YAML");
    expect(detectLanguage("deploy.yml").name).toBe("YAML");
    expect(detectLanguage("icon.svg").name).toBe("SVG (XML)");
  });

  it("detects universal languages via language registry (C#, Ruby, Shell, Kotlin, Swift, Dart, Lua, TOML, Dockerfile)", async () => {
    const cs = detectLanguage("Program.cs");
    expect(cs.name).toBe("C#");
    expect(cs.loadAsync).toBeDefined();

    const rb = detectLanguage("script.rb");
    expect(rb.name).toBe("Ruby");

    const sh = detectLanguage("deploy.sh");
    expect(sh.name).toBe("Shell / Bash");

    const kt = detectLanguage("Main.kt");
    expect(kt.name).toBe("Kotlin");

    const swift = detectLanguage("ContentView.swift");
    expect(swift.name).toBe("Swift");

    const dart = detectLanguage("main.dart");
    expect(dart.name).toBe("Dart");

    const lua = detectLanguage("init.lua");
    expect(lua.name).toBe("Lua");

    const toml = detectLanguage("Cargo.toml");
    expect(toml.name).toBe("TOML");

    const docker = detectLanguage("Dockerfile");
    expect(docker.name).toBe("Dockerfile");

    // Verify async language loader resolves
    const ext = await cs.loadAsync!();
    expect(ext).toBeDefined();
  });

  it("handles unknown or extensionless files gracefully", () => {
    const txt = detectLanguage("notes.txt");
    expect(txt.name).toBe("Plain Text");

    const dotfile = detectLanguage(".gitignore");
    expect(dotfile.name).toBe("Plain Text");
  });
});
