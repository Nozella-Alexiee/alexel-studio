import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/ipc";
import { NOTEBOOK_CLOSED, ensureKernel, useKernels } from "../notebook/kernel";
import { useStore } from "../state/store";

const NB = "/p/closed.ipynb";
const openTab = (path: string) => useStore.setState((s) => ({ tabs: { ...s.tabs, [path]: { id: path } } }) as never);
const closeTab = (path: string) =>
  useStore.setState((s) => {
    const tabs = { ...s.tabs };
    delete tabs[path];
    return { tabs };
  });

afterEach(() => {
  vi.restoreAllMocks();
  closeTab(NB);
  useKernels.setState({ byPath: {} });
});

/** jupyterStart yang ditahan sampai tes melepaskannya. */
function heldStart() {
  let release!: () => void;
  const start = vi.spyOn(api, "jupyterStart").mockImplementation(
    () => new Promise((res) => (release = () => res({ id: "k-late", name: "python3" } as never)))
  );
  const shutdown = vi.spyOn(api, "jupyterShutdown").mockResolvedValue(undefined as never);
  return { start, shutdown, release: () => release() };
}

describe("kernel notebook: tab ditutup saat kernel dimulai", () => {
  it("kernel yang selesai dimulai setelah tab ditutup langsung dimatikan", async () => {
    openTab(NB);
    const { shutdown, release } = heldStart();
    const p = ensureKernel(NB, "/p", null);
    expect(useKernels.getState().byPath[NB].status).toBe("starting");
    closeTab(NB);
    release();
    await expect(p).rejects.toThrow(NOTEBOOK_CLOSED);
    expect(shutdown).toHaveBeenCalledWith("k-late");
    expect(useKernels.getState().byPath[NB]).toMatchObject({ id: null, status: "none" });
  });

  it("tab yang tetap terbuka memakai kernelnya", async () => {
    openTab(NB);
    const { shutdown, release } = heldStart();
    const p = ensureKernel(NB, "/p", null);
    release();
    await expect(p).resolves.toBe("k-late");
    expect(shutdown).not.toHaveBeenCalled();
    expect(useKernels.getState().byPath[NB]).toMatchObject({ id: "k-late", status: "idle" });
    // Penutupan tab setelah kernel siap tetap mematikannya lewat subscriber yang sudah ada.
    closeTab(NB);
    await vi.waitFor(() => expect(shutdown).toHaveBeenCalledWith("k-late"));
  });

  it("setelah dibatalkan, membuka lagi memulai kernel baru", async () => {
    openTab(NB);
    const first = heldStart();
    const p = ensureKernel(NB, "/p", null);
    closeTab(NB);
    first.release();
    await expect(p).rejects.toThrow(NOTEBOOK_CLOSED);
    vi.restoreAllMocks();

    openTab(NB);
    const second = heldStart();
    const q = ensureKernel(NB, "/p", null);
    second.release();
    await expect(q).resolves.toBe("k-late");
    expect(second.start).toHaveBeenCalledTimes(1);
  });
});
