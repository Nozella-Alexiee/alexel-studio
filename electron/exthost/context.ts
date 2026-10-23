// Keadaan bersama extension host: dokumen, editor aktif, perintah, provider, diagnostik, pengaturan.

import type { HostDocument } from "./document";
import type { Rpc } from "./rpc";
import { EventEmitter, type Diagnostic, type Position, type Selection } from "./types";
import type { Uri } from "./uri";

export interface ExtManifest {
  name: string;
  publisher?: string;
  version: string;
  displayName?: string;
  main?: string;
  activationEvents?: string[];
  contributes?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  extensionDependencies?: string[];
  extensionPack?: string[];
  engines?: { vscode?: string };
  [k: string]: unknown;
}

export interface LoadedExt {
  id: string;
  dir: string;
  manifest: ExtManifest;
  active: boolean;
  activating: Promise<void> | null;
  exports: unknown;
  context: unknown;
  subscriptions: { dispose(): unknown }[];
  mementos?: { flush(): void }[];
}

export interface EditorInfo {
  uri: string;
  selections: { anchor: { l: number; c: number }; active: { l: number; c: number } }[];
  visible?: { s: { l: number; c: number }; e: { l: number; c: number } }[];
  options: { tabSize: number; insertSpaces: boolean };
}

export interface ProviderEntry {
  id: number;
  kind: string;
  selector: unknown;
  provider: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  ext: LoadedExt | null;
}

export interface HostCtx {
  rpc: Rpc;
  root: string | null;
  userData: string;
  extensions: Map<string, LoadedExt>;
  docs: Map<string, HostDocument>;
  commands: Map<string, { fn: (...a: any[]) => unknown; thisArg?: unknown; ext: LoadedExt | null; editor?: boolean }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  providers: Map<number, ProviderEntry>;
  diagnostics: Map<string, Map<string, Diagnostic[]>>;
  /** Pengaturan pemakai (kunci datar "a.b.c") dan bawaan dari contributes.configuration. */
  settings: Record<string, unknown>;
  defaults: Map<string, unknown>;
  /** Pengaturan inti dari Alexel Studio (editor.tabSize, files.autoSave, …); di bawah pengaturan pemakai. */
  core: Record<string, unknown>;
  activeEditor: EditorInfo | null;
  decorationTypes: Map<number, unknown>;
  treeProviders: Map<string, { provider: any; ext: LoadedExt | null }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Panel webview yang hidup (id → penangan peristiwa dari renderer). */
  webviews: Map<number, { message: (m: unknown) => void; disposed: () => void; state: (s: { active: boolean; visible: boolean }) => void }>;
  events: {
    openDoc: EventEmitter<HostDocument>;
    closeDoc: EventEmitter<HostDocument>;
    changeDoc: EventEmitter<{ document: HostDocument; contentChanges: { range: import("./types").Range; rangeOffset: number; rangeLength: number; text: string }[]; reason: undefined }>;
    saveDoc: EventEmitter<HostDocument>;
    activeEditor: EventEmitter<unknown>;
    selection: EventEmitter<{ textEditor: unknown; selections: Selection[]; kind: undefined }>;
    config: EventEmitter<{ affectsConfiguration(section: string, scope?: unknown): boolean }>;
    diagnostics: EventEmitter<{ uris: Uri[] }>;
    folders: EventEmitter<{ added: unknown[]; removed: unknown[] }>;
    fsChanged: EventEmitter<{ kind: "create" | "change" | "delete"; uri: Uri }>;
  };
  activate(id: string, reason?: string): Promise<void>;
  activateByEvent(event: string): Promise<void>;
  log(ext: LoadedExt | null, line: string): void;
  positionOf(p: { l: number; c: number }): Position;
}

export function newEvents(): HostCtx["events"] {
  return {
    openDoc: new EventEmitter(),
    closeDoc: new EventEmitter(),
    changeDoc: new EventEmitter(),
    saveDoc: new EventEmitter(),
    activeEditor: new EventEmitter(),
    selection: new EventEmitter(),
    config: new EventEmitter(),
    diagnostics: new EventEmitter(),
    folders: new EventEmitter(),
    fsChanged: new EventEmitter(),
  };
}
