// Testing API VS Code (vscode.tests): controller, pohon TestItem, profil run, dan TestRun.
// Pohon dikirim ke renderer sebagai snapshot (`ui/tests`, ditunda sedikit supaya perubahan beruntun
// jadi satu); hasil run dikirim per peristiwa (`ui/testRun`). Renderer meminta resolve/run lewat
// `tests/resolve` dan `tests/run`.

import type { HostCtx } from "./context";
import * as T from "./types";
import type { Uri } from "./uri";
import * as C from "./convert";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Item {
  id: string;
  label: string;
  uri?: Uri;
  range?: T.Range;
  description?: string;
  error?: string | T.MarkdownString;
  busy: boolean;
  canResolveChildren: boolean;
  sortText?: string;
  tags: unknown[];
  parent?: Item;
  children: Collection;
  __ctl: string;
}

interface Collection {
  readonly size: number;
  add(i: Item): void;
  delete(id: string): void;
  get(id: string): Item | undefined;
  replace(items: readonly Item[]): void;
  forEach(cb: (i: Item, c: Collection) => void): void;
  [Symbol.iterator](): IterableIterator<[string, Item]>;
}

interface Profile {
  label: string;
  kind: number;
  isDefault: boolean;
  runHandler: (req: T.TestRunRequest, token: unknown) => unknown;
  tag?: unknown;
  dispose(): void;
}

interface Ctl {
  id: string;
  label: string;
  items: Collection;
  profiles: Profile[];
  resolveHandler?: (item: Item | undefined) => unknown;
  refreshHandler?: (token: unknown) => unknown;
}

export interface WireTestItem {
  key: string;
  id: string;
  label: string;
  uri?: string;
  range?: C.JRange;
  description?: string;
  error?: string;
  busy: boolean;
  canResolveChildren: boolean;
  children: WireTestItem[];
}

const controllers = new Map<string, Ctl>();
/** Kunci stabil item: id controller + id leluhur. */
const keyOf = (i: Item): string => (i.parent ? `${keyOf(i.parent)}/${i.id}` : `${i.__ctl}/${i.id}`);
const byKey = new Map<string, Item>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let hostCtx: HostCtx | null = null;
let runSeq = 0;

function schedule() {
  if (notifyTimer || !hostCtx) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    hostCtx?.rpc.notify("ui/tests", { controllers: snapshot() });
  }, 60);
}

function wire(i: Item): WireTestItem {
  const key = keyOf(i);
  byKey.set(key, i);
  const children = [...i.children].map(([, c]) => wire(c)).sort((a, b) => (byKey.get(a.key)?.sortText ?? a.label).localeCompare(byKey.get(b.key)?.sortText ?? b.label));
  const err = i.error === undefined ? undefined : typeof i.error === "string" ? i.error : i.error.value;
  return { key, id: i.id, label: i.label, uri: i.uri?.toString(), range: i.range ? C.range(i.range) : undefined, description: i.description, error: err, busy: i.busy, canResolveChildren: i.canResolveChildren, children };
}

export function snapshot() {
  byKey.clear();
  return [...controllers.values()].map((c) => ({ id: c.id, label: c.label, profiles: c.profiles.map((p) => ({ label: p.label, kind: p.kind, isDefault: p.isDefault })), canRefresh: !!c.refreshHandler, items: [...c.items].map(([, i]) => wire(i)) }));
}

function collection(ctl: string, owner?: Item): Collection {
  const m = new Map<string, Item>();
  const adopt = (i: Item) => {
    i.parent = owner;
    i.__ctl = ctl;
  };
  return {
    get size() {
      return m.size;
    },
    add(i) {
      adopt(i);
      m.set(i.id, i);
      schedule();
    },
    delete(id) {
      m.delete(id);
      schedule();
    },
    get: (id) => m.get(id),
    replace(items) {
      m.clear();
      for (const i of items) {
        adopt(i);
        m.set(i.id, i);
      }
      schedule();
    },
    forEach(cb) {
      for (const i of m.values()) cb(i, this);
    },
    [Symbol.iterator]: () => m.entries(),
  };
}

/** Properti item yang berubah → kirim ulang snapshot. */
function observable(i: Item): Item {
  return new Proxy(i, {
    set(t, p, v) {
      (t as Any)[p] = v;
      if (typeof p === "string" && !p.startsWith("__") && p !== "parent") schedule();
      return true;
    },
  });
}

export function createTestController(hc: HostCtx, id: string, label: string) {
  hostCtx = hc;
  const ctl: Ctl = { id, label, items: collection(id), profiles: [] };
  controllers.set(id, ctl);
  schedule();
  const api = {
    id,
    get label() {
      return ctl.label;
    },
    set label(v: string) {
      ctl.label = v;
      schedule();
    },
    items: ctl.items,
    get resolveHandler() {
      return ctl.resolveHandler;
    },
    set resolveHandler(f) {
      ctl.resolveHandler = f;
    },
    get refreshHandler() {
      return ctl.refreshHandler;
    },
    set refreshHandler(f) {
      ctl.refreshHandler = f;
      schedule();
    },
    createTestItem(itemId: string, itemLabel: string, uri?: Uri): Item {
      const raw: Item = { id: itemId, label: itemLabel, uri, busy: false, canResolveChildren: false, tags: [], children: null as unknown as Collection, __ctl: id };
      const item = observable(raw);
      raw.children = collection(id, item);
      return item;
    },
    createRunProfile(profileLabel: string, kind: number, runHandler: Profile["runHandler"], isDefault = false, tag?: unknown) {
      const p: Profile = {
        label: profileLabel,
        kind,
        isDefault,
        runHandler,
        tag,
        dispose() {
          ctl.profiles = ctl.profiles.filter((x) => x !== p);
          schedule();
        },
      };
      ctl.profiles.push(p);
      schedule();
      return p;
    },
    createTestRun(request: T.TestRunRequest, name?: string, _persist = true) {
      return createRun(hc, request, name);
    },
    invalidateTestResults() {},
    dispose() {
      controllers.delete(id);
      schedule();
    },
  };
  return api;
}

function messageText(m: unknown): string {
  const list = Array.isArray(m) ? m : [m];
  return list
    .map((x: Any) => {
      if (!x) return "";
      const msg = typeof x.message === "string" ? x.message : x.message?.value ?? String(x);
      return x.expectedOutput !== undefined ? `${msg}\nexpected: ${x.expectedOutput}\nactual:   ${x.actualOutput}` : msg;
    })
    .join("\n");
}

function createRun(hc: HostCtx, request: T.TestRunRequest, name?: string) {
  const runId = ++runSeq;
  const cts = new T.CancellationTokenSource();
  const ended = new T.EventEmitter<void>();
  const send = (item: Item | undefined, state: string, extra: Record<string, unknown> = {}) => hc.rpc.notify("ui/testRun", { runId, key: item ? keyOf(item) : null, state, ...extra });
  send(undefined, "begin", { name: name ?? null });
  runs.set(runId, cts);
  return {
    name,
    token: cts.token,
    isPersisted: true,
    enqueued: (i: Item) => send(i, "queued"),
    started: (i: Item) => send(i, "running"),
    skipped: (i: Item) => send(i, "skipped"),
    passed: (i: Item, duration?: number) => send(i, "passed", { duration }),
    failed: (i: Item, message: unknown, duration?: number) => send(i, "failed", { duration, message: messageText(message) }),
    errored: (i: Item, message: unknown, duration?: number) => send(i, "errored", { duration, message: messageText(message) }),
    appendOutput: (text: string, _loc?: unknown, i?: Item) => send(i, "output", { text: String(text) }),
    addCoverage() {},
    end() {
      runs.delete(runId);
      send(undefined, "end");
      ended.fire();
    },
    onDidDispose: ended.event,
    _request: request,
  };
}

const runs = new Map<number, T.CancellationTokenSource>();

/** Permintaan renderer: muat anak item (atau akar bila key kosong). */
export async function resolveTests(key: string | null, ctlId?: string) {
  if (!key) {
    for (const c of controllers.values()) if (!ctlId || c.id === ctlId) await c.resolveHandler?.(undefined);
    return snapshot();
  }
  const item = byKey.get(key);
  const c = item ? controllers.get(item.__ctl) : undefined;
  if (item && c?.resolveHandler) await c.resolveHandler(item);
  return snapshot();
}

export async function refreshTests(ctlId: string) {
  const c = controllers.get(ctlId);
  if (c?.refreshHandler) await c.refreshHandler(new T.CancellationTokenSource().token);
  else await c?.resolveHandler?.(undefined);
  return snapshot();
}

/** Jalankan item tertentu (atau semua di controller) dengan profil jenis `kind` (bawaan Run). */
export async function runTests(ctlId: string, keys: string[], kind = 1) {
  const c = controllers.get(ctlId);
  if (!c) throw new Error("Controller test tidak ada.");
  const profile = c.profiles.find((p) => p.kind === kind && p.isDefault) ?? c.profiles.find((p) => p.kind === kind) ?? c.profiles[0];
  if (!profile) throw new Error("Ekstensi ini tidak punya profil untuk menjalankan test.");
  const include = keys.length ? keys.map((k) => byKey.get(k)).filter((x): x is Item => !!x) : undefined;
  const req = new T.TestRunRequest(include, [], profile);
  const cts = new T.CancellationTokenSource();
  await profile.runHandler(req, cts.token);
}

export function cancelRuns() {
  for (const c of runs.values()) c.cancel();
}

export const testControllerCount = () => controllers.size;
