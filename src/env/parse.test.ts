import { describe, expect, it } from "vitest";
import { envKeys, exampleFrom, formatPair, looksSecret, parseEnvLines, serializeEnv, setEnvValue } from "./parse";

const SRC = `# Aplikasi
APP_NAME="Alexel Shop"
export PORT=3000 # port lokal
DATABASE_URL=postgres://u:p@localhost/db

KEY='single'
MULTI="baris1
baris2"
ESC="a\\"b"
`;

describe(".env", () => {
  it("mengurai dan menulis ulang tanpa perubahan", () => {
    const l = parseEnvLines(SRC);
    expect(envKeys(l)).toEqual(["APP_NAME", "PORT", "DATABASE_URL", "KEY", "MULTI", "ESC"]);
    const port = l.find((x) => x.kind === "pair" && x.key === "PORT");
    expect(port).toMatchObject({ value: "3000", export: true, comment: "# port lokal" });
    expect(l.find((x) => x.kind === "pair" && x.key === "MULTI")).toMatchObject({ value: "baris1\nbaris2" });
    expect(l.find((x) => x.kind === "pair" && x.key === "ESC")).toMatchObject({ value: 'a"b' });
    expect(serializeEnv(l)).toBe(SRC.replace('MULTI="baris1\nbaris2"', 'MULTI="baris1\\nbaris2"'));
  });
  it("mengubah, menambah, menghapus satu kunci", () => {
    let l = parseEnvLines(SRC);
    l = setEnvValue(l, "PORT", "8080");
    l = setEnvValue(l, "NEW_ONE", "has space");
    l = setEnvValue(l, "KEY", null);
    const out = serializeEnv(l);
    expect(out).toContain("export PORT=8080 # port lokal");
    expect(out).toContain('NEW_ONE="has space"');
    expect(out).not.toContain("KEY=");
    expect(out.startsWith("# Aplikasi\n")).toBe(true);
  });
  it("membuat .env.example dan mengenali rahasia", () => {
    expect(exampleFrom(parseEnvLines("A=1 # c\n# x\nB='y'\n"))).toBe("A= # c\n# x\nB=\n");
    expect(formatPair("X", "it's")).toBe(`X="it's"`);
    expect(looksSecret("STRIPE_SECRET_KEY")).toBe(true);
    expect(looksSecret("PORT")).toBe(false);
  });
});
