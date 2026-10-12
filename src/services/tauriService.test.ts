import { describe, it, expect } from "vitest";
import {
  listDirectory,
  readFileText,
  writeFileText,
  createFile,
  checkClaudeCli,
  getSystemFootprint,
  isImageFile,
  readFileImage,
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

  it("detects image files correctly across formats", () => {
    expect(isImageFile("photo.png")).toBe(true);
    expect(isImageFile("avatar.jpg")).toBe(true);
    expect(isImageFile("hero.jpeg")).toBe(true);
    expect(isImageFile("anim.gif")).toBe(true);
    expect(isImageFile("vector.svg")).toBe(true);
    expect(isImageFile("modern.webp")).toBe(true);
    expect(isImageFile("favicon.ico")).toBe(true);
    expect(isImageFile("code.ts")).toBe(false);
    expect(isImageFile("doc.md")).toBe(false);
  });

  it("reads image file and returns valid data URL and size", async () => {
    const imgData = await readFileImage("/Users/demo/nozel-project/logo.png");
    expect(imgData.format).toBe("png");
    expect(imgData.data_url).toContain("data:image/svg+xml;base64,");
    expect(imgData.size_bytes).toBeGreaterThan(0);
  });
});
