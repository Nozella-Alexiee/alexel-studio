// Sidebar Docker: berkas compose di project (up/down/logs), container per project compose
// (start/stop/restart/hapus, log & shell di terminal, sambungkan DB), dan image.

import { Boxes, ChevronDown, ChevronRight, Container as Box, Database, ExternalLink, FileCode2, Gauge, Pause, Play, RefreshCw, RotateCw, ScrollText, Square, SquareTerminal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { openFile } from "../app/actions";
import { runInTerminal } from "../app/run";
import { Empty, IconButton, Spinner } from "../components/ui";
import { api, errMsg, openExternal, type DockerContainer, type DockerImage } from "../lib/ipc";
import { relative } from "../lib/paths";
import { confirmDialog, setLayout, toast, useStore } from "../state/store";
import { tl } from "../i18n";

const q = (s: string) => (/^[\w./:@-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

function ContainerRow({ c, stats, busy, act }: { c: DockerContainer; stats?: { cpu: string; mem: string }; busy: boolean; act: (c: DockerContainer, a: "start" | "stop" | "restart" | "remove" | "pause" | "unpause") => void }) {
  const running = c.state === "running";
  const paused = c.state === "paused";
  const connect = async () => {
    try {
      const conn = await api.dockerDbConnect(c.id);
      const D = await import("../db/state");
      await D.refreshConns();
      void D.loadSchema(conn.id, true);
      setLayout({ sidebar: true, sideView: "db" });
      toast(tl("Koneksi {name} ditambahkan", { name: conn.name }), "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  return (
    <div className={`tree-row dk-row is-${c.state}`} title={`${c.image}\n${c.status}${c.ports ? `\n${c.ports}` : ""}`}>
      <span className={`dk-dot is-${c.state}`} aria-label={c.state} />
      <span className="dk-main">
        <span className="dk-name">{c.service ?? c.name}</span>
        <span className="dk-sub">
          {c.image}
          {stats && running && ` · ${stats.cpu} · ${stats.mem}`}
        </span>
        {c.published.length > 0 && (
          <span className="dk-ports">
            {c.published.slice(0, 4).map((p) => (
              <button key={`${p.host}-${p.container}`} className="dk-port" onClick={() => void openExternal(`http://localhost:${p.host}`)} title={tl("Buka http://localhost:{port}", { port: p.host })} disabled={!running || !!c.db}>
                {p.host}→{p.container}
                {!c.db && running && <ExternalLink size={9} />}
              </button>
            ))}
          </span>
        )}
      </span>
      <span className="dk-actions">
        {busy ? (
          <Spinner size={12} />
        ) : (
          <>
            {c.db && running && (
              <IconButton label={tl("Sambungkan di Database")} onClick={() => void connect()}>
                <Database size={12} />
              </IconButton>
            )}
            {running && (
              <IconButton label={tl("Shell di container")} onClick={() => void runInTerminal(`docker exec -it ${q(c.name)} sh -c 'command -v bash >/dev/null && exec bash || exec sh'`, c.name)}>
                <SquareTerminal size={12} />
              </IconButton>
            )}
            <IconButton label={tl("Log (ikuti)")} onClick={() => void runInTerminal(`docker logs -f --tail 300 ${q(c.name)}`, tl("log {name}", { name: c.name }))}>
              <ScrollText size={12} />
            </IconButton>
            {running ? (
              <>
                <IconButton label={tl("Mulai ulang")} onClick={() => act(c, "restart")}>
                  <RotateCw size={12} />
                </IconButton>
                <IconButton label={tl("Hentikan")} onClick={() => act(c, "stop")}>
                  <Square size={12} />
                </IconButton>
              </>
            ) : paused ? (
              <IconButton label={tl("Lanjutkan")} onClick={() => act(c, "unpause")}>
                <Play size={12} />
              </IconButton>
            ) : (
              <IconButton label={tl("Jalankan")} onClick={() => act(c, "start")}>
                <Play size={12} />
              </IconButton>
            )}
            {running && (
              <IconButton label={tl("Jeda")} onClick={() => act(c, "pause")}>
                <Pause size={12} />
              </IconButton>
            )}
            <IconButton label={tl("Hapus container")} onClick={() => act(c, "remove")}>
              <Trash2 size={12} />
            </IconButton>
          </>
        )}
      </span>
    </div>
  );
}

function Group({ title, children, count, defaultOpen = true, actions }: { title: React.ReactNode; children: React.ReactNode; count?: number; defaultOpen?: boolean; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <div className="git-section-head dk-group">
        <button className="tree-chev" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? tl("Ciutkan") : tl("Bentangkan")}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span onClick={() => setOpen((o) => !o)}>{title}</span>
        {count !== undefined && <span className="count-badge">{count}</span>}
        <span className="spacer" />
        {actions}
      </div>
      {open && children}
    </section>
  );
}

// Data terakhir disimpan di modul supaya panel yang dibuka ulang langsung tampil (tanpa kedip "kosong").
const cache: { info: { installed: boolean; running: boolean; version: string | null } | null; containers: DockerContainer[]; images: DockerImage[] } = { info: null, containers: [], images: [] };

export default function DockerPanel() {
  const root = useStore((s) => s.root);
  const [info, setInfoState] = useState(cache.info);
  const [containers, setContainersState] = useState<DockerContainer[]>(cache.containers);
  const [images, setImagesState] = useState<DockerImage[]>(cache.images);
  const setInfo = (v: typeof cache.info) => setInfoState((cache.info = v));
  const setContainers = (v: DockerContainer[]) => setContainersState((cache.containers = v));
  const setImages = (v: DockerImage[]) => setImagesState((cache.images = v));
  const [stats, setStats] = useState<Record<string, { cpu: string; mem: string }>>({});
  const [composeFiles, setComposeFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const i = await api.dockerInfo();
      setInfo(i);
      if (i.running) {
        const [c, im] = await Promise.all([api.dockerContainers(), api.dockerImages()]);
        setContainers(c);
        setImages(im);
      }
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => document.visibilityState === "visible" && void api.dockerContainers().then(setContainers).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!root) return setComposeFiles([]);
    void api
      .listFiles(root)
      .then((l) => setComposeFiles(l.filter((p) => /(^|[\\/])(docker-)?compose(\.[\w-]+)?\.ya?ml$/i.test(p)).slice(0, 20)))
      .catch(() => setComposeFiles([]));
  }, [root]);

  const act = async (c: DockerContainer, a: "start" | "stop" | "restart" | "remove" | "pause" | "unpause") => {
    if (a === "remove" && !(await confirmDialog(tl("Hapus container {name}?", { name: c.name }), tl("Container dihentikan dan dihapus. Volume bernama tidak ikut terhapus."), tl("Hapus"), true))) return;
    setBusy((b) => ({ ...b, [c.id]: true }));
    try {
      await api.dockerAction(c.id, a);
      setContainers(await api.dockerContainers());
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }));
    }
  };
  const rmi = async (im: DockerImage) => {
    if (!(await confirmDialog(tl("Hapus image {name}?", { name: `${im.repo}:${im.tag}` }), tl("Image yang dipakai container tidak bisa dihapus."), tl("Hapus"), true))) return;
    try {
      await api.dockerRmi(im.id);
      setImages(await api.dockerImages());
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const head = (
    <div className="side-head">
      <span className="side-title">Docker</span>
      <div className="side-actions">
        <IconButton label={tl("Statistik CPU/memori")} onClick={() => void api.dockerStats().then(setStats).catch((e) => toast(errMsg(e), "error"))} disabled={!info?.running}>
          <Gauge size={13} />
        </IconButton>
        <IconButton label={tl("Muat ulang")} onClick={() => void refresh()}>
          {loading ? <Spinner size={12} /> : <RefreshCw size={13} />}
        </IconButton>
      </div>
    </div>
  );
  if (!info)
    return (
      <div className="db-panel">
        {head}
        <div className="pad">
          <Spinner />
        </div>
      </div>
    );
  if (!info.installed || !info.running)
    return (
      <div className="db-panel">
        {head}
        <Empty
          icon={<Boxes size={22} />}
          title={info.installed ? tl("Docker belum berjalan") : tl("Docker belum terpasang")}
          action={
            info.installed ? (
              <button className="btn btn-sm" onClick={() => void refresh()}>
                <RefreshCw size={12} /> {tl("Coba lagi")}
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={() => void openExternal("https://docs.docker.com/get-docker/")}>
                {tl("Cara memasang Docker")}
              </button>
            )
          }
        >
          {info.installed ? tl("Jalankan Docker Desktop (atau daemon Docker), lalu muat ulang.") : tl("Pasang Docker Desktop, OrbStack, atau Colima untuk mengelola container dari sini.")}
        </Empty>
      </div>
    );

  const byProject = new Map<string, DockerContainer[]>();
  for (const c of containers) {
    const k = c.project ?? "";
    byProject.set(k, [...(byProject.get(k) ?? []), c]);
  }
  const projects = [...byProject.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  return (
    <div className="db-panel">
      {head}
      <div className="side-scroll">
        <div className="pad-x hint dk-version">Docker {info.version}</div>
        {composeFiles.length > 0 && (
          <Group title="Compose" count={composeFiles.length}>
            {composeFiles.map((f) => {
              const rel = root ? relative(root, f) : f;
              return (
                <div key={f} className="tree-row dk-row" title={f}>
                  <FileCode2 size={13} className="db-icon" />
                  <button className="db-label" onClick={() => void openFile(f)}>
                    {rel}
                  </button>
                  <span className="dk-actions is-shown">
                    <IconButton label={tl("compose up -d")} onClick={() => void runInTerminal(`docker compose -f ${q(rel)} up -d`, "compose up").then(() => setTimeout(() => void refresh(), 4000))}>
                      <Play size={12} />
                    </IconButton>
                    <IconButton label={tl("compose logs -f")} onClick={() => void runInTerminal(`docker compose -f ${q(rel)} logs -f --tail 200`, "compose logs")}>
                      <ScrollText size={12} />
                    </IconButton>
                    <IconButton label={tl("compose down")} onClick={async () => (await confirmDialog(tl("Hentikan semua layanan {name}?", { name: rel }), tl("Menjalankan docker compose down (volume tidak dihapus)."), "down")) && void runInTerminal(`docker compose -f ${q(rel)} down`, "compose down").then(() => setTimeout(() => void refresh(), 4000))}>
                      <Square size={12} />
                    </IconButton>
                  </span>
                </div>
              );
            })}
          </Group>
        )}
        {containers.length === 0 && !loading && <Empty icon={<Box size={20} />} title={tl("Belum ada container")} />}
        {projects.map((p) => {
          const list = byProject.get(p)!;
          const up = list.filter((c) => c.state === "running").length;
          return (
            <Group key={p || "~"} title={p || tl("Container lain")} count={list.length} actions={<span className="hint dk-up">{tl("{n} jalan", { n: up })}</span>}>
              {list.map((c) => (
                <ContainerRow key={c.id} c={c} stats={stats[c.id]} busy={!!busy[c.id]} act={(x, a) => void act(x, a)} />
              ))}
            </Group>
          );
        })}
        <Group title={tl("Image")} count={images.length} defaultOpen={false}>
          {images.map((im) => (
            <div key={im.id + im.tag} className="tree-row dk-row" title={`${im.id} · ${im.created}`}>
              <span className="dk-main">
                <span className="dk-name">
                  {im.repo}
                  <span className="hint">:{im.tag}</span>
                </span>
                <span className="dk-sub">
                  {im.size} · {im.created}
                </span>
              </span>
              <span className="dk-actions">
                <IconButton label={tl("Hapus image")} onClick={() => void rmi(im)}>
                  <Trash2 size={12} />
                </IconButton>
              </span>
            </div>
          ))}
        </Group>
      </div>
    </div>
  );
}
