// Keadaan sisi renderer untuk extension host: proses, perintah, provider, status bar, tampilan pohon.

import { create } from "zustand";

export interface StatusItem {
  id: number;
  owner?: string;
  text?: string;
  tooltip?: string;
  command?: string;
  args?: unknown[];
  alignment: number;
  priority: number;
  visible: boolean;
  color?: string;
  backgroundColor?: string;
}

export interface HostProvider {
  id: number;
  kind: string;
  selector: { language?: string; scheme?: string; pattern?: string | { base?: string; pattern: string } }[];
  owner?: string;
  triggerCharacters?: string[];
}

export interface HostCommand {
  id: string;
  owner?: string;
}

export interface ExtHostState {
  running: boolean;
  starting: boolean;
  /** Jumlah ekstensi yang dimuat host. */
  count: number;
  activated: Record<string, number>;
  failed: Record<string, string>;
  status: Record<number, StatusItem>;
  commands: Record<string, HostCommand>;
  providers: Record<number, HostProvider>;
  treeViews: Record<string, { owner?: string; version: number }>;
  /** Tampilan webview di sidebar yang sudah didaftarkan ekstensi (viewId → pemilik). */
  webviewViews: Record<string, { owner?: string }>;
  progress: Record<number, { title?: string; message?: string; percent?: number; location: number }>;
  contexts: Record<string, unknown>;
  languageConfigs: Record<string, unknown>;
}

const initial: ExtHostState = {
  running: false,
  starting: false,
  count: 0,
  activated: {},
  failed: {},
  status: {},
  commands: {},
  providers: {},
  treeViews: {},
  webviewViews: {},
  progress: {},
  contexts: {},
  languageConfigs: {},
};

export const useExtHost = create<ExtHostState>(() => initial);
export const resetExtHost = () => useExtHost.setState({ ...initial });
