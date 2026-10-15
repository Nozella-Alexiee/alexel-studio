// State debugger (terpisah dari store utama supaya update variabel/console tidak me-render ulang seluruh app).

import { create } from "zustand";

export interface Breakpoint {
  line: number;
  condition?: string;
  verified?: boolean;
  message?: string;
}

export interface Frame {
  id: number;
  name: string;
  path: string | null;
  line: number;
  col: number;
}

export interface Var {
  name: string;
  value: string;
  type?: string;
  ref: number;
}

export interface ConsoleLine {
  kind: "out" | "err" | "info" | "in" | "result";
  text: string;
}

export type DebugStatus = "idle" | "starting" | "running" | "paused" | "stopped";

export interface DebugState {
  breakpoints: Record<string, Breakpoint[]>;
  status: DebugStatus;
  name: string | null;
  /** Sesi DAP yang sedang berhenti / dipakai untuk step & evaluate. */
  active: string | null;
  threadId: number | null;
  frames: Frame[];
  frameId: number | null;
  scopes: { name: string; ref: number; expensive: boolean }[];
  vars: Record<number, Var[]>;
  console: ConsoleLine[];
  watch: { expr: string; value?: string; error?: boolean }[];
  stopReason: string | null;
  stoppedAt: { path: string; line: number } | null;
}

export const useDebug = create<DebugState>(() => ({
  breakpoints: {},
  status: "idle",
  name: null,
  active: null,
  threadId: null,
  frames: [],
  frameId: null,
  scopes: [],
  vars: {},
  console: [],
  watch: [],
  stopReason: null,
  stoppedAt: null,
}));

export const dbg = () => useDebug.getState();
export const setDbg = (p: Partial<DebugState> | ((s: DebugState) => Partial<DebugState>)) => useDebug.setState(p);

export const isDebugging = () => {
  const s = dbg().status;
  return s === "starting" || s === "running" || s === "paused";
};

const MAX_CONSOLE = 3000;
export function consoleLine(kind: ConsoleLine["kind"], text: string) {
  if (!text) return;
  setDbg((s) => {
    const next = [...s.console, { kind, text }];
    return { console: next.length > MAX_CONSOLE ? next.slice(-MAX_CONSOLE) : next };
  });
}
