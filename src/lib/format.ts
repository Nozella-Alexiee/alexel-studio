import { lang, tl } from "../i18n";

const locale = () => (lang === "id" ? "id-ID" : undefined);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return tl("baru saja");
  if (s < 60) return tl("{n} dtk lalu", { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return tl("{n} mnt lalu", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return tl("{n} jam lalu", { n: h });
  const d = Math.round(h / 24);
  if (d < 30) return tl("{n} hari lalu", { n: d });
  return new Date(ms).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return tl("{n} dtk", { n: (ms / 1000).toFixed(1) });
  const m = Math.floor(ms / 60_000);
  return tl("{m} mnt {s} dtk", { m, s: Math.round((ms % 60_000) / 1000) });
}

/** Hapus kode warna/kursor ANSI dari output terminal. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, "").replace(/\r(?!\n)/g, "");
}
