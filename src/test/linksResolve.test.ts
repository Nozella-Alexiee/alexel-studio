import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = new Set<string>();
const ipc = vi.hoisted(() => ({ pathKinds: vi.fn(), appInfo: vi.fn() }));
vi.mock("../lib/ipc", () => ({ api: ipc, isWindows: false }));
vi.mock("../state/store", () => ({ getState: () => ({ root: "/proj" }) }));

const { candidates, resolveLocation } = await import("../terminal/links");

beforeEach(() => {
  files.clear();
  ipc.pathKinds.mockImplementation(async (list: string[]) => list.map((p) => (files.has(p) ? "file" : null)));
  ipc.appInfo.mockResolvedValue({ version: "1.0.0", electron: "", platform: "darwin", home: "/Users/me" });
});
afterEach(() => vi.useRealTimers());

describe("resolve tautan lokasi terminal", () => {
  it("berkas yang dibuat belakangan menjadi tautan setelah hasil negatif kedaluwarsa", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    expect(await resolveLocation("out/late.log", "/proj")).toBeNull();
    files.add("/proj/out/late.log");
    // Masih dalam masa berlaku singkat: tidak menanyai main process lagi.
    const calls = ipc.pathKinds.mock.calls.length;
    expect(await resolveLocation("out/late.log", "/proj")).toBeNull();
    expect(ipc.pathKinds.mock.calls.length).toBe(calls);
    vi.advanceTimersByTime(2500);
    expect(await resolveLocation("out/late.log", "/proj")).toBe("/proj/out/late.log");
  });

  it("hasil positif tetap di-cache", async () => {
    files.add("/proj/src/a.ts");
    expect(await resolveLocation("src/a.ts", "/proj")).toBe("/proj/src/a.ts");
    const calls = ipc.pathKinds.mock.calls.length;
    expect(await resolveLocation("src/a.ts", "/proj")).toBe("/proj/src/a.ts");
    expect(ipc.pathKinds.mock.calls.length).toBe(calls);
  });

  it("~/… diekspansi memakai folder home dari main process", async () => {
    files.add("/Users/me/notes/todo.md");
    expect(await resolveLocation("~/notes/todo.md", "/proj")).toBe("/Users/me/notes/todo.md");
    expect(ipc.pathKinds).toHaveBeenLastCalledWith(["/Users/me/notes/todo.md"]);
  });
});

describe("candidates dengan ~", () => {
  it("memakai home; tanpa home tidak ada kandidat (bukan path relatif ./~/…)", () => {
    expect(candidates("~/a/b.ts", "/c", "/r", "/home/u")).toEqual(["/home/u/a/b.ts"]);
    expect(candidates("~\\a\\b.ts", "/c", "/r", "C:\\Users\\u")).toEqual(["C:/Users/u/a/b.ts"]);
    expect(candidates("~/a/b.ts", "/c", "/r")).toEqual([]);
    expect(candidates("~x/b.ts", "/c", "/r", "/home/u")).toEqual(["/c/~x/b.ts", "/r/~x/b.ts"]);
  });
});
