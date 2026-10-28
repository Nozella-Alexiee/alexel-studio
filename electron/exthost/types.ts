// Tipe & kelas inti API `vscode` yang dipakai ekstensi (Position, Range, Disposable, EventEmitter, …).
// Perilakunya mengikuti VS Code; hanya bagian yang dipakai ekstensi umum yang disediakan.

import { Uri } from "./uri";

export class Disposable {
  private fn: (() => void) | undefined;
  constructor(callOnDispose: () => void) {
    this.fn = callOnDispose;
  }
  static from(...disposables: { dispose(): unknown }[]): Disposable {
    return new Disposable(() => disposables.forEach((d) => d?.dispose?.()));
  }
  dispose(): void {
    const f = this.fn;
    this.fn = undefined;
    f?.();
  }
}

export type Listener<T> = (e: T) => unknown;
export type Event<T> = (listener: Listener<T>, thisArgs?: unknown, disposables?: { dispose(): unknown }[]) => Disposable;

export class EventEmitter<T> {
  private listeners = new Set<Listener<T>>();
  readonly event: Event<T> = (listener, thisArgs, disposables) => {
    const l = thisArgs ? listener.bind(thisArgs) : listener;
    this.listeners.add(l);
    const d = new Disposable(() => this.listeners.delete(l));
    disposables?.push(d);
    return d;
  };
  fire(data: T): void {
    for (const l of [...this.listeners]) {
      try {
        l(data);
      } catch (e) {
        console.error("[exthost] listener error:", e instanceof Error ? e.stack ?? e.message : e);
      }
    }
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class CancellationTokenSource {
  private emitter = new EventEmitter<void>();
  private cancelled = false;
  readonly token = {
    get isCancellationRequested() {
      return false;
    },
    onCancellationRequested: ((l, t, d) => this.emitter.event(l as Listener<void>, t, d)) as Event<unknown>,
  } as { isCancellationRequested: boolean; onCancellationRequested: Event<unknown> };
  constructor() {
    const self = this;
    Object.defineProperty(this.token, "isCancellationRequested", { get: () => self.cancelled });
  }
  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.emitter.fire();
  }
  dispose() {
    this.cancel();
    this.emitter.dispose();
  }
}

export const CancellationToken = {
  None: { isCancellationRequested: false, onCancellationRequested: new EventEmitter<unknown>().event },
  Cancelled: { isCancellationRequested: true, onCancellationRequested: new EventEmitter<unknown>().event },
};

export class CancellationError extends Error {
  constructor() {
    super("Canceled");
    this.name = "Canceled";
  }
}

export class Position {
  constructor(readonly line: number, readonly character: number) {
    if (line < 0) throw new Error("illegal argument: line must be non-negative");
    if (character < 0) throw new Error("illegal argument: character must be non-negative");
  }
  isBefore(o: Position) {
    return this.line < o.line || (this.line === o.line && this.character < o.character);
  }
  isBeforeOrEqual(o: Position) {
    return this.isBefore(o) || this.isEqual(o);
  }
  isAfter(o: Position) {
    return !this.isBeforeOrEqual(o);
  }
  isAfterOrEqual(o: Position) {
    return !this.isBefore(o);
  }
  isEqual(o: Position) {
    return this.line === o.line && this.character === o.character;
  }
  compareTo(o: Position) {
    return this.line !== o.line ? this.line - o.line : this.character - o.character;
  }
  translate(dl?: number | { lineDelta?: number; characterDelta?: number }, dc?: number): Position {
    const ld = typeof dl === "object" ? dl.lineDelta ?? 0 : dl ?? 0;
    const cd = typeof dl === "object" ? dl.characterDelta ?? 0 : dc ?? 0;
    return new Position(this.line + ld, this.character + cd);
  }
  with(line?: number | { line?: number; character?: number }, character?: number): Position {
    if (typeof line === "object") return new Position(line.line ?? this.line, line.character ?? this.character);
    return new Position(line ?? this.line, character ?? this.character);
  }
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    let s: Position, e: Position;
    if (typeof a === "number") {
      s = new Position(a, b as number);
      e = new Position(c as number, d as number);
    } else {
      s = a;
      e = b as Position;
    }
    if (e.isBefore(s)) [s, e] = [e, s];
    this.start = s;
    this.end = e;
  }
  get isEmpty() {
    return this.start.isEqual(this.end);
  }
  get isSingleLine() {
    return this.start.line === this.end.line;
  }
  contains(x: Position | Range): boolean {
    if (x instanceof Range) return this.contains(x.start) && this.contains(x.end);
    return x.isAfterOrEqual(this.start) && x.isBeforeOrEqual(this.end);
  }
  isEqual(o: Range) {
    return this.start.isEqual(o.start) && this.end.isEqual(o.end);
  }
  intersection(o: Range): Range | undefined {
    const s = this.start.isAfter(o.start) ? this.start : o.start;
    const e = this.end.isBefore(o.end) ? this.end : o.end;
    return s.isAfter(e) ? undefined : new Range(s, e);
  }
  union(o: Range): Range {
    return new Range(this.start.isBefore(o.start) ? this.start : o.start, this.end.isAfter(o.end) ? this.end : o.end);
  }
  with(start?: Position | { start?: Position; end?: Position }, end?: Position): Range {
    if (start && !(start instanceof Position)) return new Range(start.start ?? this.start, start.end ?? this.end);
    return new Range((start as Position) ?? this.start, end ?? this.end);
  }
}

export class Selection extends Range {
  readonly anchor: Position;
  readonly active: Position;
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    const anchor = typeof a === "number" ? new Position(a, b as number) : a;
    const active = typeof a === "number" ? new Position(c as number, d as number) : (b as Position);
    super(anchor, active);
    this.anchor = anchor;
    this.active = active;
  }
  get isReversed() {
    return this.anchor.isAfter(this.active);
  }
}

export class Location {
  range: Range;
  constructor(readonly uri: Uri, rangeOrPosition: Range | Position) {
    this.range = rangeOrPosition instanceof Range ? rangeOrPosition : new Range(rangeOrPosition, rangeOrPosition);
  }
}

export class MarkdownString {
  isTrusted?: boolean | { enabledCommands: string[] };
  supportThemeIcons?: boolean;
  supportHtml?: boolean;
  baseUri?: Uri;
  constructor(public value = "", supportThemeIcons = false) {
    this.supportThemeIcons = supportThemeIcons;
  }
  appendText(v: string) {
    this.value += v.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
    return this;
  }
  appendMarkdown(v: string) {
    this.value += v;
    return this;
  }
  appendCodeblock(code: string, lang = "") {
    this.value += "\n```" + lang + "\n" + code + "\n```\n";
    return this;
  }
}

export class SnippetString {
  constructor(public value = "") {}
  appendText(s: string) {
    this.value += s.replace(/[$}\\]/g, "\\$&");
    return this;
  }
  appendTabstop(n = 1) {
    this.value += `$${n}`;
    return this;
  }
  appendPlaceholder(v: string | ((s: SnippetString) => void), n = 1) {
    const inner = typeof v === "function" ? (() => { const s = new SnippetString(); v(s); return s.value; })() : v;
    this.value += `\${${n}:${inner}}`;
    return this;
  }
  appendVariable(name: string, def?: string) {
    this.value += def ? `\${${name}:${def}}` : `\${${name}}`;
    return this;
  }
}

export class ThemeColor {
  constructor(readonly id: string) {}
}
export class ThemeIcon {
  static readonly File = new ThemeIcon("file");
  static readonly Folder = new ThemeIcon("folder");
  constructor(readonly id: string, readonly color?: ThemeColor) {}
}

export class TextEdit {
  constructor(public range: Range, public newText: string) {}
  static replace(range: Range, newText: string) {
    return new TextEdit(range, newText);
  }
  static insert(position: Position, newText: string) {
    return new TextEdit(new Range(position, position), newText);
  }
  static delete(range: Range) {
    return new TextEdit(range, "");
  }
  static setEndOfLine() {
    return new TextEdit(new Range(0, 0, 0, 0), "");
  }
}

export class WorkspaceEdit {
  private edits = new Map<string, { uri: Uri; edits: TextEdit[] }>();
  get size() {
    return this.edits.size + this.fileOps.length;
  }
  replace(uri: Uri, range: Range, newText: string) {
    this.entry(uri).edits.push(new TextEdit(range, newText));
  }
  insert(uri: Uri, position: Position, newText: string) {
    this.entry(uri).edits.push(TextEdit.insert(position, newText));
  }
  delete(uri: Uri, range: Range) {
    this.entry(uri).edits.push(TextEdit.delete(range));
  }
  /** Operasi berkas yang dicatat (dijalankan applyEdit sebelum edit teks). */
  readonly fileOps: { op: "create" | "delete" | "rename"; uri: Uri; to?: Uri; overwrite?: boolean; ignoreIfExists?: boolean; recursive?: boolean }[] = [];
  createFile(uri: Uri, options?: { overwrite?: boolean; ignoreIfExists?: boolean }) {
    this.fileOps.push({ op: "create", uri, ...options });
  }
  deleteFile(uri: Uri, options?: { recursive?: boolean; ignoreIfNotExists?: boolean }) {
    this.fileOps.push({ op: "delete", uri, recursive: options?.recursive });
  }
  renameFile(oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean; ignoreIfExists?: boolean }) {
    this.fileOps.push({ op: "rename", uri: oldUri, to: newUri, ...options });
  }
  has(uri: Uri) {
    return this.edits.has(uri.toString());
  }
  set(uri: Uri, edits: TextEdit[]) {
    this.entry(uri).edits = [...edits];
  }
  get(uri: Uri): TextEdit[] {
    return this.edits.get(uri.toString())?.edits ?? [];
  }
  entries(): [Uri, TextEdit[]][] {
    return [...this.edits.values()].map((e) => [e.uri, e.edits]);
  }
  private entry(uri: Uri) {
    const k = uri.toString();
    let e = this.edits.get(k);
    if (!e) this.edits.set(k, (e = { uri, edits: [] }));
    return e;
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}
export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

export class DiagnosticRelatedInformation {
  constructor(public location: Location, public message: string) {}
}

export class Diagnostic {
  source?: string;
  code?: string | number | { value: string | number; target: Uri };
  tags?: DiagnosticTag[];
  relatedInformation?: DiagnosticRelatedInformation[];
  constructor(public range: Range, public message: string, public severity: DiagnosticSeverity = DiagnosticSeverity.Error) {}
}

export enum CompletionItemKind {
  Text = 0, Method = 1, Function = 2, Constructor = 3, Field = 4, Variable = 5, Class = 6, Interface = 7, Module = 8, Property = 9, Unit = 10,
  Value = 11, Enum = 12, Keyword = 13, Snippet = 14, Color = 15, File = 16, Reference = 17, Folder = 18, EnumMember = 19, Constant = 20, Struct = 21,
  Event = 22, Operator = 23, TypeParameter = 24, User = 25, Issue = 26,
}
export enum CompletionItemTag {
  Deprecated = 1,
}
export enum CompletionTriggerKind {
  Invoke = 0,
  TriggerCharacter = 1,
  TriggerForIncompleteCompletions = 2,
}

export class CompletionItem {
  detail?: string;
  documentation?: string | MarkdownString;
  sortText?: string;
  filterText?: string;
  insertText?: string | SnippetString;
  range?: Range | { inserting: Range; replacing: Range };
  commitCharacters?: string[];
  command?: { command: string; title?: string; arguments?: unknown[] };
  additionalTextEdits?: TextEdit[];
  preselect?: boolean;
  keepWhitespace?: boolean;
  tags?: CompletionItemTag[];
  constructor(public label: string | { label: string; detail?: string; description?: string }, public kind?: CompletionItemKind) {}
}

export class CompletionList {
  constructor(public items: CompletionItem[] = [], public isIncomplete = false) {}
}

export class Hover {
  contents: (MarkdownString | string | { language: string; value: string })[];
  constructor(contents: MarkdownString | string | { language: string; value: string } | (MarkdownString | string | { language: string; value: string })[], public range?: Range) {
    this.contents = Array.isArray(contents) ? contents : [contents];
  }
}

export class LocationLink {
  constructor(public targetUri: Uri, public targetRange: Range, public targetSelectionRange?: Range, public originSelectionRange?: Range) {}
}

export enum SymbolKind {
  File = 0, Module = 1, Namespace = 2, Package = 3, Class = 4, Method = 5, Property = 6, Field = 7, Constructor = 8, Enum = 9, Interface = 10, Function = 11,
  Variable = 12, Constant = 13, String = 14, Number = 15, Boolean = 16, Array = 17, Object = 18, Key = 19, Null = 20, EnumMember = 21, Struct = 22, Event = 23,
  Operator = 24, TypeParameter = 25,
}

export class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(public name: string, public detail: string, public kind: SymbolKind, public range: Range, public selectionRange: Range) {}
}

export class SymbolInformation {
  constructor(public name: string, public kind: SymbolKind, public containerName: string, public location: Location) {}
}

export class CodeAction {
  edit?: WorkspaceEdit;
  diagnostics?: Diagnostic[];
  command?: { command: string; title: string; arguments?: unknown[] };
  isPreferred?: boolean;
  constructor(public title: string, public kind?: CodeActionKind) {}
}

export class CodeActionKind {
  static readonly Empty = new CodeActionKind("");
  static readonly QuickFix = new CodeActionKind("quickfix");
  static readonly Refactor = new CodeActionKind("refactor");
  static readonly RefactorExtract = new CodeActionKind("refactor.extract");
  static readonly RefactorInline = new CodeActionKind("refactor.inline");
  static readonly RefactorRewrite = new CodeActionKind("refactor.rewrite");
  static readonly Source = new CodeActionKind("source");
  static readonly SourceOrganizeImports = new CodeActionKind("source.organizeImports");
  static readonly SourceFixAll = new CodeActionKind("source.fixAll");
  constructor(readonly value: string) {}
  append(part: string) {
    return new CodeActionKind(this.value ? `${this.value}.${part}` : part);
  }
  contains(o: CodeActionKind) {
    return o.value === this.value || o.value.startsWith(this.value + ".");
  }
  intersects(o: CodeActionKind) {
    return this.contains(o) || o.contains(this);
  }
}

export enum CodeActionTriggerKind {
  Invoke = 1,
  Automatic = 2,
}

export class CodeLens {
  constructor(public range: Range, public command?: { command: string; title: string; arguments?: unknown[] }) {}
  get isResolved() {
    return !!this.command;
  }
}

export class DocumentLink {
  constructor(public range: Range, public target?: Uri) {}
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}
export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}
export enum EndOfLine {
  LF = 1,
  CRLF = 2,
}
export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}
export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}
export enum OverviewRulerLane {
  Left = 1,
  Center = 2,
  Right = 4,
  Full = 7,
}
export enum DecorationRangeBehavior {
  OpenOpen = 0,
  ClosedClosed = 1,
  OpenClosed = 2,
  ClosedOpen = 3,
}
export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}
export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}
export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}
export enum UIKind {
  Desktop = 1,
  Web = 2,
}
export enum TextDocumentSaveReason {
  Manual = 1,
  AfterDelay = 2,
  FocusOut = 3,
}
export enum DocumentHighlightKind {
  Text = 0,
  Read = 1,
  Write = 2,
}

export class DocumentHighlight {
  constructor(public range: Range, public kind: DocumentHighlightKind = DocumentHighlightKind.Text) {}
}

export class FileSystemError extends Error {
  constructor(message?: string | Uri, public code = "Unknown") {
    super(typeof message === "string" ? message : message?.toString());
    this.name = code === "Unknown" ? "FileSystemError" : `FileSystemError (${code})`;
  }
  static FileNotFound(m?: string | Uri) {
    return new FileSystemError(m, "FileNotFound");
  }
  static FileExists(m?: string | Uri) {
    return new FileSystemError(m, "FileExists");
  }
  static FileNotADirectory(m?: string | Uri) {
    return new FileSystemError(m, "FileNotADirectory");
  }
  static FileIsADirectory(m?: string | Uri) {
    return new FileSystemError(m, "FileIsADirectory");
  }
  static NoPermissions(m?: string | Uri) {
    return new FileSystemError(m, "NoPermissions");
  }
  static Unavailable(m?: string | Uri) {
    return new FileSystemError(m, "Unavailable");
  }
}

export class RelativePattern {
  baseUri: Uri;
  constructor(base: string | Uri | { uri: Uri }, public pattern: string) {
    this.baseUri = typeof base === "string" ? Uri.file(base) : base instanceof Uri ? base : base.uri;
  }
  get base() {
    return this.baseUri.fsPath;
  }
}

export class QuickInputButtons {
  static readonly Back = { iconPath: new ThemeIcon("arrow-left"), tooltip: "Back" };
}

export class TreeItem {
  constructor(public label: string | { label: string }, public collapsibleState: number = 0) {}
  [k: string]: unknown;
}
export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

// ---- tipe tambahan yang dipakai vscode-languageclient & ekstensi bahasa -------------------

export enum SymbolTag {
  Deprecated = 1,
}
export class CallHierarchyItem {
  tags?: SymbolTag[];
  constructor(public kind: SymbolKind, public name: string, public detail: string, public uri: Uri, public range: Range, public selectionRange: Range) {}
}
export class CallHierarchyIncomingCall {
  constructor(public from: CallHierarchyItem, public fromRanges: Range[]) {}
}
export class CallHierarchyOutgoingCall {
  constructor(public to: CallHierarchyItem, public fromRanges: Range[]) {}
}
export class TypeHierarchyItem {
  tags?: SymbolTag[];
  constructor(public kind: SymbolKind, public name: string, public detail: string, public uri: Uri, public range: Range, public selectionRange: Range) {}
}
export class SelectionRange {
  constructor(public range: Range, public parent?: SelectionRange) {}
}
export enum FoldingRangeKind {
  Comment = 1,
  Imports = 2,
  Region = 3,
}
export class FoldingRange {
  constructor(public start: number, public end: number, public kind?: FoldingRangeKind) {}
}
export class SemanticTokensLegend {
  constructor(public tokenTypes: string[], public tokenModifiers: string[] = []) {}
}
export class SemanticTokens {
  constructor(public data: Uint32Array, public resultId?: string) {}
}
export class SemanticTokensEdit {
  constructor(public start: number, public deleteCount: number, public data?: Uint32Array) {}
}
export class SemanticTokensEdits {
  constructor(public edits: SemanticTokensEdit[], public resultId?: string) {}
}
export class SemanticTokensBuilder {
  private data: number[] = [];
  private prevLine = 0;
  private prevChar = 0;
  constructor(private legend?: SemanticTokensLegend) {}
  push(a: number | Range, b?: number | string, c?: number | string, d?: number | string[], e?: number): void {
    let line: number, char: number, length: number, type: number, mods: number;
    if (a instanceof Range) {
      line = a.start.line;
      char = a.start.character;
      length = a.end.character - a.start.character;
      type = Math.max(0, this.legend?.tokenTypes.indexOf(b as string) ?? 0);
      mods = 0;
      for (const m of (c as unknown as string[]) ?? []) mods |= 1 << Math.max(0, this.legend?.tokenModifiers.indexOf(m) ?? 0);
    } else {
      [line, char, length, type, mods] = [a, b as number, c as number, d as number, e ?? 0];
    }
    const dl = line - this.prevLine;
    this.data.push(dl, dl === 0 ? char - this.prevChar : char, length, type, mods);
    this.prevLine = line;
    this.prevChar = char;
  }
  build(resultId?: string) {
    return new SemanticTokens(new Uint32Array(this.data), resultId);
  }
}
export enum InlayHintKind {
  Type = 1,
  Parameter = 2,
}
export class InlayHintLabelPart {
  tooltip?: string | MarkdownString;
  location?: Location;
  command?: { command: string; title: string; arguments?: unknown[] };
  constructor(public value: string) {}
}
export class InlayHint {
  kind?: InlayHintKind;
  textEdits?: TextEdit[];
  tooltip?: string | MarkdownString;
  paddingLeft?: boolean;
  paddingRight?: boolean;
  constructor(public position: Position, public label: string | InlayHintLabelPart[], kind?: InlayHintKind) {
    this.kind = kind;
  }
}
export class Color {
  constructor(public red: number, public green: number, public blue: number, public alpha: number) {}
}
export class ColorInformation {
  constructor(public range: Range, public color: Color) {}
}
export class ColorPresentation {
  textEdit?: TextEdit;
  additionalTextEdits?: TextEdit[];
  constructor(public label: string) {}
}
export class ParameterInformation {
  constructor(public label: string | [number, number], public documentation?: string | MarkdownString) {}
}
export class SignatureInformation {
  parameters: ParameterInformation[] = [];
  activeParameter?: number;
  constructor(public label: string, public documentation?: string | MarkdownString) {}
}
export class SignatureHelp {
  signatures: SignatureInformation[] = [];
  activeSignature = 0;
  activeParameter = 0;
}
export enum SignatureHelpTriggerKind {
  Invoke = 1,
  TriggerCharacter = 2,
  ContentChange = 3,
}
export enum TextEditorSelectionChangeKind {
  Keyboard = 1,
  Mouse = 2,
  Command = 3,
}
export enum TextDocumentChangeReason {
  Undo = 1,
  Redo = 2,
}
export enum ExtensionKind {
  UI = 1,
  Workspace = 2,
}
export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
}
export class InlineValueText {
  constructor(public range: Range, public text: string) {}
}
export class InlineValueVariableLookup {
  constructor(public range: Range, public variableName?: string, public caseSensitiveLookup = true) {}
}
export class InlineValueEvaluatableExpression {
  constructor(public range: Range, public expression?: string) {}
}
export class EvaluatableExpression {
  constructor(public range: Range, public expression?: string) {}
}
export class LinkedEditingRanges {
  constructor(public ranges: Range[], public wordPattern?: RegExp) {}
}
export class DocumentDropEdit {
  constructor(public insertText: string | SnippetString) {}
}
export class WorkspaceSymbol {
  constructor(public name: string, public kind: SymbolKind, public containerName: string, public location: Location | { uri: Uri }) {}
}
export enum TaskScope {
  Global = 1,
  Workspace = 2,
}
export class TaskGroup {
  static readonly Clean = new TaskGroup("clean", "Clean");
  static readonly Build = new TaskGroup("build", "Build");
  static readonly Rebuild = new TaskGroup("rebuild", "Rebuild");
  static readonly Test = new TaskGroup("test", "Test");
  constructor(readonly id: string, readonly label: string) {}
}
export enum TaskRevealKind {
  Always = 1,
  Silent = 2,
  Never = 3,
}
export enum TaskPanelKind {
  Shared = 1,
  Dedicated = 2,
  New = 3,
}
export class ShellExecution {
  constructor(public commandLine?: string | unknown, public args?: unknown, public options?: unknown) {}
}
export class ProcessExecution {
  constructor(public process: string, public args?: string[], public options?: unknown) {}
}
export class CustomExecution {
  constructor(public callback: unknown) {}
}
export class Task {
  group?: TaskGroup;
  presentationOptions: Record<string, unknown> = {};
  problemMatchers: string[] = [];
  isBackground = false;
  constructor(public definition: unknown, public scope: unknown, public name: string, public source: string, public execution?: unknown, problemMatchers?: string | string[]) {
    if (problemMatchers) this.problemMatchers = Array.isArray(problemMatchers) ? problemMatchers : [problemMatchers];
  }
}
export class SourceBreakpoint {
  constructor(public location: Location, public enabled = true, public condition?: string, public hitCondition?: string, public logMessage?: string) {}
}
export class FunctionBreakpoint {
  constructor(public functionName: string, public enabled = true, public condition?: string, public hitCondition?: string, public logMessage?: string) {}
}
export class DebugAdapterExecutable {
  constructor(public command: string, public args: string[] = [], public options?: unknown) {}
}
export class DebugAdapterServer {
  constructor(public port: number, public host?: string) {}
}
export enum TerminalLocation {
  Panel = 1,
  Editor = 2,
}
export enum EnvironmentVariableMutatorType {
  Replace = 1,
  Append = 2,
  Prepend = 3,
}
export enum CommentMode {
  Editing = 0,
  Preview = 1,
}
export enum NotebookCellKind {
  Markup = 1,
  Code = 2,
}
export enum LogLevel {
  Off = 0,
  Trace = 1,
  Debug = 2,
  Info = 3,
  Warning = 4,
  Error = 5,
}

export enum LanguageStatusSeverity {
  Information = 0,
  Warning = 1,
  Error = 2,
}
export enum InlineCompletionTriggerKind {
  Invoke = 0,
  Automatic = 1,
}
export class InlineCompletionItem {
  constructor(public insertText: string | SnippetString, public range?: Range, public command?: { command: string; title: string; arguments?: unknown[] }) {}
}
export class InlineCompletionList {
  constructor(public items: InlineCompletionItem[]) {}
}
export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}
export enum FileChangeType {
  Changed = 1,
  Created = 2,
  Deleted = 3,
}
export enum TextEditorLineNumbersStyle {
  Off = 0,
  On = 1,
  Relative = 2,
}
export enum NotebookEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}
export enum TerminalExitReason {
  Unknown = 0,
  Shutdown = 1,
  Process = 2,
  User = 3,
  Extension = 4,
}
export enum DebugConsoleMode {
  Separate = 0,
  MergeWithParent = 1,
}
export enum TreeItemCheckboxState {
  Unchecked = 0,
  Checked = 1,
}
export enum CommentThreadCollapsibleState {
  Collapsed = 0,
  Expanded = 1,
}
export class ThemeIconColor {}
export class DataTransferItem {
  constructor(public value: unknown) {}
  async asString() {
    return String(this.value);
  }
  asFile() {
    return undefined;
  }
}
export class DataTransfer {
  private m = new Map<string, DataTransferItem>();
  get(mime: string) {
    return this.m.get(mime);
  }
  set(mime: string, item: DataTransferItem) {
    this.m.set(mime, item);
  }
  forEach(cb: (item: DataTransferItem, mime: string, dt: DataTransfer) => void) {
    this.m.forEach((v, k) => cb(v, k, this));
  }
}

export enum QuickInputButtonLocation {
  Title = 1,
  Inline = 2,
  Input = 3,
}

export enum TextEditorCursorStyle {
  Line = 1,
  Block = 2,
  Underline = 3,
  LineThin = 4,
  BlockOutline = 5,
  UnderlineThin = 6,
}

// ---- notebook (hanya bentuk datanya; notebook belum didukung editor) --------------------

export class NotebookCellOutputItem {
  constructor(public data: Uint8Array, public mime: string) {}
  static text(value: string, mime = "text/plain") {
    return new NotebookCellOutputItem(new TextEncoder().encode(value), mime);
  }
  static json(value: unknown, mime = "application/json") {
    return new NotebookCellOutputItem(new TextEncoder().encode(JSON.stringify(value)), mime);
  }
  static stdout(value: string) {
    return NotebookCellOutputItem.text(value, "application/vnd.code.notebook.stdout");
  }
  static stderr(value: string) {
    return NotebookCellOutputItem.text(value, "application/vnd.code.notebook.stderr");
  }
  static error(err: Error) {
    return NotebookCellOutputItem.json({ name: err.name, message: err.message, stack: err.stack }, "application/vnd.code.notebook.error");
  }
}
export class NotebookCellOutput {
  constructor(public items: NotebookCellOutputItem[], public metadata?: Record<string, unknown>) {}
}
export class NotebookCellData {
  outputs?: NotebookCellOutput[];
  constructor(public kind: NotebookCellKind, public value: string, public languageId: string) {}
}
export class NotebookData {
  metadata?: Record<string, unknown>;
  constructor(public cells: NotebookCellData[]) {}
}
export class NotebookRange {
  constructor(public start: number, public end: number) {}
  get isEmpty() {
    return this.start === this.end;
  }
}
export class NotebookEdit {
  static replaceCells(range: NotebookRange, cells: NotebookCellData[]) {
    return { range, cells };
  }
  static insertCells(index: number, cells: NotebookCellData[]) {
    return { range: new NotebookRange(index, index), cells };
  }
  static deleteCells(range: NotebookRange) {
    return { range, cells: [] as NotebookCellData[] };
  }
}

export enum IndentAction {
  None = 0,
  Indent = 1,
  IndentOutdent = 2,
  Outdent = 3,
}

// ---- Testing API (tanpa UI: objek berfungsi supaya ekstensi tidak gagal aktif) ----------

export enum TestRunProfileKind {
  Run = 1,
  Debug = 2,
  Coverage = 3,
}
export class TestTag {
  constructor(readonly id: string) {}
}
export class TestMessage {
  expectedOutput?: string;
  actualOutput?: string;
  location?: Location;
  constructor(public message: string | MarkdownString) {}
  static diff(message: string | MarkdownString, expected: string, actual: string) {
    const m = new TestMessage(message);
    m.expectedOutput = expected;
    m.actualOutput = actual;
    return m;
  }
}
export class TestRunRequest {
  constructor(public include?: unknown[], public exclude?: unknown[], public profile?: unknown, public continuous?: boolean, public preserveFocus?: boolean) {}
}
