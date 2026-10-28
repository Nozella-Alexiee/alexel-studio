// Keadaan Test Explorer di renderer: pohon test dari controller ekstensi dan hasil run terakhir.

import { create } from "zustand";
import { logOutput } from "../app/output";
import { hostCall, hostNotify } from "./client";
import { tl } from "../i18n";

interface JPos { l: number; c: number }
export interface TestNode {
  key: string;
  id: string;
  label: string;
  uri?: string;
  range?: { s: JPos; e: JPos };
  description?: string;
  error?: string;
  busy: boolean;
  canResolveChildren: boolean;
  children: TestNode[];
}
export interface TestCtl {
  id: string;
  label: string;
  profiles: { label: string; kind: number; isDefault: boolean }[];
  canRefresh: boolean;
  items: TestNode[];
}
export type TestState = "queued" | "running" | "passed" | "failed" | "errored" | "skipped";
export interface TestResult {
  state: TestState;
  message?: string;
  duration?: number;
}

export const useTests = create<{ controllers: TestCtl[]; results: Record<string, TestResult>; runs: number }>(() => ({ controllers: [], results: {}, runs: 0 }));
export const resetTests = () => useTests.setState({ controllers: [], results: {}, runs: 0 });

const CHANNEL = "Tests";

export function onTestsSnapshot(controllers: TestCtl[]) {
  useTests.setState({ controllers });
}

export function onTestRun(p: { runId: number; key: string | null; state: string; message?: string; duration?: number; text?: string; name?: string | null }) {
  if (p.state === "begin") {
    useTests.setState((s) => ({ runs: s.runs + 1 }));
    logOutput(CHANNEL, `▶ ${p.name ?? "Test run"}\n`);
    return;
  }
  if (p.state === "end") {
    useTests.setState((s) => ({ runs: Math.max(0, s.runs - 1) }));
    const r = Object.values(useTests.getState().results);
    logOutput(CHANNEL, `■ ${tl("{p} lulus, {f} gagal, {s} dilewati", { p: r.filter((x) => x.state === "passed").length, f: r.filter((x) => x.state === "failed" || x.state === "errored").length, s: r.filter((x) => x.state === "skipped").length })}\n`);
    return;
  }
  if (p.state === "output") {
    if (p.text) logOutput(CHANNEL, p.text.replace(/\r\n/g, "\n"));
    return;
  }
  if (!p.key) return;
  useTests.setState((s) => ({ results: { ...s.results, [p.key!]: { state: p.state as TestState, message: p.message, duration: p.duration } } }));
  if (p.message) logOutput(CHANNEL, `✗ ${p.key.split("/").pop()}: ${p.message}\n`);
}

/** Bersihkan hasil item yang akan dijalankan (dan turunannya), lalu minta host menjalankan. */
export async function runTests(ctl: string, keys: string[] = [], kind = 1) {
  useTests.setState((s) => {
    const results = { ...s.results };
    for (const k of Object.keys(results)) if (!keys.length ? k.startsWith(`${ctl}/`) : keys.some((x) => k === x || k.startsWith(`${x}/`))) delete results[k];
    return { results };
  });
  await hostCall("tests/run", { ctl, keys, kind });
}

export async function resolveTests(key: string | null, ctl?: string) {
  const snap = await hostCall<TestCtl[]>("tests/resolve", { key, ctl }).catch(() => null);
  if (snap) onTestsSnapshot(snap);
}

export async function refreshTests(ctl: string) {
  const snap = await hostCall<TestCtl[]>("tests/refresh", { ctl }).catch(() => null);
  if (snap) onTestsSnapshot(snap);
}

export const cancelTests = () => hostNotify("tests/cancel");

/** Status gabungan item: gagal bila ada turunan yang gagal, dst. */
export function aggregate(node: TestNode, results: Record<string, TestResult>): TestState | undefined {
  const own = results[node.key]?.state;
  if (!node.children.length) return own;
  const kids = node.children.map((c) => aggregate(c, results)).filter(Boolean) as TestState[];
  for (const s of ["running", "queued", "failed", "errored", "passed", "skipped"] as TestState[]) if (own === s || kids.includes(s)) return s;
  return own;
}
