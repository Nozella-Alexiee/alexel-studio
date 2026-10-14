import { describe, it, expect } from "vitest";
import { executeCodeRun, executeTerminalCommand } from "./tauriService";

describe("codeRunner Bridge Service", () => {
  it("executes HTML file and opens in default browser", async () => {
    const res = await executeCodeRun("/Users/demo/nozel-project/index.html");
    expect(res.success).toBe(true);
    expect(res.command).toBe('open "/Users/demo/nozel-project/index.html"');
    expect(res.stdout).toContain("Web Browser Preview");
    expect(res.stdout).toContain("index.html");
    expect(res.exit_code).toBe(0);
    expect(res.execution_time_ms).toBeGreaterThan(0);
  });

  it("executes CSS file by linking to index.html preview", async () => {
    const res = await executeCodeRun("/Users/demo/nozel-project/style.css");
    expect(res.success).toBe(true);
    expect(res.command).toContain("open");
    expect(res.stdout).toContain("index.html");
    expect(res.exit_code).toBe(0);
  });

  it("executes PHP file and returns formatted output", async () => {
    const res = await executeCodeRun("/Users/demo/nozel-project/src/server.php");
    expect(res.success).toBe(true);
    expect(res.command).toBe('php "/Users/demo/nozel-project/src/server.php"');
    expect(res.stdout).toContain("[Nozel Code]");
    expect(res.exit_code).toBe(0);
    expect(res.execution_time_ms).toBeGreaterThan(0);
  });

  it("executes Python file with python3", async () => {
    const res = await executeCodeRun("/Users/demo/nozel-project/src/analyze.py");
    expect(res.success).toBe(true);
    expect(res.command).toBe('python3 "/Users/demo/nozel-project/src/analyze.py"');
    expect(res.stdout).toContain("M1 Neural Engine");
    expect(res.exit_code).toBe(0);
  });

  it("executes Rust file with cargo run", async () => {
    const res = await executeCodeRun("/Users/demo/nozel-project/src/api.rs");
    expect(res.success).toBe(true);
    expect(res.command).toBe("cargo run");
    expect(res.stdout).toContain("Rust Engine");
    expect(res.exit_code).toBe(0);
  });

  it("executes JavaScript/TypeScript file with node", async () => {
    const resTs = await executeCodeRun("/Users/demo/nozel-project/src/services/index.tsx");
    expect(resTs.success).toBe(true);
    expect(resTs.command).toContain("node");
    expect(resTs.exit_code).toBe(0);

    const resJs = await executeCodeRun("/Users/demo/nozel-project/index.js");
    expect(resJs.success).toBe(true);
    expect(resJs.command).toContain("node");
  });

  it("executes Shell script with bash", async () => {
    const res = await executeCodeRun("/Users/demo/nozel-project/deploy.sh");
    expect(res.success).toBe(true);
    expect(res.command).toContain("bash");
    expect(res.exit_code).toBe(0);
  });

  it("executes generic file with fallback runner", async () => {
    const res = await executeCodeRun("/Users/demo/nozel-project/data.txt");
    expect(res.success).toBe(true);
    expect(res.command).toContain('run "/Users/demo/nozel-project/data.txt"');
    expect(res.exit_code).toBe(0);
  });

  it("executes terminal pwd command accurately", async () => {
    const res = await executeTerminalCommand("pwd", "/Users/demo/nozel-project");
    expect(res.success).toBe(true);
    expect(res.stdout.trim()).toBe("/Users/demo/nozel-project");
  });

  it("executes terminal echo command with quote stripping", async () => {
    const res = await executeTerminalCommand('echo "Hello Nozel"', "/Users/demo/nozel-project");
    expect(res.success).toBe(true);
    expect(res.stdout.trim()).toBe("Hello Nozel");
  });

  it("executes generic terminal commands successfully", async () => {
    const res = await executeTerminalCommand("whoami", "/Users/demo/nozel-project");
    expect(res.success).toBe(true);
    expect(res.command).toBe("whoami");
    expect(res.exit_code).toBe(0);
  });
});
