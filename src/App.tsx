import { Suspense, lazy, useEffect } from "react";
import * as A from "./app/actions";
import { handleGlobalKey } from "./app/commands";
import { restoreAll } from "./app/persist";
import { detectClaude } from "./claude/claude";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { designById } from "./design/designs";
import { ContextMenuHost, DialogHost, Toasts } from "./components/Overlays";
import { api, isDemo, on, windowApi } from "./lib/ipc";
import { CommandPalette } from "./panels/CommandPalette";
import { ask, getState, isSaver, setState, useStore } from "./state/store";

const AuroraShell = lazy(() => import("./shells/AuroraShell"));
const ZenShell = lazy(() => import("./shells/ZenShell"));
const ControlShell = lazy(() => import("./shells/ControlShell"));
const CompareModal = lazy(() => import("./panels/compare").then((m) => ({ default: m.CompareModal })));
const SnapshotDialog = lazy(() => import("./panels/SnapshotDialog").then((m) => ({ default: m.SnapshotDialog })));

let booted = false;

function useBackgroundTasks() {
  useEffect(() => {
    // StrictMode menjalankan effect dua kali di dev; pemulihan sesi cukup sekali.
    if (!booted) {
      booted = true;
      void restoreAll();
      void detectClaude();
      // Muat semua shell di latar supaya ganti desain pertama kali tidak berkedip.
      setTimeout(() => {
        void import("./shells/AuroraShell");
        void import("./shells/ZenShell");
        void import("./shells/ControlShell");
      }, 1500);
    }

    window.addEventListener("keydown", handleGlobalKey, true);
    // Cegah menu konteks bawaan WebKit (Reload, Inspect) di luar elemen yang punya menu sendiri.
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("input, textarea, .cm-content, .xterm, .md-preview, .chat-md")) e.preventDefault();
    };
    window.addEventListener("contextmenu", onCtx);

    const offs: Promise<() => void>[] = [];
    offs.push(on<{ root: string; paths: string[]; git: boolean }>("fs-changed", (p) => p.root === getState().root && void A.onFsChanged(p.paths, p.git)));

    // Status baterai untuk mode hemat daya otomatis.
    let powerTimer = 0;
    const pollPower = async () => {
      const prevSaver = isSaver();
      try {
        setState({ power: await api.power() });
      } catch {
        /* bukan MacBook / pmset tidak tersedia */
      }
      const saver = isSaver();
      document.documentElement.dataset.power = saver ? "saver" : "normal";
      if (saver !== prevSaver) {
        void import("./editor/documents").then((d) => d.applyEditorSettings());
        const root = getState().root;
        if (root) void api.watch(root, saver ? 1500 : 300).catch(() => {});
      }
      powerTimer = window.setTimeout(pollPower, saver ? 120_000 : 60_000);
    };
    void pollPower();
    const unsub = useStore.subscribe((s, p) => {
      if (s.settings.powerMode !== p.settings.powerMode) {
        clearTimeout(powerTimer);
        void pollPower();
      }
    });

    // Jangan kehilangan editan saat jendela ditutup (⌘Q / tombol merah).
    let offClose: (() => void) | null = null;
    void windowApi().then(async (win) => {
      if (!win) return;
      offClose = await win.onCloseRequested(async (e) => {
        const dirty = Object.values(getState().tabs).filter((t) => t.dirty);
        const running = getState().terminals.filter((t) => t.status === "running" && t.kind !== "shell");
        if (!dirty.length && !running.length) return;
        e.preventDefault();
        if (dirty.length) {
          const ok = await A.closeAllTabs();
          if (!ok) return;
        }
        if (running.length) {
          const r = await ask({ kind: "confirm", title: `${running.length} proses masih berjalan`, message: running.map((t) => t.title).join(", ") + " akan dihentikan.", okLabel: "Hentikan & keluar", danger: true });
          if (r !== true) return;
        }
        await win.destroy();
      });
      // Seret folder/berkas dari Finder ke jendela.
      const wv = await import("@tauri-apps/api/webview").then((m) => m.getCurrentWebview());
      const offDrop = await wv.onDragDropEvent(async (ev) => {
        if (ev.payload.type !== "drop") return;
        for (const p of ev.payload.paths) {
          const entries = await api.listDir(p).then(() => true).catch(() => false);
          if (entries) {
            await A.openProject(p);
            break;
          } else await A.openFile(p);
        }
      });
      const prev = offClose;
      offClose = () => {
        prev?.();
        offDrop();
      };
    });

    return () => {
      window.removeEventListener("keydown", handleGlobalKey, true);
      window.removeEventListener("contextmenu", onCtx);
      offs.forEach((o) => void o.then((f) => f()));
      clearTimeout(powerTimer);
      unsub();
      offClose?.();
    };
  }, []);
}

export default function App() {
  useBackgroundTasks();
  const ready = useStore((s) => s.ready);
  const design = useStore((s) => s.settings.design);
  const compare = useStore((s) => !!s.compare);
  const snapshot = useStore((s) => s.snapshotOpen);
  const shell = designById(design).shell;
  const Shell = shell === "zen" ? ZenShell : shell === "control" ? ControlShell : AuroraShell;
  return (
    <>
      {isDemo && <div className="demo-ribbon">Pratinjau browser</div>}
      {ready ? (
        <ErrorBoundary label="Tampilan mengalami error" onReset={() => A.resetLayout()}>
          <Suspense fallback={<div className="boot" />}>
            <Shell />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <div className="boot" aria-busy="true" />
      )}
      <CommandPalette />
      <DialogHost />
      <ContextMenuHost />
      <Toasts />
      <Suspense fallback={null}>
        {compare && <CompareModal />}
        {snapshot && <SnapshotDialog />}
      </Suspense>
    </>
  );
}
