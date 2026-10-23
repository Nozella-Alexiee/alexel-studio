// Memento (globalState/workspaceState): JSON di disk, ditulis ditunda supaya cepat.

import fs from "node:fs";
import path from "node:path";

export class Memento {
  private data: Record<string, unknown> = {};
  private timer: NodeJS.Timeout | null = null;
  constructor(private file: string) {
    try {
      this.data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      this.data = {};
    }
  }
  keys(): readonly string[] {
    return Object.keys(this.data);
  }
  get<T>(key: string, def?: T): T | undefined {
    return key in this.data ? (JSON.parse(JSON.stringify(this.data[key])) as T) : def;
  }
  update(key: string, value: unknown): Promise<void> {
    if (value === undefined) delete this.data[key];
    else this.data[key] = JSON.parse(JSON.stringify(value));
    this.schedule();
    return Promise.resolve();
  }
  setKeysForSync(_keys: readonly string[]) {
    /* tidak ada sinkronisasi */
  }
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    } catch {
      /* disk penuh / tidak bisa ditulis: abaikan */
    }
  }
  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 400);
    this.timer.unref?.();
  }
}
