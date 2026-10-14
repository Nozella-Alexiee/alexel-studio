// Info sistem: baterai (mode hemat), port yang listen, menghentikan proses.

import { isMac, isWin, runCapture } from "./util";

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

export async function powerStatus(isOnBattery?: boolean): Promise<PowerStatus> {
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

export async function listPorts(): Promise<ListeningPort[]> {
  if (isWin) {
    const r = await runCapture("netstat", ["-ano", "-p", "TCP"], { timeoutMs: 6000 });
    return r.stdout
      .split("\n")
      .filter((l) => /LISTENING/.test(l))
      .map((l) => l.trim().split(/\s+/))
      .map((f) => ({ pid: Number(f[4]), process: "", port: Number(f[1].split(":").pop()), address: f[1].replace(/:\d+$/, ""), command: "" }))
      .filter((p) => p.pid !== process.pid);
  }
  const r = await runCapture("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"], { timeoutMs: 6000 });
  const ports = parseLsof(r.stdout).filter((p) => p.pid !== process.pid);
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
  try {
    process.kill(pid, force ? "SIGKILL" : "SIGTERM");
  } catch (e) {
    throw new Error(`Gagal menghentikan proses ${pid}: ${(e as Error).message}`);
  }
}
