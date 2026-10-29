import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ownerHost, prepareWebviewHtml, resolveWebview, webviewCreate, webviewDispose, webviewHtml } from "./webviews";

const H = ownerHost(undefined);

describe("webview: penyajian dokumen & sumber daya", () => {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-wv-")));
  const other = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-wv2-")));
  fs.writeFileSync(path.join(dir, "a.css"), "body{}");
  fs.writeFileSync(path.join(other, "rahasia.txt"), "x");

  it("dokumen: skrip awal disisipkan setelah <head> sebelum skrip halaman; CSP dipasang", () => {
    webviewCreate(7, [dir]);
    webviewHtml(7, "<html><head><title>t</title></head><body><script>boot()</script></body></html>");
    const r = resolveWebview(`nozelweb://${H}/v/7/index.html`);
    expect(r.status).toBe(200);
    expect(r.csp).toBe(true);
    const body = String(r.body);
    expect(body.indexOf("acquireVsCodeApi")).toBeGreaterThan(body.indexOf("<head>"));
    expect(body.indexOf("acquireVsCodeApi")).toBeLessThan(body.indexOf("boot()"));
    webviewDispose(7);
  });

  it("HTML tanpa <head> tetap mendapat skrip awal; panel kosong dilayani halaman kosong", () => {
    webviewCreate(8, [dir]);
    expect(String(resolveWebview(`nozelweb://${H}/v/8/index.html`).body)).toContain("<body>");
    webviewHtml(8, "<p>halo</p>");
    expect(String(resolveWebview(`nozelweb://${H}/v/8/index.html`).body)).toMatch(/^<style id="_defaultStyles">.*<\/style><script>.*<\/script><p>halo<\/p>$/s);
    webviewDispose(8);
  });

  it("sumber daya hanya dari folder yang diizinkan panel itu", () => {
    webviewCreate(9, [dir]);
    const ok = resolveWebview(`nozelweb://${H}/r/9/${encodeURIComponent(path.join(dir, "a.css"))}`);
    expect(ok.status).toBe(200);
    expect(ok.mime).toBe("text/css");
    expect(resolveWebview(`nozelweb://${H}/r/9/${encodeURIComponent(path.join(other, "rahasia.txt"))}`).status).toBe(403);
    expect(resolveWebview(`nozelweb://${H}/r/9/${encodeURIComponent(path.join(dir, "..", path.basename(other), "rahasia.txt"))}`).status).toBe(403);
    expect(resolveWebview(`nozelweb://${H}/r/9/${encodeURIComponent(path.join(dir, "tidak-ada.js"))}`).status).toBe(404);
    webviewDispose(9);
  });

  it("host (origin) lain ditolak walau id panel benar", () => {
    webviewCreate(12, [dir], "ext.satu");
    webviewHtml(12, "<p>x</p>");
    expect(resolveWebview(`nozelweb://${ownerHost("ext.satu")}/v/12/index.html`).status).toBe(200);
    expect(resolveWebview(`nozelweb://${ownerHost("ext.dua")}/v/12/index.html`).status).toBe(404);
    expect(ownerHost("ext.satu")).not.toBe(ownerHost("ext.dua"));
    webviewDispose(12);
  });

  it("panel yang sudah ditutup = 404", () => {
    expect(resolveWebview(`nozelweb://${H}/v/9/index.html`).status).toBe(404);
  });
});

describe("webview: bentuk URL sumber daya dari asWebviewUri", () => {
  it("path tanpa '/' awal dengan segmen ter-encode dikenali", () => {
    const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-wv3-")));
    fs.writeFileSync(path.join(d, "a b.js"), "1");
    webviewCreate(11, [d]);
    const segs = path.join(d, "a b.js").replace(/^\//, "").split("/").map(encodeURIComponent).join("/");
    expect(resolveWebview(`nozelweb://${H}/r/11/${segs}`).status).toBe(200);
    webviewDispose(11);
  });
});

describe("webview: ekstraksi nonce CSP untuk bootstrap", () => {
  it("mengekstraksi nonce dari meta Content-Security-Policy dan menyisipkannya ke tag <script>", () => {
    webviewCreate(20, []);
    webviewHtml(
      20,
      '<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-secret12345\';"><title>Ext</title></head><body><script nonce="secret12345">run()</script></body></html>'
    );
    const r = resolveWebview(`nozelweb://${H}/v/20/index.html`);
    expect(r.status).toBe(200);
    const body = String(r.body);
    expect(body).toContain('<script nonce="secret12345">');
    expect(body).toContain("acquireVsCodeApi");
    webviewDispose(20);
  });

  it("mengekstraksi nonce dari atribut script jika meta CSP tidak ada", () => {
    webviewCreate(21, []);
    webviewHtml(21, '<!DOCTYPE html><html><head><title>Ext</title></head><body><script nonce="abc999xyz">run()</script></body></html>');
    const r = resolveWebview(`nozelweb://${H}/v/21/index.html`);
    expect(r.status).toBe(200);
    const body = String(r.body);
    expect(body).toContain('<script nonce="abc999xyz">');
    webviewDispose(21);
  });

  it("memprioritaskan nonce script-src bila style-src memiliki nonce berbeda sebelumnya", () => {
    webviewCreate(22, []);
    webviewHtml(
      22,
      '<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'nonce-style111\'; script-src \'nonce-script222\';"><title>Ext</title></head><body><script nonce="script222">run()</script></body></html>'
    );
    const r = resolveWebview(`nozelweb://${H}/v/22/index.html`);
    expect(r.status).toBe(200);
    const body = String(r.body);
    expect(body).toContain('<script nonce="script222">');
    expect(body).not.toContain('<script nonce="style111">');
    webviewDispose(22);
  });

  it("menyuntikkan nonce dinamis ke meta CSP & bootstrap script jika dokumen menerapkan CSP ketat tanpa nonce (pola Codex)", () => {
    webviewCreate(23, []);
    webviewHtml(
      23,
      '<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src nozelweb:; style-src nozelweb: \'unsafe-inline\';"><title>Codex</title></head><body><script type="module" src="./assets/index.js"></script></body></html>'
    );
    const r = resolveWebview(`nozelweb://${H}/v/23/index.html`);
    expect(r.status).toBe(200);
    const body = String(r.body);
    const scriptNonceMatch = body.match(/<script\s+nonce="([A-Za-z0-9+/=_-]+)">\(function/);
    expect(scriptNonceMatch).toBeTruthy();
    const nonce = scriptNonceMatch![1];
    // Pastikan nonce yang disuntikkan ke script bootstrap juga ada di CSP meta
    expect(body).toContain(`'nonce-${nonce}'`);
    webviewDispose(23);
  });
});

describe("prepareWebviewHtml tanpa <head>", () => {
  it("menyisipkan bootstrap setelah doctype dan tidak salah kenal <header>", () => {
    const a = prepareWebviewHtml(1, "<!DOCTYPE html><html><body><header>x</header></body></html>");
    expect(a.startsWith("<!DOCTYPE html><html>")).toBe(true);
    expect(a.indexOf("acquireVsCodeApi")).toBeGreaterThan(a.indexOf("<html>"));
    expect(a.indexOf("acquireVsCodeApi")).toBeLessThan(a.indexOf("<header>"));
  });
});

describe("CSP font webview", () => {
  it("menambah data: ke font-src saja, tidak menyentuh script-src", async () => {
    const { allowDataFonts } = await import("./webviews");
    const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src nozelweb:; script-src 'nonce-x'">`;
    const out = allowDataFonts(html);
    expect(out).toContain("font-src nozelweb: data: ;");
    expect(out).toContain("script-src 'nonce-x'");
    expect(allowDataFonts(out)).toBe(out);
  });
});
