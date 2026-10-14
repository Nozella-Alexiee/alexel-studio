import React, { useState, useEffect, useCallback } from "react";
import {
  ClaudeCliInfo,
  EditorTab,
  FileEntry,
  ModalPrompt,
  SystemFootprint,
  ThemeMode,
  UnsavedConfirmState,
  GitStatus,
  GitPushResult,
  CodeProblem,
  CodeRunResult,
  TerminalHistoryEntry,
} from "./types";
import {
  openFolderDialog,
  listDirectory,
  readFileText,
  writeFileText,
  createFile,
  createDir,
  deleteEntry,
  checkClaudeCli,
  launchClaudeTerminal,
  runClaudeCliPrint,
  getSystemFootprint,
  gitGetStatus,
  gitAutoCommitAndPush,
  isImageFile,
  readFileImage,
  executeCodeRun,
  executeTerminalCommand,
} from "./services/tauriService";
import { TitleBar } from "./components/TitleBar";
import { ActivityBar, ActivityTab } from "./components/ActivityBar";
import { FileTree } from "./components/FileTree";
import { GitBotPanel } from "./components/GitBotPanel";
import { ProblemsPanel, PanelTab } from "./components/ProblemsPanel";
import { TabBar } from "./components/TabBar";
import { EditorArea } from "./components/EditorArea";
import { StatusBar } from "./components/StatusBar";
import { ClaudeCompanionPanel } from "./components/ClaudeCompanionPanel";
import { UnsavedDialog } from "./components/UnsavedDialog";
import { NewItemModal } from "./components/NewItemModal";
import { NotificationToast, ToastMessage } from "./components/NotificationToast";
import { detectLanguage } from "./utils/editorLanguage";
import "./styles/theme.css";

export const App: React.FC = () => {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [activityTab, setActivityTab] = useState<ActivityTab>("explorer");
  const [mascotMessage, setMascotMessage] = useState<string | null>(null);
  const [isClaudePanelOpen, setIsClaudePanelOpen] = useState(false);
  const [claudeInfo, setClaudeInfo] = useState<ClaudeCliInfo | undefined>(undefined);
  const [footprint, setFootprint] = useState<SystemFootprint | undefined>(undefined);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Git Bot states
  const [gitStatus, setGitStatus] = useState<GitStatus | undefined>(undefined);
  const [autoPushEnabled, setAutoPushEnabled] = useState<boolean>(() => {
    return localStorage.getItem("nozel_auto_git") === "true";
  });
  const [isGitLoading, setIsGitLoading] = useState<boolean>(false);

  // Diagnostics & Code Linter states
  const [activeProblems, setActiveProblems] = useState<CodeProblem[]>([]);
  const [isProblemsPanelOpen, setIsProblemsPanelOpen] = useState<boolean>(false);
  const [jumpToLine, setJumpToLine] = useState<{ line: number; col: number; token: number } | undefined>(undefined);

  // Code Runner & Terminal states
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [terminalHistory, setTerminalHistory] = useState<TerminalHistoryEntry[]>([]);
  const [panelTab, setPanelTab] = useState<PanelTab>("problems");

  const [unsavedState, setUnsavedState] = useState<UnsavedConfirmState>({
    isOpen: false,
  });

  const [modalPrompt, setModalPrompt] = useState<ModalPrompt>({
    isOpen: false,
    title: "",
    type: "file",
    targetDirPath: "",
  });

  const addToast = (type: "error" | "success" | "info", message: string) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Initial footprint and Claude Code CLI check
  const refreshClaudeCli = useCallback(async () => {
    try {
      const info = await checkClaudeCli();
      setClaudeInfo(info);
    } catch (err) {
      console.warn("Claude CLI check error:", err);
    }
  }, []);

  const refreshFootprint = useCallback(async () => {
    try {
      const stats = await getSystemFootprint();
      setFootprint(stats);
    } catch (err) {
      console.warn("Footprint check error:", err);
    }
  }, []);

  // Git status refresh
  const refreshGitStatus = useCallback(async () => {
    if (!projectPath) return;
    try {
      const status = await gitGetStatus(projectPath);
      setGitStatus(status);
    } catch (err) {
      console.warn("Git status refresh error:", err);
    }
  }, [projectPath]);

  useEffect(() => {
    refreshClaudeCli();
    refreshFootprint();

    const interval = setInterval(() => {
      refreshFootprint();
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshClaudeCli, refreshFootprint]);

  useEffect(() => {
    if (projectPath) {
      refreshGitStatus();
    }
  }, [projectPath, refreshGitStatus]);

  // Apply theme to document attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Support preview states via URL parameters (e.g. ?view=editor, ?view=claude, ?view=light, ?view=git, ?view=problems, ?view=unsaved)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (!view || view === "welcome") return;

    const demoPath = "/Users/demo/nozel-project";
    setProjectPath(demoPath);
    listDirectory(demoPath).then(async (rootEntries) => {
      const updatedTree = await Promise.all(
        rootEntries.map(async (entry) => {
          if (entry.name === "src") {
            const srcChildren = await listDirectory(entry.path);
            const nested = await Promise.all(
              srcChildren.map(async (child) => {
                if (child.name === "services") {
                  const servicesFiles = await listDirectory(child.path);
                  return { ...child, isOpen: true, children: servicesFiles };
                }
                return child;
              })
            );
            return { ...entry, isOpen: true, children: nested };
          }
          return entry;
        })
      );
      setFileTree(updatedTree);

      const indexPath = "/Users/demo/nozel-project/src/services/index.tsx";
      const phpPath = "/Users/demo/nozel-project/src/server.php";
      const htmlPath = "/Users/demo/nozel-project/index.html";
      const cssPath = "/Users/demo/nozel-project/style.css";
      const apiPath = "/Users/demo/nozel-project/src/api.rs";
      const pyPath = "/Users/demo/nozel-project/src/analyze.py";
      const readmePath = "/Users/demo/nozel-project/README.md";
      const logoPath = "/Users/demo/nozel-project/logo.png";

      const [indexCode, phpCode, htmlCode, cssCode, apiCode, pyCode, readmeCode, logoData] = await Promise.all([
        readFileText(indexPath).catch(() => ""),
        readFileText(phpPath).catch(() => ""),
        readFileText(htmlPath).catch(() => ""),
        readFileText(cssPath).catch(() => ""),
        readFileText(apiPath).catch(() => ""),
        readFileText(pyPath).catch(() => ""),
        readFileText(readmePath).catch(() => "# Nozel Code ⚡\n\nUltra-lightweight macOS code editor."),
        readFileImage(logoPath).catch(() => ({ data_url: "", size_bytes: 42800, format: "png" })),
      ]);

      const isUnsaved = view === "unsaved";
      const tab1: EditorTab = {
        id: indexPath,
        path: indexPath,
        name: "index.tsx",
        content: isUnsaved ? indexCode + "\n// Unsaved modification" : indexCode,
        initialContent: indexCode,
        isDirty: isUnsaved,
        language: "typescript",
        line: 24,
        col: 18,
      };

      const tabPhp: EditorTab = {
        id: phpPath,
        path: phpPath,
        name: "server.php",
        content: phpCode,
        initialContent: phpCode,
        isDirty: false,
        language: "php",
        line: 14,
        col: 1,
      };

      const tabMd: EditorTab = {
        id: readmePath,
        path: readmePath,
        name: "README.md",
        content: readmeCode,
        initialContent: readmeCode,
        isDirty: false,
        language: "markdown",
        line: 1,
        col: 1,
      };

      const tabImg: EditorTab = {
        id: logoPath,
        path: logoPath,
        name: "logo.png",
        content: "",
        initialContent: "",
        isDirty: false,
        language: "image",
        line: 1,
        col: 1,
        isImage: true,
        imageData: logoData,
      };

      const tab2: EditorTab = {
        id: htmlPath,
        path: htmlPath,
        name: "index.html",
        content: htmlCode,
        initialContent: htmlCode,
        isDirty: false,
        language: "html",
        line: 1,
        col: 1,
      };

      const tab3: EditorTab = {
        id: cssPath,
        path: cssPath,
        name: "style.css",
        content: cssCode,
        initialContent: cssCode,
        isDirty: false,
        language: "css",
        line: 1,
        col: 1,
      };

      const tab4: EditorTab = {
        id: apiPath,
        path: apiPath,
        name: "api.rs",
        content: apiCode,
        initialContent: apiCode,
        isDirty: false,
        language: "rust",
        line: 1,
        col: 1,
      };

      const tab5: EditorTab = {
        id: pyPath,
        path: pyPath,
        name: "analyze.py",
        content: pyCode,
        initialContent: pyCode,
        isDirty: false,
        language: "python",
        line: 1,
        col: 1,
      };

      setTabs([tab1, tabMd, tabImg, tabPhp, tab2, tab3, tab4, tab5]);
      if (view === "php") setActiveTabId(tabPhp.id);
      else if (view === "image" || view === "img") setActiveTabId(tabImg.id);
      else if (view === "markdown" || view === "md") setActiveTabId(tabMd.id);
      else setActiveTabId(tab1.id);

      // Populate mock Git status for demo
      setGitStatus({
        is_git_repo: true,
        branch: "main",
        has_changes: true,
        modified_count: 2,
        untracked_count: 1,
        changed_files: ["src/services/index.tsx", "style.css", "analyze.py"],
      });

      if (params.get("theme") === "light" || view === "light") {
        setTheme("light");
      }

      if (view === "claude") {
        setIsClaudePanelOpen(true);
      } else if (view === "git") {
        setActivityTab("git");
        setAutoPushEnabled(true);
      } else if (view === "problems") {
        setIsProblemsPanelOpen(true);
        setActiveProblems([
          { line: 12, col: 5, message: "Unmatched opening bracket '{'", severity: "error" },
          { line: 24, col: 18, message: "Unterminated string literal", severity: "error" },
          { line: 36, col: 2, message: "Expected closing tag </header>", severity: "warning" },
        ]);
      } else if (view === "unsaved") {
        setUnsavedState({
          isOpen: true,
          tabId: tab1.id,
          fileName: tab1.name,
          filePath: tab1.path,
        });
      } else if (view === "newfile") {
        setModalPrompt({
          isOpen: true,
          title: "New File",
          type: "file",
          targetDirPath: demoPath,
        });
      } else if (view === "html" || view === "web") {
        setActiveTabId(tab2.id);
        setIsProblemsPanelOpen(true);
        setPanelTab("output");
        setRunResult({
          success: true,
          stdout: "🌐 [Web Browser Preview Launched]\n✅ Berhasil dibuka di default web browser macOS (Google Chrome / Safari)!\n📄 Dokumen: index.html\n🔗 URL: file:///Users/demo/nozel-project/index.html\n⚡ Project HTML, CSS, & JavaScript aktif dan siap diuji di browser!\n",
          stderr: "",
          exit_code: 0,
          execution_time_ms: 16,
          command: 'open "/Users/demo/nozel-project/index.html"',
        });
      } else if (view === "run" || view === "output") {
        setIsProblemsPanelOpen(true);
        setPanelTab("output");
        setActiveTabId(tabPhp.id);
        setRunResult({
          success: true,
          stdout: "🚀 [Nozel Code] Microservice running on Apple Silicon M1\n⚡ Status: Online | Timestamp: 2026-10-14 12:00:00 | RAM: 0.42 MB\n✅ Server port 8080 ready to accept client connections.\n",
          stderr: "",
          exit_code: 0,
          execution_time_ms: 38,
          command: 'php "/Users/demo/nozel-project/src/server.php"',
        });
      } else if (view === "terminal") {
        setIsProblemsPanelOpen(true);
        setPanelTab("terminal");
        setTerminalHistory([
          {
            id: "1",
            command: "pwd",
            timestamp: Date.now() - 5000,
            result: {
              success: true,
              stdout: "/Users/demo/nozel-project\n",
              stderr: "",
              exit_code: 0,
              execution_time_ms: 5,
              command: "pwd",
            },
          },
          {
            id: "2",
            command: "ls -la",
            timestamp: Date.now() - 2000,
            result: {
              success: true,
              stdout: "total 64\ndrwxr-xr-x   8 mac  staff   256 Oct 14 11:50 .\ndrwxr-xr-x   4 mac  staff   128 Oct 14 11:50 ..\n-rw-r--r--   1 mac  staff  1466 Oct 14 11:50 package.json\ndrwxr-xr-x   6 mac  staff   192 Oct 14 11:50 src\n",
              stderr: "",
              exit_code: 0,
              execution_time_ms: 12,
              command: "ls -la",
            },
          },
        ]);
      }
    });
  }, []);

  // Load project directory tree
  const loadDirectory = async (dirPath: string) => {
    try {
      const entries = await listDirectory(dirPath);
      setFileTree(entries);
      await refreshGitStatus();
    } catch (err) {
      addToast("error", `Failed to open directory: ${String(err)}`);
    }
  };

  // Open folder action
  const handleOpenFolder = async () => {
    try {
      const selected = await openFolderDialog();
      if (selected) {
        setProjectPath(selected);
        await loadDirectory(selected);
        setMascotMessage("Folder proyek berhasil dibuka! 📂✨");
      }
    } catch (err) {
      addToast("error", `Error opening folder: ${String(err)}`);
    }
  };

  // Refresh directory tree
  const handleRefreshTree = async () => {
    if (projectPath) {
      await loadDirectory(projectPath);
      addToast("info", "File tree refreshed.");
    }
  };

  // Expand / collapse folder nodes
  const handleToggleDir = async (dir: FileEntry) => {
    const updateTree = async (nodes: FileEntry[]): Promise<FileEntry[]> => {
      const updated: FileEntry[] = [];
      for (const node of nodes) {
        if (node.path === dir.path) {
          const nextIsOpen = !node.isOpen;
          let children = node.children;
          if (nextIsOpen && (!children || children.length === 0)) {
            try {
              children = await listDirectory(node.path);
            } catch (err) {
              console.error("Failed to read subdirectory:", err);
            }
          }
          updated.push({ ...node, isOpen: nextIsOpen, children });
        } else if (node.is_dir && node.children) {
          updated.push({
            ...node,
            children: await updateTree(node.children),
          });
        } else {
          updated.push(node);
        }
      }
      return updated;
    };

    const newTree = await updateTree(fileTree);
    setFileTree(newTree);
  };

  // Open file in editor tab
  const handleSelectFile = async (file: FileEntry) => {
    const existing = tabs.find((t) => t.id === file.path);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    try {
      if (isImageFile(file.name)) {
        const imgData = await readFileImage(file.path);
        const newTab: EditorTab = {
          id: file.path,
          path: file.path,
          name: file.name,
          content: "",
          initialContent: "",
          isDirty: false,
          language: "image",
          line: 1,
          col: 1,
          isImage: true,
          imageData: imgData,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
        setMascotMessage(`Membuka gambar ${file.name}! 🖼️`);
        return;
      }

      const text = await readFileText(file.path);
      const langInfo = detectLanguage(file.name);

      const newTab: EditorTab = {
        id: file.path,
        path: file.path,
        name: file.name,
        content: text,
        initialContent: text,
        isDirty: false,
        language: langInfo.name,
        line: 1,
        col: 1,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      setMascotMessage(`Membuka ${file.name}! Selamat ngoding 💻`);
    } catch (err) {
      addToast("error", `Could not open file: ${String(err)}`);
    }
  };

  // Content change handler
  const handleContentChange = (tabId: string, newContent: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id === tabId) {
          return {
            ...tab,
            content: newContent,
            isDirty: newContent !== tab.initialContent,
          };
        }
        return tab;
      })
    );
  };

  // Cursor change handler
  const handleCursorChange = (tabId: string, line: number, col: number) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id === tabId) {
          return { ...tab, line, col };
        }
        return tab;
      })
    );
  };

  // Manual or automatic commit and push handler
  const handleCommitAndPush = async (customMessage?: string): Promise<GitPushResult | undefined> => {
    if (!projectPath) {
      addToast("info", "Buka folder proyek terlebih dahulu.");
      return undefined;
    }

    setIsGitLoading(true);
    try {
      const res = await gitAutoCommitAndPush(projectPath, customMessage);
      if (res.success) {
        addToast("success", res.message);
        setMascotMessage("Git Push berhasil ke GitHub! 🚀");
      } else {
        addToast(res.message.includes("nothing to commit") ? "info" : "error", res.message);
      }
      await refreshGitStatus();
      return res;
    } catch (err) {
      addToast("error", `Git commit/push error: ${String(err)}`);
      return undefined;
    } finally {
      setIsGitLoading(false);
    }
  };

  // Save tab content (Triggers Auto Git Bot if enabled)
  const handleSaveTab = async (tabToSave?: EditorTab) => {
    const target = tabToSave || tabs.find((t) => t.id === activeTabId);
    if (!target || target.isImage) return;

    try {
      await writeFileText(target.path, target.content);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? { ...t, isDirty: false, initialContent: target.content }
            : t
        )
      );
      addToast("success", `Saved ${target.name}`);
      setMascotMessage("File tersimpan rapi! 🐧✨");

      // Auto Git Bot: Automatic commit & push on Cmd+S
      if (autoPushEnabled && projectPath) {
        setIsGitLoading(true);
        gitAutoCommitAndPush(projectPath, `Auto-save: update ${target.name}`)
          .then((res) => {
            if (res.success) {
              addToast("success", `Git Bot: Pushed ${target.name} ke GitHub 🚀`);
              setMascotMessage("Git Bot: Auto push ke GitHub selesai! 🚀");
            } else if (!res.message.includes("nothing to commit")) {
              addToast("info", `Git Bot: ${res.message}`);
            }
            refreshGitStatus();
          })
          .catch((err) => {
            console.warn("Auto git bot error:", err);
          })
          .finally(() => {
            setIsGitLoading(false);
          });
      } else {
        refreshGitStatus();
      }
    } catch (err) {
      addToast("error", `Failed to save ${target.name}: ${String(err)}`);
    }
  };

  // Run active file handler
  const handleRunActiveFile = async () => {
    const currentActive = tabs.find((t) => t.id === activeTabId);
    if (!currentActive) {
      addToast("info", "Buka file kode terlebih dahulu untuk menjalankannya.");
      return;
    }

    if (currentActive.isImage) {
      addToast("info", "File gambar tidak dapat dieksekusi.");
      return;
    }

    if (currentActive.isDirty) {
      await handleSaveTab(currentActive);
    }

    setIsRunning(true);
    setIsProblemsPanelOpen(true);
    setPanelTab("output");

    try {
      const result = await executeCodeRun(
        currentActive.path,
        projectPath || undefined
      );
      setRunResult(result);
      if (result.success) {
        setMascotMessage(`Kode ${currentActive.name} berhasil dijalankan! ⚡ (${result.execution_time_ms}ms)`);
      } else {
        setMascotMessage(`Eksekusi ${currentActive.name} selesai dengan status exit ${result.exit_code ?? 1}.`);
      }
    } catch (err) {
      const errorMsg = String(err);
      setRunResult({
        success: false,
        stdout: "",
        stderr: errorMsg,
        exit_code: 1,
        execution_time_ms: 0,
        command: `run "${currentActive.path}"`,
      });
      addToast("error", `Gagal mengeksekusi kode: ${errorMsg}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Terminal interactive command execution handler
  const handleExecuteTerminalCommand = async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    if (trimmed === "clear") {
      setTerminalHistory([]);
      return;
    }

    const workingDir = projectPath || "/Users/demo/nozel-project";
    const entryId = Date.now().toString() + Math.random().toString();

    try {
      const res = await executeTerminalCommand(trimmed, workingDir);
      setTerminalHistory((prev) => [
        ...prev,
        {
          id: entryId,
          command: trimmed,
          timestamp: Date.now(),
          result: res,
        },
      ]);
    } catch (err) {
      const res: CodeRunResult = {
        success: false,
        stdout: "",
        stderr: String(err),
        exit_code: 1,
        execution_time_ms: 0,
        command: trimmed,
      };
      setTerminalHistory((prev) => [
        ...prev,
        {
          id: entryId,
          command: trimmed,
          timestamp: Date.now(),
          result: res,
        },
      ]);
    }
  };

  // Close tab with unsaved warning
  const handleCloseTab = (tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const targetTab = tabs.find((t) => t.id === tabId);
    if (!targetTab) return;

    if (targetTab.isDirty) {
      setMascotMessage("Kodinganmu belum disimpan! ⚠️");
      setUnsavedState({
        isOpen: true,
        tabId: targetTab.id,
        filePath: targetTab.path,
        fileName: targetTab.name,
        onSaveAndClose: async () => {
          await handleSaveTab(targetTab);
          closeTabDirectly(targetTab.id);
        },
        onDiscardAndClose: () => {
          closeTabDirectly(targetTab.id);
        },
      });
      return;
    }

    closeTabDirectly(targetTab.id);
  };

  const closeTabDirectly = (tabId: string) => {
    setTabs((prev) => {
      const nextTabs = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const closedIndex = prev.findIndex((t) => t.id === tabId);
        const nextActive =
          nextTabs[closedIndex] || nextTabs[closedIndex - 1] || undefined;
        setActiveTabId(nextActive ? nextActive.id : undefined);
      }
      return nextTabs;
    });
  };

  // Create new file
  const handlePromptNewFile = (targetDir: string) => {
    setModalPrompt({
      isOpen: true,
      title: "New File",
      type: "file",
      targetDirPath: targetDir,
    });
  };

  // Create new folder
  const handlePromptNewFolder = (targetDir: string) => {
    setModalPrompt({
      isOpen: true,
      title: "New Folder",
      type: "folder",
      targetDirPath: targetDir,
    });
  };

  const handleModalSubmit = async (name: string) => {
    const fullPath = `${modalPrompt.targetDirPath}/${name}`;
    try {
      if (modalPrompt.type === "file") {
        await createFile(fullPath);
        addToast("success", `Created file ${name}`);
        await handleRefreshTree();
        handleSelectFile({
          name,
          path: fullPath,
          is_dir: false,
          extension: name.split(".").pop(),
        });
      } else {
        await createDir(fullPath);
        addToast("success", `Created folder ${name}`);
        await handleRefreshTree();
      }
    } catch (err) {
      addToast("error", `Failed to create ${modalPrompt.type}: ${String(err)}`);
    }
  };

  // Delete file or folder
  const handleDeleteEntry = async (entry: FileEntry) => {
    const confirm = window.confirm(
      `Are you sure you want to delete "${entry.name}"?`
    );
    if (!confirm) return;

    try {
      await deleteEntry(entry.path);
      addToast("info", `Deleted ${entry.name}`);
      if (tabs.some((t) => t.id === entry.path)) {
        closeTabDirectly(entry.path);
      }
      await handleRefreshTree();
    } catch (err) {
      addToast("error", `Failed to delete ${entry.name}: ${String(err)}`);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if ((isMod && e.key.toLowerCase() === "r") || e.key === "F5") {
        e.preventDefault();
        handleRunActiveFile();
      } else if (isMod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveTab();
      } else if (isMod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleOpenFolder();
      } else if (isMod && e.key.toLowerCase() === "w") {
        if (activeTabId) {
          e.preventDefault();
          handleCloseTab(activeTabId);
        }
      } else if (isMod && (e.key.toLowerCase() === "j" || (e.shiftKey && e.key.toLowerCase() === "m"))) {
        e.preventDefault();
        setIsProblemsPanelOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, tabs, autoPushEnabled, projectPath, isRunning]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const projectName = projectPath ? projectPath.split("/").pop() : undefined;
  const errorCount = activeProblems.filter((p) => p.severity === "error").length;
  const warningCount = activeProblems.filter((p) => p.severity === "warning").length;

  return (
    <div className="app-container">
      {/* Title Bar (macOS Native Studio) */}
      <TitleBar
        projectName={projectName}
        activeFileName={activeTab?.name}
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        }
        onOpenFolder={handleOpenFolder}
        isClaudePanelOpen={isClaudePanelOpen}
        onToggleClaudePanel={() => setIsClaudePanelOpen((prev) => !prev)}
        onToggleProblemsPanel={() =>
          setIsProblemsPanelOpen((prev) => {
            if (!prev) setPanelTab("problems");
            return !prev;
          })
        }
        footprint={footprint}
      />

      {/* Main Area */}
      <div className="app-main">
        {/* Activity Bar */}
        <ActivityBar
          activeTab={activityTab}
          onSelectTab={(tab) => {
            if (tab === "claude") {
              setIsClaudePanelOpen((prev) => !prev);
              setMascotMessage("Claude Pro siap membantumu! 🚀");
            } else if (tab === "problems") {
              setIsProblemsPanelOpen((prev) => {
                if (!prev) setPanelTab("problems");
                return !prev;
              });
            } else {
              setActivityTab(tab);
            }
          }}
          isClaudeOpen={isClaudePanelOpen}
          onToggleClaude={() => {
            setIsClaudePanelOpen((prev) => !prev);
            if (!isClaudePanelOpen) {
              setMascotMessage("Claude Pro siap bantuin kamu! 🚀");
            }
          }}
          theme={theme}
          onToggleTheme={() =>
            setTheme((prev) => (prev === "dark" ? "light" : "dark"))
          }
          errorCount={errorCount}
          warningCount={warningCount}
        />

        {/* Sidebar: Explorer or Git Bot Panel */}
        {activityTab === "git" ? (
          <GitBotPanel
            gitStatus={gitStatus}
            autoPushEnabled={autoPushEnabled}
            onToggleAutoPush={(enabled) => {
              setAutoPushEnabled(enabled);
              localStorage.setItem("nozel_auto_git", String(enabled));
              addToast("info", enabled ? "Auto Git Bot ON: Cmd+S otomatis Push ke GitHub" : "Auto Git Bot OFF");
            }}
            onRefresh={refreshGitStatus}
            onCommitAndPush={handleCommitAndPush}
            isLoading={isGitLoading}
          />
        ) : (
          <FileTree
            entries={fileTree}
            projectPath={projectPath}
            activeFilePath={activeTab?.path}
            onSelectFile={handleSelectFile}
            onToggleDir={handleToggleDir}
            onOpenFolder={handleOpenFolder}
            onNewFile={handlePromptNewFile}
            onNewFolder={handlePromptNewFolder}
            onRefresh={handleRefreshTree}
            onDeleteEntry={handleDeleteEntry}
            mascotMessage={mascotMessage}
            onClearMascotMessage={() => setMascotMessage(null)}
          />
        )}

        {/* Center: Tabs + Editor + Bottom Problems Panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={(id) => setActiveTabId(id)}
            onCloseTab={handleCloseTab}
            onRunCode={handleRunActiveFile}
            isRunning={isRunning}
          />

          <EditorArea
            activeTab={activeTab}
            theme={theme}
            onContentChange={handleContentChange}
            onCursorChange={handleCursorChange}
            onSave={() => handleSaveTab()}
            onOpenFolder={handleOpenFolder}
            onToggleClaude={() => setIsClaudePanelOpen(true)}
            onDiagnosticsChange={(probs) => setActiveProblems(probs)}
            jumpToLine={jumpToLine}
            problems={activeProblems}
            onRunCode={handleRunActiveFile}
          />

          {/* Clickable Problems & Syntax Linter Panel */}
          {isProblemsPanelOpen && (
            <ProblemsPanel
              problems={activeProblems}
              activeFileName={activeTab?.name}
              onSelectProblem={(line, col) => {
                setJumpToLine({ line, col, token: Date.now() });
              }}
              onClose={() => setIsProblemsPanelOpen(false)}
              runResult={runResult}
              isRunning={isRunning}
              onRerun={handleRunActiveFile}
              onClearOutput={() => setRunResult(null)}
              terminalHistory={terminalHistory}
              onExecuteTerminalCommand={handleExecuteTerminalCommand}
              activeTabOverride={panelTab}
              onTabChange={(tab) => setPanelTab(tab)}
            />
          )}
        </div>

        {/* Claude Code Companion Drawer */}
        <ClaudeCompanionPanel
          claudeInfo={claudeInfo}
          projectPath={projectPath}
          activeTab={activeTab}
          isOpen={isClaudePanelOpen}
          onClose={() => setIsClaudePanelOpen(false)}
          onRefreshCli={refreshClaudeCli}
          onLaunchTerminal={(p) =>
            launchClaudeTerminal(projectPath || "", p)
          }
          onRunCliPrint={(p, c) =>
            runClaudeCliPrint(projectPath || "", p, c)
          }
        />
      </div>

      {/* Status Bar */}
      <StatusBar
        activeTab={activeTab}
        footprint={footprint}
        claudeInfo={claudeInfo}
        onToggleClaude={() => setIsClaudePanelOpen((prev) => !prev)}
        errorCount={errorCount}
        warningCount={warningCount}
        onToggleProblems={() =>
          setIsProblemsPanelOpen((prev) => {
            if (!prev) setPanelTab("problems");
            return !prev;
          })
        }
        gitStatus={gitStatus}
        autoPushEnabled={autoPushEnabled}
        onToggleGit={() => setActivityTab((prev) => (prev === "git" ? "explorer" : "git"))}
      />

      {/* Modals & Dialogs */}
      <UnsavedDialog
        state={unsavedState}
        onClose={() => setUnsavedState({ isOpen: false })}
      />

      <NewItemModal
        prompt={modalPrompt}
        onClose={() => setModalPrompt({ ...modalPrompt, isOpen: false })}
        onSubmit={handleModalSubmit}
      />

      {/* Toasts */}
      <NotificationToast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};

export default App;
