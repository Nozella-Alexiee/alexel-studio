import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kernelSpecs } from "./jupyter";

describe("jupyter", () => {
  it.skipIf(process.platform === "win32")("jupyter yang tidak bisa dijalankan = galat jelas, bukan crash atau menunggu 60 detik", async () => {
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-jp-")));
    // Ada tapi tidak bisa dieksekusi → spawn memancarkan "error" (EACCES).
    const fake = path.join(dir, "jupyter");
    fs.writeFileSync(fake, "bukan program", { mode: 0o644 });
    const t0 = Date.now();
    const [a, b] = await Promise.allSettled([kernelSpecs(dir, fake), kernelSpecs(dir, fake)]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    expect(String((a as PromiseRejectedResult).reason)).toMatch(/tidak bisa dijalankan/);
    expect(Date.now() - t0).toBeLessThan(10_000);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
