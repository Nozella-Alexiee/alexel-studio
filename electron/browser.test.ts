import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ BrowserWindow: class {}, WebContentsView: class {}, session: {} }));
const { normalizeUrl } = await import("./browser");

describe("browser", () => {
  it("menormalkan alamat", () => {
    expect(normalizeUrl("localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(normalizeUrl(":5173")).toBe("http://localhost:5173");
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("https://a.test")).toBe("https://a.test");
    expect(normalizeUrl("cara pakai docker")).toBe("https://duckduckgo.com/?q=cara%20pakai%20docker");
    expect(normalizeUrl("")).toBe("about:blank");
    expect(normalizeUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });
});
