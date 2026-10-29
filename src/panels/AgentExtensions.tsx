// Bagian "Agen AI" di panel Ekstensi: pasang Claude Code, Codex, Gemini seperti ekstensi VS Code.
// Paket resmi diunduh dari Open VSX dan hanya biner agennya yang dipakai (lihat electron/agents/install.ts).

import { CheckCircle2, Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AGENTS, agentInfo, type AgentId } from "../agents/registry";
import { detectAgent, selectAgent } from "../claude/claude";
import { CrabMascot } from "../components/CrabMascot";
import { api, errMsg, isWindows, on, openExternal } from "../lib/ipc";
import { confirmDialog, toast, useStore } from "../state/store";
import { tl } from "../i18n";

const LOGO: Record<AgentId, { mark: string; bg: string }> = {
  claude: { mark: "✳", bg: "#d97757" },
  codex: { mark: "◎", bg: "#10a37f" },
  gemini: { mark: "✦", bg: "#4285f4" },
  antigravity: { mark: "▲", bg: "#1a73e8" },
  acp: { mark: "⇄", bg: "#6e7681" },
};

/** Paket agen yang bisa dipasang dari Open VSX (cocok dengan hasil pencarian ekstensi). */
export function agentForPackage(namespace: string, name: string): AgentId | null {
  const a = AGENTS.find((x) => x.openVsx && x.openVsx.namespace.toLowerCase() === namespace.toLowerCase() && x.openVsx.name === name);
  return a?.id ?? null;
}

const progress: Record<string, { phase: string; pct: number | null }> = {};
const listeners = new Set<() => void>();
void on<{ agent: string; phase: string; pct: number | null }>("agent-install-progress", (p) => {
  progress[p.agent] = { phase: p.phase, pct: p.pct };
  listeners.forEach((l) => l());
});

export async function installAgent(agent: AgentId) {
  const info = agentInfo(agent);
  if (agent === "codex" && isWindows) {
    toast(tl("Codex untuk Windows belum ada di Open VSX. Pasang lewat terminal: npm install -g @openai/codex"), "info");
    const { runInTerminal } = await import("../app/run");
    await runInTerminal("npm install -g @openai/codex", tl("Pasang {name}", { name: "Codex" }));
    return;
  }
  try {
    const r = await api.agentInstall(agent);
    toast(`${info.name} ${r.version} terpasang`, "success");
    await detectAgent(agent);
    if (useStore.getState().settings.agent !== agent && (await confirmDialog(tl("Pakai {name} sekarang?", { name: info.name }), tl("Panel Agen AI akan beralih ke agen ini."), tl("Pakai")))) await selectAgent(agent);
  } catch (e) {
    toast(`${info.name}: ${errMsg(e)}`, "error");
  } finally {
    delete progress[agent];
    listeners.forEach((l) => l());
  }
}

function AgentCard({ id }: { id: AgentId }) {
  const a = agentInfo(id);
  const status = useStore((s) => s.agentStatus[id]);
  const current = useStore((s) => s.settings.agent === id);
  const [, tick] = useState(0);
  const [installed, setInstalled] = useState<{ version: string } | null>(null);
  useEffect(() => {
    const l = () => tick((x) => x + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    if (!status) void detectAgent(id);
    if (a.openVsx || id === "gemini") void api.agentInstalled(id).then(setInstalled).catch(() => setInstalled(null));
  }, [id, status, a.openVsx]);
  const prog = progress[id];
  const ready = !!status?.installed;
  const installable = !!a.openVsx || id === "gemini";
  return (
    <div className={`agent-card ${current ? "is-current" : ""}`}>
      <span className="agent-logo" style={{ background: LOGO[id].bg }} aria-hidden>
        {LOGO[id].mark}
      </span>
      <div className="ext-main">
        <div className="ext-name">
          <span>{a.name}</span> <span className="hint">· {a.vendor}</span>
        </div>
        <div className="ext-desc">{a.description}</div>
        <div className="agent-state">
          {prog ? (
            <span>
              {prog.phase}
              {prog.pct != null ? ` ${prog.pct}%` : ""}
            </span>
          ) : ready ? (
            <span className="tone-success-fg">
              <CheckCircle2 size={11} aria-hidden /> {status?.source === "extension" || installed ? `${tl("Terpasang")} ${installed?.version ?? status?.version ?? ""}` : `${tl("Sudah ada di komputer")}${status?.version ? ` (${status.version.split(" ")[0]})` : ""}`}
              {status?.loggedIn === false ? ` · ${tl("belum masuk")}` : ""}
            </span>
          ) : (
            <span className="hint">{id === "acp" ? tl("Atur perintahnya di Pengaturan") : id === "antigravity" ? tl("Pasang aplikasi Antigravity dulu") : tl("Belum dipasang")}</span>
          )}
        </div>
        {prog?.pct != null && (
          <div className="agent-bar">
            <i style={{ width: `${prog.pct}%` }} />
          </div>
        )}
      </div>
      <div className="agent-actions">
        {ready ? (
          <button className={`btn btn-sm ${current ? "" : "btn-primary"}`} disabled={current} onClick={() => void selectAgent(id)}>
            {current ? tl("Dipakai") : tl("Pakai")}
          </button>
        ) : id === "antigravity" ? (
          <button className="btn btn-sm" onClick={() => void openExternal("https://antigravity.google/download")}>
            <Download size={12} /> Unduh
          </button>
        ) : installable ? (
          <button className="btn btn-sm btn-primary" disabled={!!prog} onClick={() => void installAgent(id)}>
            <Download size={12} /> {tl("Pasang")}
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => void import("../app/actions").then((m) => m.openSettings(undefined, "agents"))}>
            {tl("Atur")}
          </button>
        )}
        {installed && !prog && (
          <button
            className="icon-btn"
            title={tl("Hapus {name}", { name: a.name })}
            aria-label={tl("Hapus {name}", { name: a.name })}
            onClick={async () => {
              if (!(await confirmDialog(tl("Hapus {name}?", { name: a.name }), tl("Biner agen yang dipasang dari Open VSX dihapus. Login dan riwayat percakapan tidak ikut terhapus."), tl("Hapus"), true))) return;
              await api.agentUninstall(id).catch((e) => toast(errMsg(e), "error"));
              setInstalled(null);
              await detectAgent(id);
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export function AgentExtensions() {
  return (
    <section className="agent-ext">
      <div className="git-section-head">
        <span>
          <CrabMascot size={14} /> {tl("Agen AI")}
        </span>
      </div>
      {AGENTS.map((a) => (
        <AgentCard key={a.id} id={a.id} />
      ))}
    </section>
  );
}
