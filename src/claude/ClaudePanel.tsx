import { ArrowLeft, ChevronDown, Download, History, LogIn, MessageSquarePlus, Puzzle, RefreshCw, TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openClaudeInteractive } from "../app/run";
import { CrabMascot, flashKepi, Kepi } from "../components/CrabMascot";
import { IconButton } from "../components/ui";
import { api, errMsg, openExternal } from "../lib/ipc";
import { timeAgo } from "../lib/format";
import type { ClaudeSessionInfo } from "../lib/types";
import { getState, setState, useStore } from "../state/store";
import { Message } from "./ChatItems";
import { detectAgent, warmClaude, installClaude, installCommand, loginClaude, newConversation, resumeSession, selectAgent, sendToClaude } from "./claude";
import { AGENTS, agentInfo } from "../agents/registry";
import { openMenu } from "../components/Overlays";
import { Composer } from "./Composer";
import { tl } from "../i18n";

const QUICK = [
  { label: tl("Jelaskan berkas ini"), prompt: tl("Jelaskan apa yang dilakukan berkas ini secara singkat.") },
  { label: tl("Cari bug"), prompt: tl("Periksa berkas ini dan sebutkan bug atau risiko yang nyata. Beri perbaikannya.") },
  { label: tl("Tulis test"), prompt: tl("Tulis unit test untuk berkas ini memakai framework test yang dipakai project.") },
];


function SessionHistory({ onClose }: { onClose: () => void }) {
  const root = useStore((s) => s.root);
  const current = useStore((s) => s.chatSession);
  const agent = useStore((s) => s.settings.agent);
  const [list, setList] = useState<ClaudeSessionInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    setList(null);
    setErr(null);
    if (!root) return setList([]);
    let alive = true;
    api
      .agentSessions(agent, root)
      .then((l) => alive && setList(l))
      .catch((e: unknown) => alive && setErr(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [root, agent]);
  const shown = (list ?? []).filter((s) => !q.trim() || s.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="claude-history">
      <div className="claude-history-head">
        <IconButton label={tl("Kembali ke percakapan")} onClick={onClose}>
          <ArrowLeft size={14} />
        </IconButton>
        <strong>{tl("Riwayat percakapan")}</strong>
      </div>
      <input className="input" placeholder={tl("Cari percakapan…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tl("Cari percakapan")} autoFocus />
      {err && <p className="tone-danger-fg">{err}</p>}
      {!root && <p className="hint">{tl("Buka folder project untuk melihat percakapan di folder itu.")}</p>}
      {list && root && !shown.length && <p className="hint">{tl("Belum ada percakapan di folder ini.")}</p>}
      {!list && root && !err && <p className="hint">{tl("Memuat…")}</p>}
      <ul className="claude-history-list">
        {shown.map((s) => (
          <li key={s.id}>
            <button
              className={`claude-history-item ${s.id === current ? "is-current" : ""}`}
              onClick={() => {
                onClose();
                void resumeSession(s.id);
              }}
            >
              <span className="claude-history-title">{s.title}</span>
              <span className="claude-history-meta">
                {timeAgo(s.time_ms)}
                {s.messages ? ` · ${tl("{n} pesan", { n: s.messages })}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Setup() {
  const agent = useStore((s) => s.settings.agent);
  const info = useStore((s) => s.agentStatus[s.settings.agent]);
  const a = agentInfo(agent);
  if (!info) return <p className="hint pad-x">{tl("Memeriksa {name}…", { name: a.name })}</p>;
  if (!info.installed)
    return (
      <div className="claude-setup">
        <CrabMascot mood="mikir" size={54} />
        <h3>{tl("Pasang {name}", { name: a.name })}</h3>
        <p>{a.description}</p>
        {agent === "acp" ? (
          <p className="hint">{tl("Isi perintah agen ACP di Pengaturan → Agen AI.")}</p>
        ) : agent === "antigravity" ? (
          <>
            <p className="hint">{tl("Antigravity (agy) datang bersama aplikasi Antigravity. Pasang aplikasinya dulu, lalu klik Periksa ulang.")}</p>
            <button className="btn btn-claude btn-sm" onClick={() => void openExternal("https://antigravity.google/download")}>
              <Download size={13} /> {tl("Unduh Antigravity")}
            </button>
          </>
        ) : (
          <button className="btn btn-claude btn-sm" onClick={() => void import("../app/actions").then((m) => m.toggleSidebar("ext"))}>
            <Puzzle size={13} /> {tl("Pasang dari Ekstensi")}
          </button>
        )}
        {agent === "claude" && (
          <>
            <p className="hint small">{tl("Atau pasang lewat terminal:")}</p>
            <pre className="claude-setup-cmd">{installCommand()}</pre>
            <button className="btn btn-sm" onClick={() => void installClaude()}>
              <TerminalSquare size={13} /> {tl("Pasang di terminal")}
            </button>
          </>
        )}
        <button className="btn btn-sm" onClick={() => void detectAgent(agent)}>
          <RefreshCw size={13} /> {tl("Periksa ulang")}
        </button>
        {info.error && <p className="hint small">{info.error}</p>}
      </div>
    );
  return (
    <div className="claude-setup">
      <CrabMascot mood="melambai" size={54} />
      <h3>{tl("Masuk ke {name}", { name: a.name })}</h3>
      <p>{tl("Masuk sekali dengan akun {vendor} kamu. Setelah itu panel ini langsung bisa dipakai.", { vendor: a.vendor })}</p>
      {agent === "antigravity" && <p className="hint small">{tl("Akan membuka terminal: pilih \"Continue with Google\", selesaikan di browser, lalu tekan Ctrl+D dua kali.")}</p>}
      <div className="perm-actions">
        <button className="btn btn-claude btn-sm" onClick={() => void loginClaude()}>
          <LogIn size={13} /> {tl("Masuk")}
        </button>
        <button className="btn btn-sm" onClick={() => void detectAgent(agent)}>
          <RefreshCw size={13} /> {tl("Periksa ulang")}
        </button>
      </div>
    </div>
  );
}

/** Pemilih agen di header panel (Claude Code, Codex, Gemini, agen ACP). */
function AgentPicker() {
  const agent = useStore((s) => s.settings.agent);
  const status = useStore((s) => s.agentStatus);
  const running = useStore((s) => !!s.chatRunning);
  return (
    <button
      className="agent-pick"
      disabled={running}
      title={running ? tl("Tunggu jawaban selesai untuk ganti agen") : tl("Ganti agen AI")}
      aria-haspopup="menu"
      onClick={(e) =>
        openMenu(
          e,
          AGENTS.map((a) => ({
            label: `${a.id === agent ? "✓ " : ""}${a.name}`,
            keys: status[a.id]?.installed ? a.vendor : status[a.id] ? tl("belum dipasang") : a.vendor,
            run: () => void selectAgent(a.id),
          }))
        )
      }
    >
      <span className="claude-title">{agentInfo(agent).name}</span>
      <ChevronDown size={12} aria-hidden />
    </button>
  );
}

export default function ClaudePanel() {
  const chat = useStore((s) => s.chat);
  const running = useStore((s) => s.chatRunning);
  const agent = useStore((s) => s.settings.agent);
  const info = useStore((s) => s.agentStatus[s.settings.agent]);
  const hasText = useStore((s) => {
    const g = s.groups[s.focusedGroup];
    const t = g?.active ? s.tabs[g.active] : null;
    return t?.kind === "text";
  });
  const showHistory = useStore((s) => s.chatHistoryOpen);
  const setShowHistory = (v: boolean | ((v: boolean) => boolean)) => setState({ chatHistoryOpen: typeof v === "function" ? v(getState().chatHistoryOpen) : v });
  // Ikuti chat ke bawah hanya bila pengguna memang sedang di bawah (tidak sedang membaca ke atas).
  const stick = useRef(true);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!info) void detectAgent(agent);
  }, [info, agent]);
  const chatKey = useStore((s) => s.chatKey);
  const claudeReady = agent === "claude" && !!info?.installed && info.loggedIn !== false;
  useEffect(() => {
    if (claudeReady) void warmClaude();
  }, [claudeReady, chatKey]);
  // Belum masuk / belum terpasang: periksa lagi saat jendela kembali fokus (mis. selesai login di browser/terminal).
  const needsSetup = !info || !info.installed || info.loggedIn === false;
  useEffect(() => {
    if (!needsSetup) return;
    const onFocus = () => void detectAgent(agent);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [needsSetup, agent]);
  // Riwayat milik agen sebelumnya tidak berlaku untuk agen baru.
  useEffect(() => {
    if (!agentInfo(agent).caps.history) setState({ chatHistoryOpen: false });
  }, [agent]);
  useEffect(() => {
    if (stick.current) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat, running]);

  const ready = !!info?.installed && info.loggedIn !== false;
  const lastIsStreaming = running && chat.length > 0 && chat[chat.length - 1].role === "assistant" && !!chat[chat.length - 1].text;

  return (
    <section className="claude-panel" aria-label={`${tl("Agen AI")}: ${agentInfo(agent).name}`}>
      <header className="claude-head">
        <button className="claude-kepi" onClick={() => flashKepi("melambai", 2400)} aria-label={tl("Sapa Kepi")} title={tl("Kepi, teman agen AI")}>
          <Kepi size={22} />
        </button>
        <AgentPicker />
        <span className={`claude-status ${ready ? "ok" : "bad"}`} title={info?.version ?? info?.error ?? ""}>
          {!info ? tl("memeriksa…") : !info.installed ? tl("belum terpasang") : info.loggedIn === false ? tl("belum masuk") : info.plan ? info.plan.toUpperCase() : tl("siap")}
        </span>
        <span className="spacer" />
        {agentInfo(agent).caps.history && (
          <IconButton label={tl("Riwayat percakapan")} onClick={() => setShowHistory((v) => !v)} active={showHistory}>
            <History size={14} />
          </IconButton>
        )}
        {agent === "claude" && (
          <IconButton label={tl("Buka Claude Code di terminal")} onClick={() => void openClaudeInteractive()}>
            <TerminalSquare size={14} />
          </IconButton>
        )}
        <IconButton
          label={tl("Percakapan baru")}
          onClick={() => {
            setShowHistory(false);
            newConversation();
          }}
        >
          <MessageSquarePlus size={14} />
        </IconButton>
      </header>

      {showHistory ? (
        <SessionHistory onClose={() => setShowHistory(false)} />
      ) : !ready ? (
        <Setup />
      ) : (
        <div
          className="claude-list selectable"
          ref={list}
          aria-live="polite"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
        >
          {chat.length === 0 ? (
            <div className="claude-empty">
              <CrabMascot mood="melambai" size={54} />
              <p>{tl("Tanya apa saja tentang project ini, minta Claude mengubah kode, atau menjalankan perintah. Kamu yang menyetujui setiap perubahan.")}</p>
              <div className="claude-quick">
                {QUICK.map((q) => (
                  <button key={q.label} className="chip" onClick={() => void sendToClaude(q.prompt, { includeFile: true })} disabled={!hasText || !!running}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.map((m) => <Message key={m.id} m={m} />)
          )}
          {running && !lastIsStreaming && (
            <div className="chat-typing">
              <CrabMascot mood="mikir" size={20} /> {tl("{name} sedang bekerja…", { name: agentInfo(agent).short })}
            </div>
          )}
        </div>
      )}

      {ready && !showHistory && <Composer onShowHistory={() => setShowHistory(true)} />}
    </section>
  );
}
