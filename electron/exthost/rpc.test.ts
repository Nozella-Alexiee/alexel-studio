import { describe, expect, it } from "vitest";
import { Rpc, type Msg } from "./rpc";

describe("rpc", () => {
  it("hasil yang gagal dikirim dibalas sebagai galat, bukan unhandled rejection", async () => {
    const sent: Msg[] = [];
    const rpc = new Rpc((m) => {
      // Seperti child.send dengan serialization "advanced": fungsi tidak bisa di-clone.
      if (m.r !== undefined && typeof (m.r as { f?: unknown }).f === "function") throw new Error("could not be cloned");
      sent.push(m);
    });
    rpc.requests.set("x", () => ({ f: () => 1 }));
    const unhandled: unknown[] = [];
    const on = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", on);
    rpc.receive({ t: "req", id: 7, m: "x" });
    await new Promise((r) => setTimeout(r, 20));
    process.off("unhandledRejection", on);
    expect(unhandled).toEqual([]);
    expect(sent).toEqual([{ t: "res", id: 7, e: expect.stringMatching(/tidak bisa dikirim/) }]);
  });
});
