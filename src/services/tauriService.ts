import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ClaudeCliInfo, FileEntry, SystemFootprint } from "../types";

export const isTauriEnvironment = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// In-memory mock storage for browser preview mode
const mockFiles: Record<string, string> = {
  "/Users/demo/nozel-project/src/services/index.tsx": `import React, { useState } from 'react';
import React, { FC } from 'react';
import { EditorProps } from '../NozelCodeEditor';
import { result, ReactState } from '../sb/react';

export const NozelCodeEditor: FC<EditorProps> = ({
  interface React;
  display: String; "react",
  promoteForms: ucode,
  weboiler: "string"
};

export const NozelCodeEditor: FC<EditorProps> = ({ ... }) => {
  interface React;
  type: string: string;
  componentet: string,
  state: state,
  component: string,
  component=ReactProp;
});

  return (...);

  return (
    <div>
      <NozelCodeEditor {...props} />
      <NozelCode NozelGoEditor FFC<EditortProps> />
    </div>
  );
};
`,
  "/Users/demo/nozel-project/src/api.rs": `// High-performance Rust native backend bridge
pub fn init_runtime() -> Result<(), Box<dyn std::error::Error>> {
    println!("Nozel Core Rust Engine initialized with 38MB RAM footprint.");
    Ok(())
}
`,
  "/Users/demo/nozel-project/src/README.md": `# Nozel Code ⚡
The ultra-lightweight macOS code editor.
RAM Footprint: ~38 MB. Claude Pro subscription native integration.
`,
  "/Users/demo/nozel-project/src/package.json": `{
  "name": "nozel-project",
  "version": "1.0.0",
  "private": true
}
`,
  "/Users/demo/nozel-project/README.md": `# Nozel Code ⚡
The ultra-lightweight desktop code editor for macOS (M1/M2/M3 Silicon).
Designed for 8 GB RAM with instant cold start and native Claude Code companion.
`,
  "/Users/demo/nozel-project/settings.json": `{
  "editor.fontSize": 13.5,
  "editor.tabSize": 4,
  "claude.mode": "cli-pro"
}
`,
};

export async function openFolderDialog(): Promise<string | null> {
  if (isTauriEnvironment()) {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });
      if (typeof selected === "string") {
        return selected;
      }
      return null;
    } catch (err) {
      console.error("Native dialog error:", err);
      throw new Error(`Failed to open folder dialog: ${String(err)}`);
    }
  }

  // Fallback mock for browser preview
  return "/Users/demo/nozel-project";
}

export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  if (isTauriEnvironment()) {
    return await invoke<FileEntry[]>("list_dir", { dirPath });
  }

  // Fallback mock matching nozel_mockup_glass
  if (dirPath === "/Users/demo/nozel-project") {
    return [
      { name: "app", path: "/Users/demo/nozel-project/app", is_dir: true },
      { name: "src", path: "/Users/demo/nozel-project/src", is_dir: true },
      { name: "README.md", path: "/Users/demo/nozel-project/README.md", is_dir: false, extension: "md", size: 210 },
    ];
  } else if (dirPath === "/Users/demo/nozel-project/src") {
    return [
      { name: "core", path: "/Users/demo/nozel-project/src/core", is_dir: true },
      { name: "services", path: "/Users/demo/nozel-project/src/services", is_dir: true },
      { name: "components", path: "/Users/demo/nozel-project/src/components", is_dir: true },
      { name: "data", path: "/Users/demo/nozel-project/src/data", is_dir: true },
      { name: "api.rs", path: "/Users/demo/nozel-project/src/api.rs", is_dir: false, extension: "rs", size: 140 },
      { name: "README.md", path: "/Users/demo/nozel-project/src/README.md", is_dir: false, extension: "md", size: 210 },
      { name: "package.json", path: "/Users/demo/nozel-project/src/package.json", is_dir: false, extension: "json", size: 85 },
    ];
  } else if (dirPath === "/Users/demo/nozel-project/src/services") {
    return [
      { name: "index.tsx", path: "/Users/demo/nozel-project/src/services/index.tsx", is_dir: false, extension: "tsx", size: 520 },
    ];
  }

  return [];
}

export async function readFileText(path: string): Promise<string> {
  if (isTauriEnvironment()) {
    return await invoke<string>("read_file_text", { path });
  }

  if (mockFiles[path] !== undefined) {
    return mockFiles[path];
  }

  throw new Error(`File not found: ${path}`);
}

export async function writeFileText(path: string, content: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke("write_file_text", { path, content });
    return;
  }

  mockFiles[path] = content;
}

export async function createFile(path: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke("create_file", { path });
    return;
  }

  mockFiles[path] = "";
}

export async function createDir(path: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke("create_dir", { path });
    return;
  }
}

export async function deleteEntry(path: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke("delete_entry", { path });
    return;
  }

  delete mockFiles[path];
}

export async function renameEntry(oldPath: string, newPath: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke("rename_entry", { oldPath, newPath });
    return;
  }

  if (mockFiles[oldPath] !== undefined) {
    mockFiles[newPath] = mockFiles[oldPath];
    delete mockFiles[oldPath];
  }
}

export async function checkClaudeCli(): Promise<ClaudeCliInfo> {
  if (isTauriEnvironment()) {
    return await invoke<ClaudeCliInfo>("check_claude_cli");
  }

  return {
    installed: true,
    path: "/opt/homebrew/bin/claude",
    version: "claude-code/1.0.12 darwin-arm64 (Claude Pro active)",
    instructions:
      "Claude Code is Anthropic's official terminal CLI agent that uses your Claude Pro/Max subscription directly without API token billing. To use it:\n1. Run: npm install -g @anthropic-ai/claude-code\n2. Run: claude login (in Terminal to authenticate with your Claude Pro account)\n3. Launch Nozel Code to link seamlessly!",
  };
}

export async function launchClaudeTerminal(
  projectDir: string,
  initialPrompt?: string
): Promise<string> {
  if (isTauriEnvironment()) {
    return await invoke<string>("launch_claude_terminal", {
      projectDir,
      initialPrompt: initialPrompt || null,
    });
  }

  return "Terminal launched in mock mode.";
}

export async function runClaudeCliPrint(
  projectDir: string,
  prompt: string,
  fileContext?: string
): Promise<string> {
  if (isTauriEnvironment()) {
    return await invoke<string>("run_claude_cli_print", {
      projectDir,
      prompt,
      fileContext: fileContext || null,
    });
  }

  return `[Mock Claude Code Output (Claude Pro Subscription Active)]:
Analyzed prompt: "${prompt}".
Context length: ${fileContext?.length || 0} characters.
No token fees incurred via Claude Code Pro subscription.`;
}

export async function getSystemFootprint(): Promise<SystemFootprint> {
  if (isTauriEnvironment()) {
    return await invoke<SystemFootprint>("get_system_footprint");
  }

  return {
    app_memory_mb: 38.4,
    app_uptime_secs: 120,
    vscode_baseline_mb: 650.0,
    savings_percentage: 94.1,
  };
}
