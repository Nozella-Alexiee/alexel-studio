// Kernel Jupyter per berkas notebook di renderer: mulai, jalankan sel, status, dan event output.

import { create } from "zustand";
import { api, on } from "../lib/ipc";
import { useStore } from "../state/store";
import type { NbOutput } from "./model";

export interface KernelState {
  id: string | null;
  name: string | null;
  status: "none" | "starting" | "idle" | "busy" | "dead" | "error";
  error?: string;
}

export const useKernels = create<{ byPath: Record<string, KernelState> }>(() => ({ byPath: {} }));
const setK = (path: string, k: Partial<KernelState>) => useKernels.setState((s) => ({ byPath: { ...s.byPath, [path]: { ...(s.byPath[path] ?? { id: null, name: null, status: "none" }), ...k } } }));

export type CellEvent = { type: "output"; output: NbOutput } | { type: "clear" } | { type: "count"; count: number } | { type: "done"; status: string; count?: number };
const cellHandlers = new Map<string, (e: CellEvent) => void>();

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  void on<{ kernel: string; cell?: string; type: string; state?: string; output?: NbOutput; count?: number; status?: string }>("jupyter-event", (e) => {
    if (e.type === "status") {
      for (const [path, k] of Object.entries(useKernels.getState().byPath)) if (k.id === e.kernel) setK(path, { status: e.state === "busy" ? "busy" : e.state === "dead" ? "dead" : "idle" });
      return;
    }
    if (e.cell) cellHandlers.get(e.cell)?.(e as unknown as CellEvent);
  });
  // Tab notebook ditutup → kernel dimatikan (seperti VS Code).
  useStore.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return;
    for (const [path, k] of Object.entries(useKernels.getState().byPath)) if (k.id && !s.tabs[path]) void shutdownKernel(path);
  });
}

const starting = new Map<string, Promise<string>>();
/** Pesan galat ensureKernel bila tab notebook sudah ditutup sebelum kernel selesai dimulai (tidak perlu ditampilkan). */
export const NOTEBOOK_CLOSED = "NOTEBOOK_CLOSED";

export function ensureKernel(path: string, root: string, name: string | null): Promise<string> {
  wire();
  const cur = useKernels.getState().byPath[path];
  if (cur?.id && cur.status !== "dead") return Promise.resolve(cur.id);
  let p = starting.get(path);
  if (!p) {
    setK(path, { status: "starting", error: undefined });
    p = api
      .jupyterStart(root, name)
      .then(
        (k) => {
          // Tab ditutup saat kernel masih dimulai: penutupan tab tidak melihat id-nya, jadi matikan di sini.
          if (!useStore.getState().tabs[path]) {
            void api.jupyterShutdown(k.id).catch(() => {});
            setK(path, { id: null, status: "none" });
            throw new Error(NOTEBOOK_CLOSED);
          }
          setK(path, { id: k.id, name: k.name, status: "idle" });
          return k.id;
        },
        (e: Error) => {
          setK(path, { status: "error", error: e.message });
          throw e;
        }
      )
      .finally(() => starting.delete(path));
    starting.set(path, p);
  }
  return p;
}

export async function runCell(path: string, root: string, kernelName: string | null, cellId: string, code: string, onEvent: (e: CellEvent) => void) {
  const id = await ensureKernel(path, root, kernelName);
  cellHandlers.set(cellId, (e) => {
    onEvent(e);
    if (e.type === "done") cellHandlers.delete(cellId);
  });
  try {
    await api.jupyterExecute(id, cellId, code);
  } catch (e) {
    cellHandlers.delete(cellId);
    throw e;
  }
}

export async function interruptKernel(path: string) {
  const id = useKernels.getState().byPath[path]?.id;
  if (id) await api.jupyterInterrupt(id);
}

export async function restartKernel(path: string) {
  const id = useKernels.getState().byPath[path]?.id;
  if (id) {
    setK(path, { status: "starting", error: undefined });
    try {
      await api.jupyterRestart(id);
      setK(path, { status: "idle" });
    } catch (e) {
      // Gagal memulai ulang: jangan tertahan di "Memulai kernel…"; kernel dianggap mati, sel berikutnya memulai baru.
      setK(path, { status: "dead", error: (e as Error).message });
      throw e;
    }
  }
}

export async function shutdownKernel(path: string) {
  const id = useKernels.getState().byPath[path]?.id;
  if (id) await api.jupyterShutdown(id).catch(() => {});
  setK(path, { id: null, status: "none" });
}
