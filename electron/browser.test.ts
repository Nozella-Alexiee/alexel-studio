import { describe, expect, it, vi } from "vitest";

const dialogMock = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showMessageBoxSync: vi.fn(() => {
    throw new Error("dialog sinkron membekukan main process");
  }),
}));
vi.mock("electron", () => ({ BrowserWindow: class {}, WebContentsView: class {}, session: {}, ipcMain: { on: vi.fn() }, dialog: dialogMock }));
const { normalizeUrl, answerDialog, destroyBrowser, _test } = await import("./browser");

describe("browser", () => {
  it("menormalkan alamat", () => {
    expect(normalizeUrl("localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(normalizeUrl(":5173")).toBe("http://localhost:5173");
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("https://a.test")).toBe("https://a.test");
    expect(normalizeUrl("cara pakai docker")).toBe("https://duckduckgo.com/?q=cara%20pakai%20docker");
    expect(normalizeUrl("")).toBe("about:blank");
    expect(normalizeUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });
});

describe("dialog halaman di tab browser", () => {
  const fakeTab = (tabId: number, wcId: number) => {
    const wc = { id: wcId, isDestroyed: () => false, close: vi.fn() };
    _test.views.set(tabId, { view: { webContents: wc } as never, win: { contentView: { removeChildView: vi.fn() } } as never, visible: true, dialogs: new Set() });
  };
  const ev = (id: number) => ({ sender: { id, getURL: () => "https://contoh.test/a" }, returnValue: undefined as unknown });
  const deferred = () => {
    let resolve!: (v: { response: number }) => void;
    const p = new Promise<{ response: number }>((r) => (resolve = r));
    return { p, resolve };
  };

  it("confirm: dialog asinkron, main tidak menunggu, jawaban diisi saat dialog ditutup", async () => {
    fakeTab(1, 101);
    const d = deferred();
    dialogMock.showMessageBox.mockReturnValueOnce(d.p);
    const e = ev(101);
    const done = answerDialog(e, "confirm", "Hapus?");
    // Dialog terbuka tetapi handler sudah kembali: main bebas mengerjakan hal lain.
    await Promise.resolve();
    expect(dialogMock.showMessageBox).toHaveBeenCalledTimes(1);
    expect(dialogMock.showMessageBoxSync).not.toHaveBeenCalled();
    expect(e.returnValue).toBeUndefined();
    d.resolve({ response: 0 });
    await done;
    expect(e.returnValue).toBe(true);
  });

  it("confirm dibatalkan → false; alert dan prompt → null", async () => {
    fakeTab(2, 102);
    dialogMock.showMessageBox.mockResolvedValueOnce({ response: 1 });
    const c = ev(102);
    await answerDialog(c, "confirm", "Lanjut?");
    expect(c.returnValue).toBe(false);
    dialogMock.showMessageBox.mockResolvedValueOnce({ response: 0 });
    const a = ev(102);
    await answerDialog(a, "alert", "Halo");
    expect(a.returnValue).toBeNull();
    dialogMock.showMessageBox.mockResolvedValueOnce({ response: 0 });
    const p = ev(102);
    await answerDialog(p, "prompt", "Nama?");
    expect(p.returnValue).toBeNull();
  });

  it("pengirim yang bukan tab browser langsung mendapat null tanpa dialog", async () => {
    dialogMock.showMessageBox.mockClear();
    const e = ev(999);
    await answerDialog(e, "confirm", "x");
    expect(e.returnValue).toBeNull();
    expect(dialogMock.showMessageBox).not.toHaveBeenCalled();
  });

  it("tab ditutup saat dialog terbuka: dialog dibatalkan dan halaman mendapat jawaban batal", async () => {
    fakeTab(3, 103);
    let signal: AbortSignal | undefined;
    dialogMock.showMessageBox.mockImplementationOnce((_w: unknown, o: { signal: AbortSignal; cancelId: number }) => {
      signal = o.signal;
      return new Promise((r) => o.signal.addEventListener("abort", () => r({ response: o.cancelId })));
    });
    const e = ev(103);
    const done = answerDialog(e, "confirm", "Simpan?");
    await Promise.resolve();
    destroyBrowser(3);
    await done;
    expect(signal?.aborted).toBe(true);
    expect(e.returnValue).toBe(false);
  });
});
