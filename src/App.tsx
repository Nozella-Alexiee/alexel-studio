import { Suspense, lazy, useEffect } from "react";
import * as A from "./app/actions";
import { handleGlobalKey } from "./app/commands";
import { restoreAll } from "./app/persist";
import { detectAgent, detectClaude } from "./claude/claude";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { designById } from "./design/designs";
import { ContextMenuHost, DialogHost, Toasts } from "./components/Overlays";
import { TourHost } from "./components/Tour";
import { api, call, confirmWindowClose, isDemo, on, pathForFile } from "./lib/ipc";
import { CommandPalette } from "./panels/CommandPalette";
import { QuickPickHost } from "./panels/QuickPick";
import { IdeDiffHost } from "./panels/IdeDiff";
import { ask, getState, isSaver, setState, useStore } from "./state/store";
import { tl } from "./i18n";

const AuroraShell = lazy(() => import("./shells/AuroraShell"));
const ZenShell = lazy(() => import("./shells/ZenShell"));
const ControlShell = lazy(() => import("./shells/ControlShell"));
const StudioShell = lazy(() => import("./shells/StudioShell"));
const CompareModal = lazy(() => import("./panels/compare").then((m) => ({ default: m.CompareModal })));
const SnapshotDialog = lazy(() => import("./panels/SnapshotDialog").then((m) => ({ default: m.SnapshotDialog })));

let booted = false;

function useBackgroundTasks() {
  useEffect(() => {
    // StrictMode menjalankan effect dua kali di dev; pemulihan sesi cukup sekali.
    if (!booted) {
      booted = true;
      void restoreAll().then(() => {
        void import("./extensions/registry").then((m) => m.loadExtensions()).then(() => import("./exthost/boot")).then((b) => b.bootExtHost());
        void import("./ide/ide").then((m) => m.bootIde());
        void detectAgent(getState().settings.agent);
        // Cek pembaruan sekali sehari (bisa dimatikan di Pengaturan).
        try {
          const last = Number(localStorage.getItem("as.updateChecked") || 0);
          if (getState().settings.updateCheck && Date.now() - last > 86_400_000) {
            localStorage.setItem("as.updateChecked", String(Date.now()));
            setTimeout(() => void A.checkForUpdates(false), 8000);
          }
        } catch {
          /* localStorage tidak tersedia */
        }
        if (getState().settings.agent !== "claude") void detectClaude();
      });
      // Muat semua shell di latar supaya ganti desain pertama kali tidak berkedip.
      setTimeout(() => {
        void import("./shells/AuroraShell");
        void import("./shells/ZenShell");
        void import("./shells/ControlShell");
        void import("./shells/StudioShell");
      }, 1500);
    }

    window.addEventListener("keydown", handleGlobalKey, true);
    // Cegah menu konteks bawaan WebKit (Reload, Inspect) di luar elemen yang punya menu sendiri.
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // Editor: menu Nozel sendiri. Kolom teks, terminal, pratinjau: menu bawaan dari main process.
      if (t.closest(".cm-editor")) {
        e.preventDefault();
        void import("./editor/editorMenu").then((m) => m.openEditorMenu(e));
        return;
      }
      if (t.closest(".selectable")) {
        void import("./components/textMenu").then((m) => m.openTextMenu(e));
        e.preventDefault();
        return;
      }
      if (!t.closest("input, textarea, .xterm, .md-preview, .chat-md")) e.preventDefault();
    };
    window.addEventListener("contextmenu", onCtx);
    void import("./app/menus").then((m) => m.initMenus());

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
    // Simpan otomatis "saat pindah": tab lain dibuka atau jendela kehilangan fokus.
    const saveDirty = (only?: string | null) => {
      if (getState().settings.autoSave !== "focus") return;
      for (const t of Object.values(getState().tabs)) if (t.dirty && t.kind === "text" && (!only || t.id === only)) void import("./editor/documents").then((d) => d.saveDocument(t.id, { quiet: true }));
    };
    const onBlur = () => saveDirty();
    window.addEventListener("blur", onBlur);
    const unsub = useStore.subscribe((s, p) => {
      if (s.settings.powerMode !== p.settings.powerMode) {
        clearTimeout(powerTimer);
        void pollPower();
      }
      const prevActive = p.groups[p.focusedGroup]?.active;
      if (prevActive && prevActive !== s.groups[s.focusedGroup]?.active) saveDirty(prevActive);
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
            const r = await ask({ kind: "confirm", title: tl("{n} proses masih berjalan", { n: running.length }), message: tl("{list} akan dihentikan.", { list: running.map((t) => t.title).join(", ") }), okLabel: tl("Hentikan & keluar"), danger: true });
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
      window.removeEventListener("blur", onBlur);
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
  const Shell = shell === "studio" ? StudioShell : shell === "zen" ? ZenShell : shell === "control" ? ControlShell : AuroraShell;
  return (
    <>
      {isDemo && <div className="demo-ribbon">{tl("Pratinjau browser")}</div>}
      {ready ? (
        <ErrorBoundary label={tl("Tampilan mengalami error")} onReset={() => A.resetLayout()}>
          <Suspense fallback={<div className="boot" />}>
            <Shell />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <div className="boot" aria-busy="true" />
      )}
      <CommandPalette />
      <QuickPickHost />
      <IdeDiffHost />
      <DialogHost />
      <ContextMenuHost />
      <Toasts />
      <TourHost />
      <Suspense fallback={null}>
        {compare && <CompareModal />}
        {snapshot && <SnapshotDialog />}
      </Suspense>
    </>
  );
}
