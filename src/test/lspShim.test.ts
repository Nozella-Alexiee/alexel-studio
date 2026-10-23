import { describe, expect, it } from "vitest";
import { answerServerRequest } from "../editor/lspShim";

const ctx = { settings: { prisma: { enableDiagnostics: true }, yaml: { format: { enable: true }, validate: true } }, rootUri: "file:///p", rootName: "p" };
const req = (o: object) => JSON.stringify({ jsonrpc: "2.0", ...o });
const parse = (s: string | null) => JSON.parse(s!);

describe("jawaban request server→klien", () => {
  it("workspace/configuration mengembalikan nilai per seksi (bersarang & tidak ada = null)", () => {
    const r = parse(answerServerRequest(req({ id: 7, method: "workspace/configuration", params: { items: [{ section: "prisma" }, { section: "yaml.format" }, { section: "nope" }, {}] } }), ctx));
    expect(r.id).toBe(7);
    expect(r.result[0]).toEqual({ enableDiagnostics: true });
    expect(r.result[1]).toEqual({ enable: true });
    expect(r.result[2]).toBeNull();
    expect(r.result[3]).toEqual(ctx.settings);
  });

  it("registerCapability, progress, dan workspaceFolders dijawab", () => {
    expect(parse(answerServerRequest(req({ id: "a", method: "client/registerCapability", params: { registrations: [] } }), ctx))).toMatchObject({ id: "a", result: null });
    expect(parse(answerServerRequest(req({ id: 2, method: "window/workDoneProgress/create", params: {} }), ctx)).result).toBeNull();
    expect(parse(answerServerRequest(req({ id: 3, method: "workspace/workspaceFolders" }), ctx)).result).toEqual([{ uri: "file:///p", name: "p" }]);
  });

  it("tanpa seksi pengaturan → null per item (tidak crash)", () => {
    const r = parse(answerServerRequest(req({ id: 1, method: "workspace/configuration", params: { items: [{ section: "x" }] } }), { ...ctx, settings: null }));
    expect(r.result).toEqual([null]);
  });

  it("notifikasi, respons, dan request lain dibiarkan untuk klien", () => {
    expect(answerServerRequest(req({ method: "workspace/configuration", params: { items: [] } }), ctx)).toBeNull();
    expect(answerServerRequest(req({ id: 1, result: [] }), ctx)).toBeNull();
    expect(answerServerRequest(req({ id: 1, method: "window/showMessageRequest", params: {} }), ctx)).toBeNull();
    expect(answerServerRequest(req({ method: "textDocument/publishDiagnostics", params: { uri: "x", diagnostics: [] } }), ctx)).toBeNull();
    expect(answerServerRequest("bukan json {", ctx)).toBeNull();
  });
});
