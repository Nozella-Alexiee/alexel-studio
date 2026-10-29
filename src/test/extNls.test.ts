/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { localize } from "../../electron/extensions";

describe("terjemahan package.nls", () => {
  it("mengganti %kunci% di semua tingkat, membiarkan yang tidak dikenal", () => {
    const nls = { "views.title": "Roo Code", cmd: "Buka" };
    expect(localize({ a: "%views.title%", b: ["%cmd%", "%x%"], c: 5, d: "50%" }, nls)).toEqual({ a: "Roo Code", b: ["Buka", "%x%"], c: 5, d: "50%" });
  });
});
