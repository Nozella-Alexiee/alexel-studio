// vscode.Uri: sama perilakunya dengan VS Code untuk file:// (termasuk path Windows) dan skema lain.

const encodeSeg = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const encodePath = (p: string) => p.split("/").map(encodeSeg).join("/");

export interface UriComponents {
  scheme: string;
  authority?: string;
  path?: string;
  query?: string;
  fragment?: string;
}

const isWinDrivePath = (p: string) => /^\/[A-Za-z]:/.test(p);

export class Uri implements UriComponents {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;

  private constructor(c: UriComponents) {
    this.scheme = c.scheme || "file";
    this.authority = c.authority ?? "";
    this.query = c.query ?? "";
    this.fragment = c.fragment ?? "";
    let p = c.path ?? "";
    // Seperti VS Code: path selalu diawali "/" bila ada authority atau skema berhierarki.
    if (this.scheme === "file" || this.scheme === "http" || this.scheme === "https") if (p && p[0] !== "/") p = "/" + p;
    this.path = p;
  }

  static from(c: UriComponents): Uri {
    return new Uri(c);
  }

  static file(fsPath: string): Uri {
    let p = fsPath.replace(/\\/g, "/");
    let authority = "";
    // UNC: //server/share/x
    if (p.startsWith("//")) {
      const idx = p.indexOf("/", 2);
      authority = idx < 0 ? p.slice(2) : p.slice(2, idx);
      p = idx < 0 ? "/" : p.slice(idx);
    }
    if (/^[A-Za-z]:/.test(p)) p = "/" + p;
    return new Uri({ scheme: "file", authority, path: p });
  }

  static parse(value: string): Uri {
    const m = /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(value);
    if (!m) return new Uri({ scheme: "file", path: value });
    const dec = (s: string | undefined) => {
      if (!s) return "";
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    return new Uri({ scheme: m[1] ?? "file", authority: dec(m[2]), path: dec(m[3]), query: dec(m[4]), fragment: dec(m[5]) });
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path.replace(/\/+$/, ""), ...segments.map((s) => s.replace(/\\/g, "/"))].join("/");
    const parts: string[] = [];
    for (const seg of joined.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== "." && seg !== "") parts.push(seg);
    }
    return base.with({ path: "/" + parts.join("/") });
  }

  static revive(v: unknown): Uri {
    if (v instanceof Uri) return v;
    const o = v as { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string; fsPath?: string } | string;
    if (typeof o === "string") return Uri.parse(o);
    return new Uri({ scheme: o.scheme ?? "file", authority: o.authority, path: o.path, query: o.query, fragment: o.fragment });
  }

  get fsPath(): string {
    let v: string;
    if (this.authority && this.path.length > 1 && this.scheme === "file") v = `//${this.authority}${this.path}`;
    else if (isWinDrivePath(this.path)) v = this.path[1].toLowerCase() + this.path.slice(2);
    else v = this.path;
    return process.platform === "win32" ? v.replace(/\//g, "\\") : v;
  }

  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    return new Uri({
      scheme: change.scheme ?? this.scheme,
      authority: change.authority ?? this.authority,
      path: change.path ?? this.path,
      query: change.query ?? this.query,
      fragment: change.fragment ?? this.fragment,
    });
  }

  toString(): string {
    let out = this.scheme + ":";
    if (this.authority || this.scheme === "file") out += "//" + encodeURIComponent(this.authority).replace(/%3A/gi, ":").replace(/%40/g, "@");
    // Titik dua drive Windows di-encode (file:///c%3A/x), seperti VS Code.
    out += encodePath(this.path);
    if (this.query) out += "?" + encodeURIComponent(this.query);
    if (this.fragment) out += "#" + encodeURIComponent(this.fragment);
    return out;
  }

  toJSON() {
    return { $mid: 1, fsPath: this.fsPath, external: this.toString(), path: this.path, scheme: this.scheme, authority: this.authority || undefined, query: this.query || undefined, fragment: this.fragment || undefined };
  }
}
