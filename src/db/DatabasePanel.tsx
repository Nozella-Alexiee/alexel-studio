// Sidebar Database: koneksi → schema → tabel/koleksi/key → kolom. Saran koneksi dari project
// (.env, Prisma, docker-compose, berkas SQLite) bisa disambungkan sekali klik.

import { ChevronDown, ChevronRight, Columns3, Database, Eye, KeyRound, Network, Pencil, Plug, Plus, RefreshCw, Sparkles, SquareTerminal, Table2, Trash2, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import type { DbSchema, DbTable } from "../../electron/db/types";
import { Empty, IconButton, Spinner } from "../components/ui";
import { useStore } from "../state/store";
import { tl } from "../i18n";
import { ConnectionDialog } from "./ConnectionDialog";
import { openDbTab } from "./open";
import { addDetected, disconnect, isSql, KIND_LABEL, loadSchema, refreshConns, refreshDetected, removeConn, useDb, type Conn } from "./state";

function TableNode({ conn, schema, t, depth }: { conn: Conn; schema: DbSchema; t: DbTable; depth: number }) {
  const [open, setOpen] = useState(false);
  const icon = t.kind === "view" ? <Eye size={13} /> : t.kind === "key" ? <KeyRound size={13} /> : t.kind === "collection" ? <Columns3 size={13} /> : <Table2 size={13} />;
  const schemaName = conn.kind === "redis" || conn.kind === "mongodb" || conn.kind === "sqlite" ? null : schema.name;
  return (
    <>
      <div className="tree-row db-node" style={{ paddingLeft: 8 + depth * 12 }} onDoubleClick={() => openDbTab("table", conn.id, schemaName, t.name, t.name)} title={t.detail ? `${t.name} · ${t.detail}` : t.name}>
        <button className="tree-chev" onClick={() => setOpen((o) => !o)} aria-label={open ? tl("Ciutkan") : tl("Bentangkan")} disabled={!t.columns.length}>
          {t.columns.length ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </button>
        <span className="db-icon">{icon}</span>
        <button className="db-label" onClick={() => openDbTab("table", conn.id, schemaName, t.name, t.name)}>
          {t.name}
          {t.detail && <span className="ext-tree-desc">{t.detail}</span>}
        </button>
      </div>
      {open &&
        t.columns.map((c) => {
          const fk = t.fks.find((f) => f.columns.includes(c.name));
          return (
            <div key={c.name} className="tree-row db-col" style={{ paddingLeft: 36 + depth * 12 }} title={`${c.name} ${c.type}${c.nullable ? "" : " NOT NULL"}${c.default ? ` DEFAULT ${c.default}` : ""}${fk ? ` → ${fk.refTable}` : ""}`}>
              {c.pk ? <KeyRound size={11} className="db-pk-ico" aria-label="PK" /> : fk ? <Network size={11} className="db-fk-ico" aria-label="FK" /> : <span className="db-col-dot" />}
              <span className="db-col-name">{c.name}</span>
              <span className="ext-tree-desc">{c.type}</span>
            </div>
          );
        })}
    </>
  );
}

function SchemaNode({ conn, s, depth, single }: { conn: Conn; s: DbSchema; depth: number; single: boolean }) {
  const [open, setOpen] = useState(single || s.name === "public" || s.name === conn.database);
  if (single) return <>{s.tables.map((t) => <TableNode key={t.name} conn={conn} schema={s} t={t} depth={depth} />)}</>;
  return (
    <>
      <div className="tree-row db-node" style={{ paddingLeft: 8 + depth * 12 }}>
        <button className="tree-chev" onClick={() => setOpen((o) => !o)} aria-label={open ? tl("Ciutkan") : tl("Bentangkan")}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="db-label db-schema" onClick={() => setOpen((o) => !o)}>
          {s.name || tl("(tanpa prefix)")}
          <span className="ext-tree-desc">{s.tables.length}</span>
        </span>
      </div>
      {open && s.tables.map((t) => <TableNode key={t.name} conn={conn} schema={s} t={t} depth={depth + 1} />)}
    </>
  );
}

function ConnNode({ conn }: { conn: Conn }) {
  const schema = useDb((s) => s.schemas[conn.id]);
  const loading = useDb((s) => s.loading[conn.id]);
  const error = useDb((s) => s.errors[conn.id]);
  const [open, setOpen] = useState(false);
  const toggle = () => {
    if (!open) void loadSchema(conn.id);
    setOpen((o) => !o);
  };
  const [filter, setFilter] = useState("");
  const shown = (schema ?? []).map((s) => ({ ...s, tables: filter ? s.tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase())) : s.tables })).filter((s) => !filter || s.tables.length);
  const total = (schema ?? []).reduce((a, s) => a + s.tables.length, 0);
  return (
    <section className={`db-conn ${conn.env === "prod" ? "is-prod" : ""}`}>
      <div className="tree-row db-conn-row" onDoubleClick={toggle}>
        <button className="tree-chev" onClick={toggle} aria-expanded={open} aria-label={open ? tl("Ciutkan") : tl("Bentangkan")}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className={`db-kind-dot db-k-${conn.kind} ${conn.connected ? "is-on" : ""}`} title={conn.connected ? tl("Tersambung") : tl("Belum tersambung")} />
        <button className="db-label db-conn-name" onClick={toggle} title={`${KIND_LABEL[conn.kind]} · ${conn.url ?? conn.file ?? conn.host ?? ""}`}>
          {conn.name}
          {conn.env && conn.env !== "dev" && <span className={`db-env db-env-${conn.env}`}>{conn.env === "prod" ? tl("produksi") : conn.env}</span>}
          {conn.readOnly && <span className="db-env">RO</span>}
        </button>
        <span className="db-conn-actions">
          <IconButton label={tl("Konsol query")} onClick={() => openDbTab("console", conn.id, null, null, conn.name)}>
            <SquareTerminal size={12} />
          </IconButton>
          {isSql(conn.kind) && (
            <IconButton label={tl("Diagram ER")} onClick={() => openDbTab("er", conn.id, null, null, conn.name)}>
              <Network size={12} />
            </IconButton>
          )}
          <IconButton label={tl("Muat ulang skema")} onClick={() => void loadSchema(conn.id, true).then(() => setOpen(true))}>
            <RefreshCw size={12} />
          </IconButton>
          <IconButton label={tl("Ubah koneksi")} onClick={() => useDb.setState({ editing: { ...conn } })}>
            <Pencil size={12} />
          </IconButton>
          {conn.connected ? (
            <IconButton label={tl("Putuskan")} onClick={() => void disconnect(conn.id)}>
              <Unplug size={12} />
            </IconButton>
          ) : (
            <IconButton label={tl("Hapus koneksi")} onClick={() => void removeConn(conn.id)}>
              <Trash2 size={12} />
            </IconButton>
          )}
        </span>
      </div>
      {open && (
        <div className="db-conn-body">
          {loading && !schema && (
            <div className="pad-x hint">
              <Spinner size={12} /> {tl("Menyambung…")}
            </div>
          )}
          {error && (
            <div className="db-conn-err">
              <pre>{error}</pre>
              <button className="btn btn-sm" onClick={() => useDb.setState({ editing: { ...conn } })}>
                {tl("Ubah koneksi")}
              </button>
            </div>
          )}
          {schema && total > 15 && <input className="input db-tree-filter" placeholder={tl("Saring {n} objek…", { n: total })} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={tl("Saring tabel")} />}
          {schema && !total && <div className="pad-x hint">{conn.kind === "redis" ? tl("Tidak ada key.") : tl("Belum ada tabel.")}</div>}
          {shown.map((s) => (
            <SchemaNode key={s.name} conn={conn} s={s} depth={1} single={(schema?.length ?? 0) === 1 && conn.kind !== "redis"} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function DatabasePanel() {
  const conns = useDb((s) => s.conns);
  const detected = useDb((s) => s.detected);
  const root = useStore((s) => s.root);
  useEffect(() => {
    void refreshConns().then(refreshDetected);
  }, [root]);
  return (
    <div className="db-panel">
      <div className="side-head">
        <span className="side-title">{tl("Database")}</span>
        <div className="side-actions">
          <IconButton label={tl("Tanya data dengan AI")} onClick={() => conns[0] && openDbTab("console", (conns.find((c) => c.connected) ?? conns[0]).id, null, null, (conns.find((c) => c.connected) ?? conns[0]).name, { ai: true })} disabled={!conns.length}>
            <Sparkles size={13} />
          </IconButton>
          <IconButton label={tl("Muat ulang")} onClick={() => void refreshConns().then(refreshDetected)}>
            <RefreshCw size={13} />
          </IconButton>
          <IconButton label={tl("Koneksi baru")} onClick={() => useDb.setState({ editing: {} })}>
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <div className="side-scroll">
        {detected.length > 0 && (
          <div className="db-detected">
            <div className="git-section-head">
              <span>{tl("Ditemukan di project")}</span>
            </div>
            {detected.map((d) => (
              <div key={d.key} className="db-suggest" title={d.url ?? d.file}>
                <span className={`db-kind-dot db-k-${d.kind}`} />
                <span className="db-suggest-text">
                  <strong>{d.name}</strong>
                  <small className="hint">{d.source}</small>
                </span>
                <button className="btn btn-sm" onClick={() => void addDetected(d)}>
                  <Plug size={11} /> {tl("Sambungkan")}
                </button>
              </div>
            ))}
          </div>
        )}
        {conns.length ? (
          <div className="tree db-tree">{conns.map((c) => <ConnNode key={c.id} conn={c} />)}</div>
        ) : (
          !detected.length && (
            <Empty
              icon={<Database size={22} />}
              title={tl("Belum ada koneksi")}
              action={
                <button className="btn btn-primary btn-sm" onClick={() => useDb.setState({ editing: {} })}>
                  <Plus size={12} /> {tl("Koneksi baru")}
                </button>
              }
            >
              {tl("PostgreSQL, MySQL/MariaDB, SQLite, MongoDB, dan Redis. Password disimpan terenkripsi di perangkat ini.")}
            </Empty>
          )
        )}
      </div>
      <ConnectionDialog />
    </div>
  );
}
