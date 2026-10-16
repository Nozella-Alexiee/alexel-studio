import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agyStatusFor, isAuthText } from "./antigravity";

const posix = process.platform === "win32" ? it.skip : it;

function fakeAgy(body: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alexel-agy-"));
  const f = path.join(dir, "agy");
  fs.writeFileSync(f, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return f;
}

describe("Antigravity: status masuk", () => {
  it("mengenali pesan belum masuk, bukan kata 'auth' sembarang", () => {
    expect(isAuthText("Print mode: not authenticated, trying silent auth")).toBe(true);
    expect(isAuthText("Print mode: not logged in and no controlling terminal; cannot complete interactive login")).toBe(true);
    expect(isAuthText("Open the following URL in your local browser to authenticate:")).toBe(true);
    expect(isAuthText("Edited src/author.ts")).toBe(false);
    expect(isAuthText("authored by Alex")).toBe(false);
  });
  posix("masuk = daftar model dari `agy models`", async () => {
    const f = fakeAgy('case "$1" in --version) echo 1.3.6;; models) printf "gemini-3\\tGemini 3\\nclaude-x\\tClaude X\\n";; esac');
    const st = await agyStatusFor(f);
    expect(st).toMatchObject({ installed: true, version: "1.3.6", loggedIn: true });
  });
  posix("belum masuk = pesan auth di keluaran `agy models`", async () => {
    const f = fakeAgy('case "$1" in --version) echo 1.3.6;; models) echo "not logged in" >&2; exit 1;; esac');
    expect((await agyStatusFor(f)).loggedIn).toBe(false);
  });
  posix("tidak diketahui (error lain) = null, bukan false", async () => {
    const f = fakeAgy('case "$1" in --version) echo 1.3.6;; models) echo "network unreachable" >&2; exit 1;; esac');
    expect((await agyStatusFor(f)).loggedIn).toBeNull();
  });
  it("tidak terpasang", async () => {
    expect(await agyStatusFor(null)).toMatchObject({ installed: false });
  });
});
