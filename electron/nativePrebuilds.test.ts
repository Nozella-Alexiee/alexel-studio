import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Installer Windows/macOS dirakit untuk dua arsitektur dari satu runner CI dengan npmRebuild: false,
// jadi terminal (node-pty, N-API) bergantung pada prebuild bawaan paket untuk tiap arsitektur target.
// Tes ini gagal bila versi node-pty berikutnya tidak lagi membawa prebuild untuk arsitektur yang dirakit.

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
  build: { win: { target: { arch: string[] }[] }; mac: { target: { arch: string[] }[] } };
};
const ptyDir = path.join(root, "node_modules", "node-pty");
const arches = (t: { arch: string[] }[]) => [...new Set(t.flatMap((x) => x.arch))];

/** Mesin PE (COFF) dari berkas .node/.exe/.dll Windows. */
function peMachine(file: string): string {
  const b = fs.readFileSync(file);
  const pe = b.readUInt32LE(0x3c);
  expect(b.toString("latin1", pe, pe + 4)).toBe("PE\0\0");
  const m = b.readUInt16LE(pe + 4);
  return m === 0x8664 ? "x64" : m === 0xaa64 ? "arm64" : `0x${m.toString(16)}`;
}

/** CPU dari berkas Mach-O 64-bit (bukan fat). */
function machCpu(file: string): string {
  const b = fs.readFileSync(file);
  expect(b.readUInt32LE(0)).toBe(0xfeedfacf);
  const cpu = b.readUInt32LE(4);
  return cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "arm64" : `0x${cpu.toString(16)}`;
}

describe("prebuild node-pty untuk setiap arsitektur installer", () => {
  it.each(arches(pkg.build.win.target))("win32-%s", (arch) => {
    const dir = path.join(ptyDir, "prebuilds", `win32-${arch}`);
    for (const f of ["pty.node", "conpty.node", "conpty_console_list.node", "winpty.dll", "winpty-agent.exe", "conpty/conpty.dll", "conpty/OpenConsole.exe"]) {
      expect(fs.existsSync(path.join(dir, f)), `${dir}/${f}`).toBe(true);
      expect(peMachine(path.join(dir, f)), f).toBe(arch);
    }
  });

  it.each(arches(pkg.build.mac.target))("darwin-%s", (arch) => {
    const dir = path.join(ptyDir, "prebuilds", `darwin-${arch}`);
    for (const f of ["pty.node", "spawn-helper"]) expect(machCpu(path.join(dir, f)), f).toBe(arch);
  });

  // node-pty memuat build/Release lebih dulu daripada prebuilds/<platform>-<arch>: hasil kompilasi lokal
  // (satu arsitektur) akan ikut terpaket dan menimpa prebuild arsitektur lain.
  it.runIf(!!process.env.CI && process.platform !== "linux")("tidak ada hasil kompilasi lokal yang menimpa prebuild", () => {
    for (const f of ["pty.node", "conpty.node"]) expect(fs.existsSync(path.join(ptyDir, "build", "Release", f)), f).toBe(false);
  });
});
