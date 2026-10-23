import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWebview, webviewCreate, webviewDispose, webviewHtml } from "./webviews";

describe("webview: penyajian dokumen & sumber daya", () => {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-wv-")));
  const other = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-wv2-")));
  fs.writeFileSync(path.join(dir, "a.css"), "body{}");
  fs.writeFileSync(path.join(other, "rahasia.txt"), "x");

  it("dokumen: skrip awal disisipkan setelah <head> sebelum skrip halaman; CSP dipasang", () => {
    webviewCreate(7, [dir]);
    webviewHtml(7, "<html><head><title>t</title></head><body><script>boot()</script></body></html>");
    const r = resolveWebview("nozelweb://v/7/index.html");
    expect(r.status).toBe(200);
    expect(r.csp).toBe(true);
    const body = String(r.body);
    expect(body.indexOf("acquireVsCodeApi")).toBeGreaterThan(body.indexOf("<head>"));
    expect(body.indexOf("acquireVsCodeApi")).toBeLessThan(body.indexOf("boot()"));
    webviewDispose(7);
  });

  it("HTML tanpa <head> tetap mendapat skrip awal; panel kosong dilayani halaman kosong", () => {
    webviewCreate(8, [dir]);
    expect(String(resolveWebview("nozelweb://v/8/index.html").body)).toContain("<body>");
    webviewHtml(8, "<p>halo</p>");
    expect(String(resolveWebview("nozelweb://v/8/index.html").body)).toMatch(/^<script>.*<\/script><p>halo<\/p>$/s);
    webviewDispose(8);
  });

  it("sumber daya hanya dari folder yang diizinkan panel itu", () => {
    webviewCreate(9, [dir]);
    const ok = resolveWebview(`nozelweb://r/9/${encodeURIComponent(path.join(dir, "a.css"))}`);
    expect(ok.status).toBe(200);
    expect(ok.mime).toBe("text/css");
    expect(resolveWebview(`nozelweb://r/9/${encodeURIComponent(path.join(other, "rahasia.txt"))}`).status).toBe(403);
    expect(resolveWebview(`nozelweb://r/9/${encodeURIComponent(path.join(dir, "..", path.basename(other), "rahasia.txt"))}`).status).toBe(403);
    expect(resolveWebview(`nozelweb://r/9/${encodeURIComponent(path.join(dir, "tidak-ada.js"))}`).status).toBe(404);
    webviewDispose(9);
  });

  it("panel yang sudah ditutup = 404", () => {
    expect(resolveWebview("nozelweb://v/9/index.html").status).toBe(404);
  });
});

describe("webview: bentuk URL sumber daya dari asWebviewUri", () => {
  it("path tanpa '/' awal dengan segmen ter-encode dikenali", () => {
    const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-wv3-")));
    fs.writeFileSync(path.join(d, "a b.js"), "1");
    webviewCreate(11, [d]);
    const segs = path.join(d, "a b.js").replace(/^\//, "").split("/").map(encodeURIComponent).join("/");
    expect(resolveWebview(`nozelweb://r/11/${segs}`).status).toBe(200);
    webviewDispose(11);
  });
});
