import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandForFile, compilerFor, detectTargets, pythonFor } from "./runner";

const tmp = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-run-")));
const put = (d: string, rel: string, content = "x") => {
  const f = path.join(d, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
};
const none = () => null;

describe("Run di Windows (string PowerShell, dites di OS mana pun)", () => {
  it("js/py/go memakai quoting PowerShell, nama aneh di-quote", () => {
    const d = tmp();
    const f = put(d, "a b/it's.js");
    const c = commandForFile(f, d, "win32").command;
    expect(c.startsWith("node '")).toBe(true);
    expect(c).toContain("it''s.js");
    expect(commandForFile(put(d, "x.go"), d, "win32").command).toMatch(/^go run /);
  });
  it("tanpa && (PowerShell 5.1): kompilasi lalu jalankan pakai `; if ($?)` dan operator &", () => {
    const d = tmp();
    const c = commandForFile(put(d, "m.c"), d, "win32").command;
    expect(c).not.toContain("&&");
    expect(c).toMatch(/; if \(\$\?\) \{ & .*nozel-run-m-\d+-\d+\.exe/);
    const posix = commandForFile(put(d, "m2.c"), d, "linux").command;
    expect(posix).toContain(" && ");
    expect(posix).not.toMatch(/(^|[^&])& /);
  });
  it("biner sementara unik tiap Run (exe yang berjalan terkunci di Windows)", () => {
    const d = tmp();
    const f = put(d, "z.cpp");
    expect(commandForFile(f, d, "win32").command).not.toBe(commandForFile(f, d, "win32").command);
  });
  it("runner Windows: .ps1, .bat, .cmd; .bat ditolak di OS lain", () => {
    const d = tmp();
    expect(commandForFile(put(d, "s.ps1"), d, "win32").command).toMatch(/^& /);
    expect(commandForFile(put(d, "b.bat"), d, "win32").command).toMatch(/^& /);
    expect(commandForFile(put(d, "c.cmd"), d, "win32").command).toMatch(/^& /);
    expect(() => commandForFile(put(d, "b2.bat"), d, "linux")).toThrow(/Windows/);
    expect(commandForFile(put(d, "s2.ps1"), d, "linux").command).toMatch(/^pwsh -NoProfile -File /);
  });
  it(".cs dijalankan dengan dotnet run", () => {
    const d = tmp();
    expect(commandForFile(put(d, "p.cs"), d, "win32").command).toMatch(/^dotnet run /);
  });
  it("detectTargets: nama skrip di-quote dengan gaya PowerShell, BOM di package.json tidak membuat target hilang", () => {
    const d = tmp();
    put(d, "package.json", "\uFEFF" + JSON.stringify({ scripts: { dev: "vite", "build prod": "x" } }));
    const t = detectTargets(d, "win32");
    expect(t.map((x) => x.command)).toContain("npm run dev");
    expect(t.map((x) => x.command)).toContain("npm run 'build prod'");
  });
});

describe("pemilihan interpreter & kompiler", () => {
  it("Windows: py launcher dulu; stub WindowsApps ditolak dengan petunjuk pasang", () => {
    const d = tmp();
    expect(pythonFor("win32", d, (n) => (n === "py" ? "C:\\Windows\\py.exe" : null)).cmd).toBe("py -3");
    expect(pythonFor("win32", d, (n) => (n === "python" ? "C:\\Python312\\python.exe" : null)).cmd).toBe("python");
    const stub = pythonFor("win32", d, (n) => (n === "python" ? "C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe" : null));
    expect(stub.missing?.install).toContain("winget install Python");
    expect(pythonFor("win32", d, none).missing).toBeDefined();
    expect(pythonFor("linux", d, none).missing?.install).toContain("apt");
  });
  it("venv project didahulukan (Scripts\\python.exe di Windows, bin/python di POSIX)", () => {
    const d = tmp();
    put(d, ".venv/Scripts/python.exe");
    put(d, "v2/venv/bin/python");
    expect(pythonFor("win32", d, none).cmd).toMatch(/^& .*\.venv.*python\.exe/);
    expect(pythonFor("linux", path.join(d, "v2"), none).cmd).toMatch(/venv\/bin\/python/);
  });
  it("kompiler: gcc dulu di Windows, clang dulu di OS lain; tidak ada = petunjuk pasang", () => {
    const both = (n: string) => `/x/${n}`;
    expect(compilerFor("win32", false, both).cmd).toBe("gcc");
    expect(compilerFor("darwin", false, both).cmd).toBe("clang");
    expect(compilerFor("win32", true, (n) => (n === "clang++" ? "/x/clang++" : null)).cmd).toBe("clang++");
    expect(compilerFor("win32", false, none).missing?.install).toMatch(/winget/);
  });
});

import { expandWinVars, splitWinPath } from "./util";

describe("PATH Windows", () => {
  it("expand %VAR% tanpa membedakan huruf, buang kutip & backslash penutup & entri relatif", () => {
    const env = { SystemRoot: "C:\\Windows", LocalAppData: "C:\\Users\\a\\AppData\\Local" };
    expect(expandWinVars("%SYSTEMROOT%\\System32", env)).toBe("C:\\Windows\\System32");
    expect(
      splitWinPath('"C:\\Program Files\\Git\\cmd\\";%SystemRoot%\\system32;.\\node;;%UNKNOWN%\\x;C:\\;%LOCALAPPDATA%\\Programs\\Python\\Python312\\', env)
    ).toEqual(["C:\\Program Files\\Git\\cmd", "C:\\Windows\\system32", "C:\\", "C:\\Users\\a\\AppData\\Local\\Programs\\Python\\Python312"]);
  });
});

import { shellArgs, winScript } from "./pty";

describe("shell Windows", () => {
  it("terminal interaktif & Run memakai ExecutionPolicy Bypass (shim npm .ps1)", () => {
    const inter = shellArgs(null, true);
    expect(inter).toEqual(expect.arrayContaining(["-ExecutionPolicy", "Bypass", "-NoExit"]));
    const run = shellArgs("npm run dev", true);
    expect(run).toEqual(expect.arrayContaining(["-ExecutionPolicy", "Bypass", "-Command"]));
    expect(run).not.toContain("-NoExit");
  });
  it("Run meneruskan kode keluar program", () => {
    const s = winScript("& 'C:\\x\\a.exe'");
    expect(s).toContain("OutputEncoding");
    expect(s).toContain("& 'C:\\x\\a.exe'; if ($null -ne $LASTEXITCODE");
    expect(s).toContain("exit $LASTEXITCODE");
    expect(s).toMatch(/elseif \(-not \$\?\) \{ exit 1 \}$/);
  });
  it("POSIX tetap -l -c", () => {
    expect(shellArgs("ls", false)).toEqual(["-l", "-c", "ls"]);
    expect(shellArgs(null, false)).toEqual(["-l"]);
  });
});
