export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  extension?: string;
  children?: FileEntry[];
  isOpen?: boolean;
}

export interface EditorTab {
  id: string; // file path
  path: string;
  name: string;
  content: string;
  initialContent: string;
  isDirty: boolean;
  language: string;
  line: number;
  col: number;
}

export interface ClaudeCliInfo {
  installed: boolean;
  path?: string;
  version?: string;
  error?: string;
  instructions: string;
}

export interface SystemFootprint {
  app_memory_mb: number;
  app_uptime_secs: number;
  vscode_baseline_mb: number;
  savings_percentage: number;
}

export type ThemeMode = "dark" | "light";

export interface ModalPrompt {
  isOpen: boolean;
  title: string;
  type: "file" | "folder";
  targetDirPath: string;
}

export interface UnsavedConfirmState {
  isOpen: boolean;
  tabId?: string;
  filePath?: string;
  fileName?: string;
  onSaveAndClose?: () => void;
  onDiscardAndClose?: () => void;
}
