import { describe, it, expect } from "vitest";
import {
  listDirectory,
  readFileText,
  writeFileText,
  createFile,
  checkClaudeCli,
  getSystemFootprint,
} from "./tauriService";

describe("tauriService (mock / browser environment fallback)", () => {
  it("lists project directory items", async () => {
    const entries = await listDirectory("/Users/demo/nozel-project");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.name === "README.md")).toBe(true);
  });

  it("reads mock file text", async () => {
    const content = await readFileText("/Users/demo/nozel-project/README.md");
    expect(content).toContain("Nozel Code");
  });

  it("writes and reads back file content", async () => {
    const testPath = "/Users/demo/nozel-project/test.txt";
    await createFile(testPath);
    await writeFileText(testPath, "Hello M1 Silicon");
    const content = await readFileText(testPath);
    expect(content).toBe("Hello M1 Silicon");
  });

  it("returns claude CLI info and instructions", async () => {
    const info = await checkClaudeCli();
    expect(info.instructions).toContain("Claude Pro");
  });

  it("reports lightweight system footprint", async () => {
    const footprint = await getSystemFootprint();
    expect(footprint.app_memory_mb).toBeLessThan(100);
    expect(footprint.savings_percentage).toBeGreaterThan(50);
  });
});
