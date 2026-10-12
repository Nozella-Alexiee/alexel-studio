import React, { useState, useEffect, useCallback } from "react";
import {
  ClaudeCliInfo,
  EditorTab,
  FileEntry,
  ModalPrompt,
  SystemFootprint,
  ThemeMode,
  UnsavedConfirmState,
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
} from "./services/tauriService";
import { TitleBar } from "./components/TitleBar";
import { FileTree } from "./components/FileTree";
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
  const [isClaudePanelOpen, setIsClaudePanelOpen] = useState(false);
  const [claudeInfo, setClaudeInfo] = useState<ClaudeCliInfo | undefined>(undefined);
  const [footprint, setFootprint] = useState<SystemFootprint | undefined>(undefined);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  useEffect(() => {
    refreshClaudeCli();
    refreshFootprint();

    const interval = setInterval(() => {
      refreshFootprint();
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshClaudeCli, refreshFootprint]);

  // Apply theme to document attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Load project directory tree
  const loadDirectory = async (dirPath: string) => {
    try {
      const entries = await listDirectory(dirPath);
      setFileTree(entries);
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

  // Save tab content
  const handleSaveTab = async (tabToSave?: EditorTab) => {
    const target = tabToSave || tabs.find((t) => t.id === activeTabId);
    if (!target) return;

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
    } catch (err) {
      addToast("error", `Failed to save ${target.name}: ${String(err)}`);
    }
  };

  // Close tab with unsaved warning
  const handleCloseTab = (tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const targetTab = tabs.find((t) => t.id === tabId);
    if (!targetTab) return;

    if (targetTab.isDirty) {
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
        // Open file directly in editor
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
      // Close tab if open
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

      if (isMod && e.key.toLowerCase() === "s") {
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, tabs]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const projectName = projectPath ? projectPath.split("/").pop() : undefined;

  return (
    <div className="app-container">
      {/* Title Bar */}
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
        footprint={footprint}
      />

      {/* Main Area */}
      <div className="app-main">
        {/* Sidebar File Tree */}
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
        />

        {/* Editor Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={(id) => setActiveTabId(id)}
            onCloseTab={handleCloseTab}
          />

          <EditorArea
            activeTab={activeTab}
            theme={theme}
            onContentChange={handleContentChange}
            onCursorChange={handleCursorChange}
            onSave={() => handleSaveTab()}
            onOpenFolder={handleOpenFolder}
            onToggleClaude={() => setIsClaudePanelOpen(true)}
          />
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
