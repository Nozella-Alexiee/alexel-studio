import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "./util";

// watcher.ts memuat @parcel/watcher lewat require(); tanam modul palsu di cache require Node
// supaya tes bisa menahan subscribe() dan memicu event sendiri.
type Cb = (err: Error | null, events: { path: string; type: string }[]) => void;
interface Pending {
  dir: string;
  cb: Cb;
  resolve: () => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}
const pending: Pending[] = [];
const fake = {
  subscribe: vi.fn(
    (dir: string, cb: Cb) =>
      new Promise((res) => {
        const unsubscribe = vi.fn(async () => {});
        pending.push({ dir, cb, unsubscribe, resolve: () => res({ unsubscribe }) });
      })
  ),
};
const req = createRequire(import.meta.url);
const id = req.resolve("@parcel/watcher");
req.cache[id] = { id, filename: id, loaded: true, exports: fake } as unknown as NodeJS.Module;

const { watchProject, unwatch } = await import("./watcher");

const ctx = () => {
  const emit = vi.fn();
  return { ctx: { userData: "", emit, trash: async () => {}, reveal: () => {} } as Ctx, emit };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(async () => {
  await unwatch();
  pending.length = 0;
  fake.subscribe.mockClear();
  vi.useRealTimers();
});

describe("watchProject / unwatch", () => {
  it("subscribe yang selesai setelah unwatch langsung di-unsubscribe dan tidak memancarkan fs-changed", async () => {
    vi.useFakeTimers();
    const { ctx: c, emit } = ctx();
    const run = watchProject(c, "/proj", 100);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    // Tab/folder ditutup saat subscribe masih berjalan.
    await unwatch();
    pending[0].resolve();
    await run;
    expect(pending[0].unsubscribe).toHaveBeenCalledTimes(1);
    // Event yang masih datang dari langganan basi diabaikan.
    pending[0].cb(null, [{ path: "/proj/a.ts", type: "update" }]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(emit).not.toHaveBeenCalled();
  });

  it("langganan aktif memancarkan fs-changed; setelah unwatch dilepas dan diam", async () => {
    vi.useFakeTimers();
    const { ctx: c, emit } = ctx();
    const run = watchProject(c, "/proj", 100);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve();
    await run;
    expect(pending[0].unsubscribe).not.toHaveBeenCalled();
    pending[0].cb(null, [{ path: "/proj/a.ts", type: "update" }]);
    await vi.advanceTimersByTimeAsync(150);
    expect(emit).toHaveBeenCalledWith("fs-changed", { root: "/proj", paths: ["/proj/a.ts"], git: false });

    emit.mockClear();
    await unwatch();
    expect(pending[0].unsubscribe).toHaveBeenCalledTimes(1);
    pending[0].cb(null, [{ path: "/proj/b.ts", type: "update" }]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(emit).not.toHaveBeenCalled();
  });

  it("watchProject baru menggantikan yang masih berjalan; langganan lama dilepas", async () => {
    const { ctx: c } = ctx();
    const first = watchProject(c, "/a", 100);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const second = watchProject(c, "/b", 100);
    await tick();
    pending[0].resolve();
    await first;
    expect(pending[0].unsubscribe).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1].resolve();
    await second;
    expect(pending[1].dir).toBe("/b");
    expect(pending[1].unsubscribe).not.toHaveBeenCalled();
  });
});
