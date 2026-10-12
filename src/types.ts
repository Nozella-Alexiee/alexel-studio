export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  extension?: string;
  children?: FileEntry[];
  isOpen?: boolean;
}

export interface ImageFileData {
  data_url: string;
  size_bytes: number;
  format: string;
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
  isImage?: boolean;
  imageData?: ImageFileData;
  markdownMode?: "code" | "split" | "preview";
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

export interface GitStatus {
  is_git_repo: boolean;
  branch: string;
  has_changes: boolean;
  modified_count: number;
  untracked_count: number;
  changed_files: string[];
}

export interface GitPushResult {
  success: boolean;
  branch: string;
  commit_hash?: string;
  message: string;
  pushed_to_remote: boolean;
}

export interface CodeProblem {
  line: number;
  col: number;
  message: string;
  severity: "error" | "warning" | "info";
  source?: string;
}
