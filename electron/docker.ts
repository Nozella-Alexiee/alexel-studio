// Panel Docker lewat CLI `docker` (tanpa socket langsung): daftar container & image, start/stop/
// restart/hapus, statistik, dan menyambungkan container database ke klien Database (password dari
// env container tetap di main process).

import { findExecutable, runCapture } from "./util";
import type { Ctx } from "./util";
import * as DB from "./db";
import type { DbConnection, DbKind } from "./db/types";

export interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  /** Port host → port container (TCP) yang dipublikasikan. */
  published: { host: number; container: number }[];
  project: string | null;
  service: string | null;
  created: string;
  /** Jenis database bila image dikenali. */
  db: DbKind | null;
}

export interface Image {
  id: string;
  repo: string;
  tag: string;
  size: string;
  created: string;
}

const docker = () => findExecutable("docker", ["/usr/local/bin", "/opt/homebrew/bin", "/Applications/Docker.app/Contents/Resources/bin"]);

async function run(args: string[], timeoutMs = 30_000): Promise<string> {
  const bin = docker();
  if (!bin) throw new Error("DOCKER_MISSING");
  const r = await runCapture(bin, args, { timeoutMs });
  if (r.timedOut) throw new Error("Docker tidak merespons (batas waktu).");
  if (!r.success) {
    const msg = (r.stderr || r.stdout).trim();
    if (/Cannot connect to the Docker daemon|daemon.*not running|error during connect/i.test(msg)) throw new Error("DOCKER_DOWN");
    throw new Error(msg || `docker ${args[0]} gagal`);
  }
  return r.stdout;
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const parseJsonLines = <T>(s: string) => lines(s).flatMap((l) => {
  try {
    return [JSON.parse(l) as T];
  } catch {
    return [];
  }
});

const DB_IMAGES: [RegExp, DbKind, number][] = [
  [/(^|\/)(postgres|postgis\/postgis|timescale\/timescaledb|bitnami\/postgresql|supabase\/postgres)(:|$)/, "postgres", 5432],
  [/(^|\/)(mysql|mariadb|bitnami\/mysql|bitnami\/mariadb|percona)(:|$)/, "mysql", 3306],
  [/(^|\/)(mongo|bitnami\/mongodb|mongodb\/mongodb-community-server)(:|$)/, "mongodb", 27017],
  [/(^|\/)(redis|valkey\/valkey|bitnami\/redis|redis\/redis-stack(-server)?|eqalpha\/keydb)(:|$)/, "redis", 6379],
];
export const dbKindOfImage = (image: string) => DB_IMAGES.find(([re]) => re.test(image))?.[1] ?? null;

/** "0.0.0.0:56432->5432/tcp, [::]:56432->5432/tcp" → [{host:56432, container:5432}] */
export function parsePorts(s: string): { host: number; container: number }[] {
  const out: { host: number; container: number }[] = [];
  for (const m of s.matchAll(/:(\d+)->(\d+)\/tcp/g)) {
    const p = { host: Number(m[1]), container: Number(m[2]) };
    if (!out.some((x) => x.host === p.host && x.container === p.container)) out.push(p);
  }
  return out;
}

const label = (labels: string, key: string) => new RegExp(`(?:^|,)${key.replace(/\./g, "\\.")}=([^,]*)`).exec(labels)?.[1] ?? null;

export async function dockerInfo(): Promise<{ installed: boolean; running: boolean; version: string | null }> {
  if (!docker()) return { installed: false, running: false, version: null };
  try {
    const v = (await run(["version", "--format", "{{.Server.Version}}"], 8000)).trim();
    return { installed: true, running: true, version: v || null };
  } catch {
    return { installed: true, running: false, version: null };
  }
}

export async function listContainers(): Promise<Container[]> {
  type Raw = { ID: string; Names: string; Image: string; State: string; Status: string; Ports: string; Labels: string; CreatedAt: string };
  return parseJsonLines<Raw>(await run(["ps", "-a", "--no-trunc", "--format", "{{json .}}"])).map((c) => ({
    id: c.ID.slice(0, 12),
    name: c.Names,
    image: c.Image,
    state: c.State,
    status: c.Status,
    ports: c.Ports,
    published: parsePorts(c.Ports),
    project: label(c.Labels ?? "", "com.docker.compose.project"),
    service: label(c.Labels ?? "", "com.docker.compose.service"),
    created: c.CreatedAt,
    db: dbKindOfImage(c.Image),
  }));
}

export async function listImages(): Promise<Image[]> {
  type Raw = { ID: string; Repository: string; Tag: string; Size: string; CreatedSince: string };
  return parseJsonLines<Raw>(await run(["images", "--format", "{{json .}}"])).map((i) => ({ id: i.ID, repo: i.Repository, tag: i.Tag, size: i.Size, created: i.CreatedSince }));
}

export async function containerStats(): Promise<Record<string, { cpu: string; mem: string }>> {
  type Raw = { ID: string; CPUPerc: string; MemUsage: string };
  const out: Record<string, { cpu: string; mem: string }> = {};
  for (const s of parseJsonLines<Raw>(await run(["stats", "--no-stream", "--format", "{{json .}}"], 20_000))) out[s.ID.slice(0, 12)] = { cpu: s.CPUPerc, mem: s.MemUsage.split(" / ")[0] };
  return out;
}

/** ID/nama container atau image; tidak boleh diawali "-" (terbaca sebagai opsi docker). */
export const ID = /^(?!-)[\w.-]{1,128}$/;
const ACTIONS = new Set(["start", "stop", "restart", "remove", "pause", "unpause"]);
export async function containerAction(id: string, action: "start" | "stop" | "restart" | "remove" | "pause" | "unpause") {
  if (!ID.test(id)) throw new Error("ID container tidak valid.");
  if (!ACTIONS.has(action)) throw new Error("Aksi container tidak dikenal.");
  const args = action === "remove" ? ["rm", "-f", id] : [action, id];
  await run(args, 60_000);
}

export async function removeImage(id: string) {
  if (!ID.test(id)) throw new Error("ID image tidak valid.");
  await run(["rmi", id], 60_000);
}

/** Nilai env container (dipakai hanya di main untuk kredensial DB). */
async function containerEnv(id: string): Promise<Record<string, string>> {
  const raw = JSON.parse((await run(["inspect", "--format", "{{json .Config.Env}}", id])).trim() || "[]") as string[];
  return Object.fromEntries((raw ?? []).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]));
}

/** Simpan container database sebagai koneksi (password dari env container, terenkripsi). */
export async function connectContainerDb(ctx: Ctx, id: string): Promise<DbConnection> {
  if (!ID.test(id)) throw new Error("ID container tidak valid.");
  const c = (await listContainers()).find((x) => x.id === id.slice(0, 12) || x.name === id);
  if (!c?.db) throw new Error("Container ini bukan database yang dikenali.");
  const port = { postgres: 5432, mysql: 3306, mongodb: 27017, redis: 6379, sqlite: 0 }[c.db];
  const pub = c.published.find((p) => p.container === port);
  if (!pub) throw new Error(`Port ${port} container tidak dipublikasikan ke host (tambahkan -p ${port}:${port}).`);
  const e = await containerEnv(c.id);
  let user = "";
  let password = "";
  let database = "";
  if (c.db === "postgres") {
    user = e.POSTGRES_USER || "postgres";
    password = e.POSTGRES_PASSWORD || "";
    database = e.POSTGRES_DB || user;
  } else if (c.db === "mysql") {
    user = e.MYSQL_USER || e.MARIADB_USER || "root";
    password = (user === "root" ? e.MYSQL_ROOT_PASSWORD || e.MARIADB_ROOT_PASSWORD : e.MYSQL_PASSWORD || e.MARIADB_PASSWORD) || "";
    database = e.MYSQL_DATABASE || e.MARIADB_DATABASE || "";
  } else if (c.db === "mongodb") {
    user = e.MONGO_INITDB_ROOT_USERNAME || "";
    password = e.MONGO_INITDB_ROOT_PASSWORD || "";
    database = e.MONGO_INITDB_DATABASE || "";
  } else if (c.db === "redis") password = e.REDIS_PASSWORD || "";
  const existing = DB.listConnections(ctx).find((x) => x.kind === c.db && x.host === "localhost" && x.port === pub.host);
  return DB.saveConnection(ctx, { ...(existing ? { id: existing.id } : {}), kind: c.db, name: `${c.name} (docker)`, host: "localhost", port: pub.host, user: user || undefined, database: database || undefined, password: password || undefined, env: "dev" });
}
