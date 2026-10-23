import { describe, expect, it } from "vitest";
// @ts-ignore — skrip Node murni tanpa tipe, dipakai bersama CLI `node scripts/contrast.mjs`.
import { audit } from "../../scripts/contrast.mjs";

interface Row {
  design: string;
  name: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
}

describe("kontras warna desain", () => {
  const rows = audit() as Row[];

  it("memeriksa semua desain", () => {
    expect(new Set(rows.map((r) => r.design)).size).toBe(8);
    expect(rows.length).toBeGreaterThan(100);
  });

  it("tiap pasangan teks/latar memenuhi batas WCAG", () => {
    const fails = rows.filter((r) => r.ratio < r.min).map((r) => `${r.design} ${r.name}: ${r.fg} di ${r.bg} = ${r.ratio.toFixed(2)} (min ${r.min})`);
    expect(fails).toEqual([]);
  });
});
