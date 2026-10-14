import { Suspense, lazy, useEffect } from "react";
import * as A from "./app/actions";
import { handleGlobalKey } from "./app/commands";
import { restoreAll } from "./app/persist";
import { detectClaude } from "./claude/claude";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { designById } from "./design/designs";
import { ContextMenuHost, DialogHost, Toasts } from "./components/Overlays";
import { api, call, confirmWindowClose, isDemo, on, pathForFile } from "./lib/ipc";
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
      void restoreAll().then(() => import("./extensions/registry").then((m) => m.loadExtensions()));
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
    // Main process menahan penutupan dan bertanya ke sini dulu.
    let closing = false;
    offs.push(
      on("window-close-requested", async () => {
        if (closing) return;
        closing = true;
        try {
          const dirty = Object.values(getState().tabs).filter((t) => t.dirty);
          const running = getState().terminals.filter((t) => t.status === "running" && t.kind !== "shell");
          if (dirty.length && !(await A.closeAllTabs())) return;
          if (running.length) {
            const r = await ask({ kind: "confirm", title: `${running.length} proses masih berjalan`, message: running.map((t) => t.title).join(", ") + " akan dihentikan.", okLabel: "Hentikan & keluar", danger: true });
            if (r !== true) return;
          }
          await confirmWindowClose();
        } finally {
          closing = false;
        }
      })
    );
    // Dibuka dari Finder ("Open With"), dock, atau baris perintah.
    offs.push(
      on<{ path: string }>("open-path", async ({ path }) => {
        if (await call<boolean>("path_is_dir", { path }).catch(() => false)) await A.openProject(path);
        else await A.openFile(path);
      })
    );

    // Seret folder/berkas dari Finder ke jendela (tree internal memakai tipe data lain).
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      for (const f of [...(e.dataTransfer.files ?? [])]) {
        const p = pathForFile(f);
        if (!p) continue;
        if (await call<boolean>("path_is_dir", { path: p }).catch(() => false)) {
          await A.openProject(p);
          break;
        }
        await A.openFile(p);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    const offClose = () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };

    return () => {
      window.removeEventListener("keydown", handleGlobalKey, true);
      window.removeEventListener("contextmenu", onCtx);
      offs.forEach((o) => void o.then((f) => f()));
      clearTimeout(powerTimer);
      unsub();
      offClose();
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
