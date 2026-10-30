import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getVersion: () => "1.0.0", getAppPath: () => process.cwd() } }));

const { compareSemver, newerThan } = await import("./update");

describe("compareSemver (presedensi semver 2.0)", () => {
  const sign = (a: string, b: string) => Math.sign(compareSemver(a, b));

  it("urutan contoh dari spesifikasi semver", () => {
    const order = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"];
    for (let i = 0; i < order.length - 1; i++) {
      expect(sign(order[i], order[i + 1]), `${order[i]} < ${order[i + 1]}`).toBe(-1);
      expect(sign(order[i + 1], order[i]), `${order[i + 1]} > ${order[i]}`).toBe(1);
    }
  });

  it("inti versi, awalan v, dan metadata build", () => {
    expect(sign("v0.4.1", "0.3.0")).toBe(1);
    expect(sign("1.10.0", "1.9.9")).toBe(1);
    expect(sign("2.0.0", "v2.0.0")).toBe(0);
    expect(sign("1.0.0+build.5", "1.0.0")).toBe(0);
    expect(sign("1.0.0-rc.1+abc", "1.0.0-rc.1")).toBe(0);
  });

  it("prerelease lebih rendah daripada versi finalnya, tapi lebih tinggi daripada versi final sebelumnya", () => {
    expect(sign("1.0.0-rc.2", "1.0.0")).toBe(-1);
    expect(sign("1.0.0-rc.2", "0.9.9")).toBe(1);
  });

  it("identifier numerik dibandingkan secara numerik", () => {
    expect(sign("1.0.0-rc.10", "1.0.0-rc.2")).toBe(1);
    expect(sign("1.0.0-rc.2", "1.0.0-rc.1")).toBe(1);
    expect(sign("1.0.0-beta", "1.0.0-rc")).toBe(-1);
    expect(sign("1.0.0-1", "1.0.0-alpha")).toBe(-1);
  });
});

describe("newerThan", () => {
  it("versi final biasa", () => {
    expect(newerThan("v0.4.1", "0.3.0")).toBe(true);
    expect(newerThan("0.3.0", "0.3.0")).toBe(false);
    expect(newerThan("0.2.9", "0.3.0")).toBe(false);
  });

  it("pengguna rc ditawari versi final dan rc yang lebih baru", () => {
    expect(newerThan("1.0.0", "1.0.0-rc.2")).toBe(true);
    expect(newerThan("v1.0.0", "1.0.0-rc.2")).toBe(true);
    expect(newerThan("1.0.0-rc.2", "1.0.0-rc.1")).toBe(true);
    expect(newerThan("1.0.0-rc", "1.0.0-beta")).toBe(true);
    expect(newerThan("1.0.0-rc.1", "1.0.0-rc.2")).toBe(false);
    expect(newerThan("1.0.0-rc.2", "1.0.0-rc.2")).toBe(false);
  });

  it("pengguna versi final tidak ditawari prerelease (belum ada kanal prerelease)", () => {
    expect(newerThan("1.1.0-rc.1", "1.0.0")).toBe(false);
    expect(newerThan("1.0.0-rc.2", "1.0.0")).toBe(false);
    expect(newerThan("2.0.0-beta", "1.0.0")).toBe(false);
  });
});
