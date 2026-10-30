// Drag minimap berakhir juga lewat pointercancel/lostpointercapture, dan galat perintah shortcut tidak hilang.
import { describe, expect, it, vi } from "vitest";

describe("trackPointerDrag (minimap)", () => {
  const ev = (type: string, clientY = 0) => Object.assign(new Event(type), { clientY });

  for (const end of ["pointerup", "pointercancel", "lostpointercapture"]) {
    it(`${end} mengakhiri drag dan melepas semua listener`, async () => {
      const { trackPointerDrag } = await import("../editor/minimap");
      const el = new EventTarget();
      const add = vi.spyOn(el, "addEventListener");
      const remove = vi.spyOn(el, "removeEventListener");
      const moves: number[] = [];
      trackPointerDrag(el, (e) => moves.push(e.clientY));
      el.dispatchEvent(ev("pointermove", 10));
      el.dispatchEvent(ev(end));
      el.dispatchEvent(ev("pointermove", 20));
      expect(moves).toEqual([10]);
      // Setiap listener yang dipasang dilepas lagi (tidak tertinggal).
      expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(add.mock.calls.map((c) => c[0]).sort());
      // Peristiwa akhir berikutnya tidak melepas dua kali.
      el.dispatchEvent(ev("pointerup"));
      expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
    });
  }

  it("fungsi kembalian mengakhiri drag secara manual", async () => {
    const { trackPointerDrag } = await import("../editor/minimap");
    const el = new EventTarget();
    const moves: number[] = [];
    const stop = trackPointerDrag(el, (e) => moves.push(e.clientY));
    stop();
    stop();
    el.dispatchEvent(ev("pointermove", 5));
    expect(moves).toEqual([]);
  });
});

describe("runCommandSafely (shortcut global)", () => {
  const lastToast = async () => {
    const { getState } = await import("../state/store");
    const list = getState().toasts;
    return list[list.length - 1];
  };

  it("exception sinkron dicatat dan ditampilkan sebagai toast galat", async () => {
    const { runCommandSafely } = await import("../app/commands");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      runCommandSafely({
        id: "uji.sinkron",
        label: "Uji sinkron",
        run: () => {
          throw new Error("meledak");
        },
      })
    ).not.toThrow();
    const t = await lastToast();
    expect(t?.kind).toBe("error");
    expect(t?.text).toContain("Uji sinkron");
    expect(t?.text).toContain("meledak");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("promise yang ditolak juga ditangkap", async () => {
    const { runCommandSafely } = await import("../app/commands");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    runCommandSafely({ id: "uji.async", label: "Uji async", run: () => Promise.reject(new Error("gagal jaringan")) });
    await new Promise((r) => setTimeout(r, 0));
    const t = await lastToast();
    expect(t?.kind).toBe("error");
    expect(t?.text).toContain("gagal jaringan");
    err.mockRestore();
  });

  it("perintah yang berhasil tidak memunculkan toast", async () => {
    const { runCommandSafely } = await import("../app/commands");
    const { getState } = await import("../state/store");
    const before = getState().toasts.length;
    const run = vi.fn();
    runCommandSafely({ id: "uji.ok", label: "Uji ok", run });
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(getState().toasts.length).toBe(before);
  });
});
