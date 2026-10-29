// Sidebar Remote SSH: host dari ~/.ssh/config atau yang disimpan, sambungkan lewat OpenSSH sistem,
// jelajahi folder server, buka/edit berkas (disimpan = diunggah), terminal SSH, buat/ganti nama/hapus.

import { ChevronDown, ChevronRight, File, Folder, FolderPlus, FilePlus, Pencil, Plug, Plus, RefreshCw, Server, SquareTerminal, Trash2, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { openFile } from "../app/actions";
import { runInTerminal } from "../app/run";
import { Empty, IconButton, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/ipc";
import { confirmDialog, promptDialog, toast } from "../state/store";
import { tl } from "../i18n";
import { create } from "zustand";

type Host = Awaited<ReturnType<typeof api.remoteHosts>>[number];
interface Conn {
  home: string;
  system: string;
  root: string;
}
const useRemote = create<{ conns: Record<string, Conn>; dirs: Record<string, { name: string; dir: boolean }[] | undefined>; open: Record<string, boolean> }>(() => ({ conns: {}, dirs: {}, open: {} }));
const key = (t: string, p: string) => `${t}\u0000${p}`;
const joinR = (a: string, b: string) => (a.endsWith("/") ? a + b : `${a}/${b}`);
const parentR = (p: string) => p.replace(/\/[^/]+\/?$/, "") || "/";

async function loadDir(target: string, dir: string) {
  try {
    const list = await api.remoteList(target, dir);
    useRemote.setState((s) => ({ dirs: { ...s.dirs, [key(target, dir)]: list } }));
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

function Node({ target, path, name, dir, depth }: { target: string; path: string; name: string; dir: boolean; depth: number }) {
  const open = useRemote((s) => !!s.open[key(target, path)]);
  const children = useRemote((s) => s.dirs[key(target, path)]);
  const [busy, setBusy] = useState(false);
  const toggle = () => {
    useRemote.setState((s) => ({ open: { ...s.open, [key(target, path)]: !open } }));
    if (!open && !children) void loadDir(target, path);
  };
  const openRemoteFile = async () => {
    setBusy(true);
    try {
      await openFile(await api.remoteOpen(target, path));
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const create = async (kind: "file" | "dir") => {
    const n = await promptDialog(kind === "file" ? tl("Berkas baru di server") : tl("Folder baru di server"), { placeholder: kind === "file" ? "main.py" : "src", validate: (v) => (!v.trim() || v.includes("/") ? tl("Nama tidak valid") : null) });
    if (!n) return;
    try {
      await api.remoteOp(target, kind === "file" ? "touch" : "mkdir", joinR(path, n.trim()));
      await loadDir(target, path);
      useRemote.setState((s) => ({ open: { ...s.open, [key(target, path)]: true } }));
      if (kind === "file") await openFile(await api.remoteOpen(target, joinR(path, n.trim())));
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const rename = async () => {
    const n = await promptDialog(tl("Ganti nama"), { defaultValue: name, validate: (v) => (!v.trim() || v.includes("/") ? tl("Nama tidak valid") : null) });
    if (!n || n === name) return;
    try {
      await api.remoteOp(target, "mv", path, joinR(parentR(path), n.trim()));
      await loadDir(target, parentR(path));
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const remove = async () => {
    if (!(await confirmDialog(tl("Hapus di server?"), tl("{path} dihapus permanen dari {host} (tidak ada tempat sampah).", { path, host: target }), tl("Hapus"), true))) return;
    try {
      await api.remoteOp(target, "rm", path);
      await loadDir(target, parentR(path));
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  return (
    <>
      <div className="tree-row rm-row" style={{ paddingLeft: 8 + depth * 12 }} onDoubleClick={() => (dir ? toggle() : void openRemoteFile())} title={path}>
        <button className="tree-chev" onClick={toggle} disabled={!dir} aria-label={open ? tl("Ciutkan") : tl("Bentangkan")}>
          {dir ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </button>
        {dir ? <Folder size={13} className="db-icon" /> : <File size={13} className="db-icon" />}
        <button className="db-label" onClick={() => (dir ? toggle() : void openRemoteFile())}>
          {name}
        </button>
        {busy && <Spinner size={11} />}
        <span className="db-conn-actions">
          {dir && (
            <>
              <IconButton label={tl("Berkas baru")} onClick={() => void create("file")}>
                <FilePlus size={12} />
              </IconButton>
              <IconButton label={tl("Folder baru")} onClick={() => void create("dir")}>
                <FolderPlus size={12} />
              </IconButton>
              <IconButton label={tl("Terminal di folder ini")} onClick={() => void api.remoteTerminalCmd(target, path).then((c) => runInTerminal(c, `ssh ${target}`))}>
                <SquareTerminal size={12} />
              </IconButton>
            </>
          )}
          <IconButton label={tl("Ganti nama")} onClick={() => void rename()}>
            <Pencil size={12} />
          </IconButton>
          <IconButton label={tl("Hapus")} onClick={() => void remove()}>
            <Trash2 size={12} />
          </IconButton>
        </span>
      </div>
      {dir && open && (children ? children.map((c) => <Node key={c.name} target={target} path={joinR(path, c.name)} name={c.name} dir={c.dir} depth={depth + 1} />) : <div className="pad-x hint" style={{ paddingLeft: 28 + depth * 12 }}><Spinner size={11} /></div>)}
      {dir && open && children?.length === 0 && <div className="hint rm-empty" style={{ paddingLeft: 36 + depth * 12 }}>{tl("(kosong)")}</div>}
    </>
  );
}

function HostRow({ h, refresh }: { h: Host; refresh: () => void }) {
  const conn = useRemote((s) => s.conns[h.target]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const terminal = () => void api.remoteTerminalCmd(h.target).then((c) => runInTerminal(c, `ssh ${h.target}`));
  const connect = async () => {
    setBusy(true);
    setErr(null);
    try {
      const c = await api.remoteConnect(h.target);
      const root = c.home;
      useRemote.setState((s) => ({ conns: { ...s.conns, [h.target]: { ...c, root } }, open: { ...s.open, [key(h.target, root)]: true } }));
      void loadDir(h.target, root);
    } catch (e) {
      const m = errMsg(e);
      setErr(m.startsWith("SSH_AUTH:") ? tl("Butuh password/passphrase atau kunci belum terdaftar. Masuk sekali lewat terminal SSH (koneksi dipakai ulang), lalu Sambungkan lagi.") : m.startsWith("SSH_HOSTKEY:") ? tl("Host key belum dikenal atau berubah. Buka terminal SSH untuk memeriksa & menerima fingerprint, lalu Sambungkan lagi.") : m);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = () => {
    void api.remoteDisconnect(h.target);
    useRemote.setState((s) => {
      const conns = { ...s.conns };
      delete conns[h.target];
      return { conns };
    });
  };
  const changeRoot = async () => {
    const p = await promptDialog(tl("Buka folder di server"), { defaultValue: conn?.root ?? "/", validate: (v) => (v.startsWith("/") ? null : tl("Pakai path absolut, mis. /var/www")) });
    if (!p) return;
    useRemote.setState((s) => ({ conns: { ...s.conns, [h.target]: { ...s.conns[h.target], root: p } }, open: { ...s.open, [key(h.target, p)]: true } }));
    void loadDir(h.target, p);
  };
  return (
    <section className="rm-host">
      <div className="tree-row db-conn-row">
        <span className={`db-kind-dot ${conn ? "is-on" : ""}`} style={{ background: conn ? "var(--success)" : undefined }} />
        <Server size={13} className="db-icon" />
        <span className="db-label db-conn-name" title={h.hostname ?? h.target}>
          {h.target}
          {h.hostname && <span className="ext-tree-desc">{`${h.user ? h.user + "@" : ""}${h.hostname}${h.port ? ":" + h.port : ""}`}</span>}
        </span>
        {busy ? (
          <Spinner size={12} />
        ) : (
          <span className="db-conn-actions is-shown">
            <IconButton label={tl("Terminal SSH")} onClick={terminal}>
              <SquareTerminal size={12} />
            </IconButton>
            {conn ? (
              <>
                <IconButton label={tl("Buka folder lain")} onClick={() => void changeRoot()}>
                  <Folder size={12} />
                </IconButton>
                <IconButton label={tl("Muat ulang")} onClick={() => void loadDir(h.target, conn.root)}>
                  <RefreshCw size={12} />
                </IconButton>
                <IconButton label={tl("Putuskan")} onClick={disconnect}>
                  <Unplug size={12} />
                </IconButton>
              </>
            ) : (
              <>
                <IconButton label={tl("Sambungkan")} onClick={() => void connect()}>
                  <Plug size={12} />
                </IconButton>
                {h.source === "saved" && (
                  <IconButton label={tl("Hapus dari daftar")} onClick={() => void api.remoteSaveHost(h.target, true).then(refresh)}>
                    <Trash2 size={12} />
                  </IconButton>
                )}
              </>
            )}
          </span>
        )}
      </div>
      {err && (
        <div className="db-conn-err">
          <pre>{err}</pre>
          <button className="btn btn-sm" onClick={terminal}>
            <SquareTerminal size={11} /> {tl("Buka terminal SSH")}
          </button>
        </div>
      )}
      {conn && (
        <div className="rm-tree">
          <div className="hint rm-root">
            {conn.system} · {conn.root}
          </div>
          <Node target={h.target} path={conn.root} name={conn.root} dir depth={1} />
        </div>
      )}
    </section>
  );
}

export default function RemotePanel() {
  const [hosts, setHosts] = useState<Host[] | null>(null);
  const refresh = () => void api.remoteHosts().then(setHosts).catch((e) => (toast(errMsg(e), "error"), setHosts([])));
  useEffect(refresh, []);
  const add = async () => {
    const t = await promptDialog(tl("Tambah server SSH"), { message: tl("Format user@host atau user@host:port. Autentikasi memakai kunci/agent SSH di perangkat ini."), placeholder: "deploy@203.0.113.10:22" });
    if (!t) return;
    try {
      await api.remoteSaveHost(t.trim());
      refresh();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  return (
    <div className="db-panel">
      <div className="side-head">
        <span className="side-title">Remote SSH</span>
        <div className="side-actions">
          <IconButton label={tl("Muat ulang")} onClick={refresh}>
            <RefreshCw size={13} />
          </IconButton>
          <IconButton label={tl("Tambah server SSH")} onClick={() => void add()}>
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <div className="side-scroll">
        {!hosts ? (
          <div className="pad">
            <Spinner />
          </div>
        ) : hosts.length ? (
          <div className="tree db-tree">{hosts.map((h) => <HostRow key={h.target} h={h} refresh={refresh} />)}</div>
        ) : (
          <Empty icon={<Server size={22} />} title={tl("Belum ada server")} action={<button className="btn btn-sm btn-primary" onClick={() => void add()}><Plus size={12} /> {tl("Tambah server SSH")}</button>}>
            {tl("Host dari ~/.ssh/config muncul otomatis. Berkas diedit sebagai salinan lokal dan diunggah saat disimpan.")}
          </Empty>
        )}
        <p className="hint pad-x rm-note">{tl("Remote lite: Explorer, editor, dan terminal di server. Language server & ekstensi tetap berjalan lokal.")}</p>
      </div>
    </div>
  );
}
