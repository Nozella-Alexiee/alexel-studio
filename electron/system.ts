// Info sistem: baterai (mode hemat), port yang listen, menghentikan proses.

import fs from "node:fs";
import { findExecutable, isMac, isWin, runCapture } from "./util";

export interface PowerStatus {
  on_battery: boolean;
  percent: number | null;
  charging: boolean;
  low_power_mode: boolean;
}

export function parsePmset(batt: string): PowerStatus {
  const onBattery = batt.includes("'Battery Power'");
  const pct = /(\d{1,3})%/.exec(batt);
  return {
    on_battery: onBattery,
    percent: pct ? Number(pct[1]) : null,
    charging: batt.includes("; charging;") || (batt.includes("; charged;") && !onBattery),
    low_power_mode: false,
  };
}

/** Linux: baca /sys/class/power_supply/BAT*. */
function linuxBattery(isOnBattery?: boolean): PowerStatus {
  try {
    const dir = "/sys/class/power_supply";
    const bat = fs.readdirSync(dir).find((d) => d.startsWith("BAT"));
    if (bat) {
      const percent = Number(fs.readFileSync(`${dir}/${bat}/capacity`, "utf8").trim());
      const status = fs.readFileSync(`${dir}/${bat}/status`, "utf8").trim();
      return { on_battery: status === "Discharging", percent: Number.isFinite(percent) ? percent : null, charging: status === "Charging", low_power_mode: false };
    }
  } catch {
    /* tidak ada baterai */
  }
  return { on_battery: !!isOnBattery, percent: null, charging: false, low_power_mode: false };
}

export async function powerStatus(isOnBattery?: boolean): Promise<PowerStatus> {
  if (process.platform === "linux") return linuxBattery(isOnBattery);
  if (!isMac) return { on_battery: !!isOnBattery, percent: null, charging: false, low_power_mode: false };
  const r = await runCapture("pmset", ["-g", "batt"], { timeoutMs: 3000 });
  const st = parsePmset(r.stdout);
  const g = await runCapture("pmset", ["-g"], { timeoutMs: 3000 }).catch(() => null);
  st.low_power_mode = !!g?.stdout.split("\n").some((l) => l.trim().startsWith("lowpowermode") && l.trim().endsWith("1"));
  return st;
}

export interface ListeningPort {
  pid: number;
  process: string;
  port: number;
  address: string;
  command: string;
}

/** Parse `lsof -nP -iTCP -sTCP:LISTEN -Fpcn`. */
export function parseLsof(out: string): ListeningPort[] {
  const res = new Map<string, ListeningPort>();
  let pid = 0;
  let name = "";
  for (const line of out.split("\n")) {
    const tag = line[0];
    const val = line.slice(1);
    if (tag === "p") pid = Number(val) || 0;
    else if (tag === "c") name = val;
    else if (tag === "n") {
      const i = val.lastIndexOf(":");
      const port = Number(val.slice(i + 1));
      if (i < 0 || !Number.isInteger(port)) continue;
      const key = `${port}-${pid}`;
      if (!res.has(key)) res.set(key, { pid, process: name, port, address: val.slice(0, i).replace(/^\[|\]$/g, ""), command: "" });
    }
  }
  return [...res.values()].sort((a, b) => a.port - b.port || a.pid - b.pid);
}

/** Parse `netstat -ano -p TCP`. Baris listen dikenali dari alamat asing 0.0.0.0:0 / [::]:0 (tidak bergantung bahasa Windows). */
export function parseNetstat(out: string): ListeningPort[] {
  const res = new Map<string, ListeningPort>();
  for (const line of out.split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 5 || !/^TCP/i.test(f[0]) || !/^(0\.0\.0\.0|\[::\]):0$/.test(f[2])) continue;
    const port = Number(f[1].split(":").pop());
    const pid = Number(f[f.length - 1]);
    if (!Number.isInteger(port) || !pid) continue;
    res.set(`${port}-${pid}`, { pid, process: "", port, address: f[1].replace(/:\d+$/, "").replace(/^\[|\]$/g, ""), command: "" });
  }
  return [...res.values()].sort((a, b) => a.port - b.port);
}

/** Parse `ss -Htlnp` (Linux tanpa lsof). */
export function parseSs(out: string): ListeningPort[] {
  const res = new Map<string, ListeningPort>();
  for (const line of out.split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f.length < 5) continue;
    const local = f[3];
    const i = local.lastIndexOf(":");
    const port = Number(local.slice(i + 1));
    const m = /\("([^"]+)",pid=(\d+)/.exec(line);
    if (!Number.isInteger(port) || !m) continue;
    const pid = Number(m[2]);
    res.set(`${port}-${pid}`, { pid, process: m[1], port, address: local.slice(0, i).replace(/^\[|\]$/g, "").replace(/%.*$/, ""), command: "" });
  }
  return [...res.values()].sort((a, b) => a.port - b.port);
}

async function windowsPorts(): Promise<ListeningPort[]> {
  const ps = 'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; [pscustomobject]@{a=[string]$_.LocalAddress;port=[int]$_.LocalPort;pid=[int]$_.OwningProcess;name=[string]$p.ProcessName;cmd=[string]$p.Path} } | ConvertTo-Json -Compress';
  const r = await runCapture("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeoutMs: 8000 }).catch(() => null);
  if (r?.success && r.stdout.trim()) {
    const j = JSON.parse(r.stdout) as { a: string; port: number; pid: number; name: string; cmd: string } | { a: string; port: number; pid: number; name: string; cmd: string }[];
    const seen = new Set<string>();
    return (Array.isArray(j) ? j : [j])
      .filter((x) => !seen.has(`${x.port}-${x.pid}`) && seen.add(`${x.port}-${x.pid}`))
      .map((x) => ({ pid: x.pid, process: x.name ?? "", port: x.port, address: x.a, command: x.cmd ?? "" }))
      .sort((a, b) => a.port - b.port);
  }
  const n = await runCapture("netstat", ["-ano", "-p", "TCP"], { timeoutMs: 6000 });
  return parseNetstat(n.stdout);
}

export async function listPorts(): Promise<ListeningPort[]> {
  if (isWin) return (await windowsPorts()).filter((p) => p.pid !== process.pid);
  let ports: ListeningPort[];
  if (!isMac && !findExecutable("lsof")) {
    const r = await runCapture("ss", ["-Htlnp"], { timeoutMs: 6000 });
    if (!r.success) throw new Error("Perintah `ss` atau `lsof` tidak tersedia. Pasang paket iproute2 atau lsof.");
    ports = parseSs(r.stdout);
  } else {
    const r = await runCapture("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"], { timeoutMs: 6000 });
    ports = parseLsof(r.stdout);
  }
  ports = ports.filter((p) => p.pid !== process.pid);
  await Promise.all(
    ports.map(async (p) => {
      const c = await runCapture("ps", ["-o", "command=", "-p", String(p.pid)], { timeoutMs: 2000 }).catch(() => null);
      p.command = (c?.stdout.trim() ?? "").slice(0, 300);
    })
  );
  return ports;
}

export function killProcess(pid: number, force: boolean, ownPids: number[] = []) {
  if (pid <= 1 || pid === process.pid || ownPids.includes(pid)) throw new Error("Proses ini tidak boleh dihentikan.");
  if (isWin) {
    void runCapture("taskkill", ["/pid", String(pid), "/T", ...(force ? ["/F"] : [])], { timeoutMs: 5000 });
    return;
  }
  try {
    process.kill(pid, force ? "SIGKILL" : "SIGTERM");
  } catch (e) {
    throw new Error(`Gagal menghentikan proses ${pid}: ${(e as Error).message}`);
  }
}
