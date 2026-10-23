// vscode.TextDocument sisi host. Teks disinkronkan dari editor (buka / perubahan / simpan / tutup).

import { Position, Range } from "./types";
import { Uri } from "./uri";

export interface TextLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly range: Range;
  readonly rangeIncludingLineBreak: Range;
  readonly firstNonWhitespaceCharacterIndex: number;
  readonly isEmptyOrWhitespace: boolean;
}

const LINE_BREAK = /\r\n|\r|\n/;

export class HostDocument {
  readonly isUntitled = false;
  isClosed = false;
  /** Dokumen yang sedang tampil di editor (bukan sekadar dibaca dari disk). */
  isOpenInEditor = false;
  isDirty = false;
  private starts: number[] | null = null;

  constructor(
    readonly uri: Uri,
    public languageId: string,
    public version: number,
    private text: string,
    public eol: 1 | 2 = 1
  ) {}

  get fileName(): string {
    return this.uri.fsPath;
  }
  get encoding(): string {
    return "utf8";
  }

  private lineStarts(): number[] {
    if (!this.starts) {
      const s = [0];
      const re = /\r\n|\r|\n/g;
      for (let m = re.exec(this.text); m; m = re.exec(this.text)) s.push(m.index + m[0].length);
      this.starts = s;
    }
    return this.starts;
  }

  get lineCount(): number {
    return this.lineStarts().length;
  }

  /** Terapkan perubahan dari editor (rentang berdasarkan posisi atau offset) atau ganti seluruh teks. */
  setText(text: string, version: number) {
    this.text = text;
    this.starts = null;
    this.version = version;
  }

  applyEdits(changes: { start: number; end: number; text: string }[], version: number) {
    // Urut menurun supaya offset awal tetap valid.
    for (const c of [...changes].sort((a, b) => b.start - a.start)) this.text = this.text.slice(0, c.start) + c.text + this.text.slice(c.end);
    this.starts = null;
    this.version = version;
  }

  getText(range?: Range): string {
    if (!range) return this.text;
    return this.text.slice(this.offsetAt(range.start), this.offsetAt(range.end));
  }

  lineAt(lineOrPos: number | Position): TextLine {
    const line = typeof lineOrPos === "number" ? lineOrPos : lineOrPos.line;
    if (line < 0 || line >= this.lineCount) throw new Error("Illegal value for `line`");
    const starts = this.lineStarts();
    const start = starts[line];
    const endWithBreak = line + 1 < starts.length ? starts[line + 1] : this.text.length;
    const raw = this.text.slice(start, endWithBreak);
    const text = raw.replace(LINE_BREAK, "");
    const first = text.search(/\S/);
    return {
      lineNumber: line,
      text,
      range: new Range(line, 0, line, text.length),
      rangeIncludingLineBreak: line + 1 < starts.length ? new Range(line, 0, line + 1, 0) : new Range(line, 0, line, text.length),
      firstNonWhitespaceCharacterIndex: first < 0 ? text.length : first,
      isEmptyOrWhitespace: first < 0,
    };
  }

  offsetAt(position: Position): number {
    const p = this.validatePosition(position);
    return this.lineStarts()[p.line] + p.character;
  }

  positionAt(offset: number): Position {
    const o = Math.max(0, Math.min(offset, this.text.length));
    const s = this.lineStarts();
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid] <= o) lo = mid;
      else hi = mid - 1;
    }
    return new Position(lo, o - s[lo]);
  }

  validatePosition(p: Position): Position {
    if (this.text.length === 0) return new Position(0, 0);
    const line = Math.min(Math.max(p.line, 0), this.lineCount - 1);
    const maxChar = this.lineAt(line).text.length;
    return new Position(line, Math.min(Math.max(p.character, 0), maxChar));
  }

  validateRange(r: Range): Range {
    return new Range(this.validatePosition(r.start), this.validatePosition(r.end));
  }

  getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined {
    const pos = this.validatePosition(position);
    const line = this.lineAt(pos.line).text;
    const re = new RegExp((regex ?? /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g).source, (regex?.flags ?? "g").includes("g") ? regex?.flags ?? "g" : (regex?.flags ?? "") + "g");
    for (let m = re.exec(line); m; m = re.exec(line)) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const start = m.index;
      const end = start + m[0].length;
      if (pos.character >= start && pos.character <= end) return new Range(pos.line, start, pos.line, end);
      if (start > pos.character) break;
    }
    return undefined;
  }

  save(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
