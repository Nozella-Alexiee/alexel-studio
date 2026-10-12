import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ClaudeCliInfo, FileEntry, SystemFootprint } from "../types";

export const isTauriEnvironment = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// In-memory mock storage for browser preview mode
const mockFiles: Record<string, string> = {
  "/Users/demo/nozel-project/README.md": `# Nozel Code ⚡
The ultra-lightweight desktop code editor for macOS (M1/M2/M3 Silicon).
Designed for 8 GB RAM with instant cold start and native Claude Code companion.

## Features
- CodeMirror 6 with full syntax highlighting
- Native Claude Code Pro CLI companion bridge
- ~94% lighter memory footprint than VS Code
`,
  "/Users/demo/nozel-project/src/index.ts": `// Fast TypeScript runtime demonstration
export function calculateSpeed(startTime: number): number {
  return performance.now() - startTime;
}

console.log("Nozel Code initialized on Apple Silicon!");
`,
  "/Users/demo/nozel-project/src/main.rs": `// Rust backend logic
fn main() {
    println!("Hello from high performance native Rust!");
}
`,
  "/Users/demo/nozel-project/scripts/analyze.py": `# Python script for data processing
def compute_metrics(items):
    return sum(len(x) for x in items)

if __name__ == "__main__":
    print("Analyzer ready.")
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

  // Fallback mock
  if (dirPath === "/Users/demo/nozel-project") {
    return [
      { name: "scripts", path: "/Users/demo/nozel-project/scripts", is_dir: true },
      { name: "src", path: "/Users/demo/nozel-project/src", is_dir: true },
      { name: "README.md", path: "/Users/demo/nozel-project/README.md", is_dir: false, extension: "md", size: 312 },
    ];
  } else if (dirPath === "/Users/demo/nozel-project/src") {
    return [
      { name: "index.ts", path: "/Users/demo/nozel-project/src/index.ts", is_dir: false, extension: "ts", size: 184 },
      { name: "main.rs", path: "/Users/demo/nozel-project/src/main.rs", is_dir: false, extension: "rs", size: 95 },
    ];
  } else if (dirPath === "/Users/demo/nozel-project/scripts") {
    return [
      { name: "analyze.py", path: "/Users/demo/nozel-project/scripts/analyze.py", is_dir: false, extension: "py", size: 140 },
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
