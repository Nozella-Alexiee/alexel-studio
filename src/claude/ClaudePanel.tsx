import { ArrowLeft, History, LogIn, MessageSquarePlus, RefreshCw, TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openClaudeInteractive } from "../app/run";
import { CrabMascot, flashKepi, Kepi } from "../components/CrabMascot";
import { IconButton } from "../components/ui";
import { api, errMsg } from "../lib/ipc";
import type { ClaudeSessionInfo } from "../lib/types";
import { useStore } from "../state/store";
import { Message } from "./ChatItems";
import { detectClaude, installClaude, installCommand, loginClaude, newConversation, resumeSession, sendToClaude } from "./claude";
import { Composer } from "./Composer";

const QUICK = [
  { label: "Jelaskan berkas ini", prompt: "Jelaskan apa yang dilakukan berkas ini secara singkat." },
  { label: "Cari bug", prompt: "Periksa berkas ini dan sebutkan bug atau risiko yang nyata. Beri perbaikannya." },
  { label: "Tulis test", prompt: "Tulis unit test untuk berkas ini memakai framework test yang dipakai project." },
];

function ago(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.round(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} hari lalu`;
  return new Date(ms).toLocaleDateString();
}

function SessionHistory({ onClose }: { onClose: () => void }) {
  const root = useStore((s) => s.root);
  const current = useStore((s) => s.chatSession);
  const [list, setList] = useState<ClaudeSessionInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!root) return setList([]);
    api
      .claudeSessions(root)
      .then(setList)
      .catch((e) => setErr(errMsg(e)));
  }, [root]);
  const shown = (list ?? []).filter((s) => !q.trim() || s.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="claude-history">
      <div className="claude-history-head">
        <IconButton label="Kembali ke percakapan" onClick={onClose}>
          <ArrowLeft size={14} />
        </IconButton>
        <strong>Riwayat percakapan</strong>
      </div>
      <input className="input" placeholder="Cari percakapan…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari percakapan" autoFocus />
      {err && <p className="tone-danger-fg">{err}</p>}
      {!root && <p className="hint">Buka folder project untuk melihat percakapan Claude Code di folder itu.</p>}
      {list && root && !shown.length && <p className="hint">Belum ada percakapan di folder ini.</p>}
      {!list && root && !err && <p className="hint">Memuat…</p>}
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
                {ago(s.time_ms)} · {s.messages} pesan
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Setup() {
  const info = useStore((s) => s.claude);
  if (!info) return <p className="hint pad-x">Memeriksa Claude Code…</p>;
  if (!info.installed)
    return (
      <div className="claude-setup">
        <CrabMascot mood="mikir" size={54} />
        <h3>Pasang Claude Code</h3>
        <p>Alexel Studio memakai Claude Code resmi dengan langganan Claude Pro atau Max kamu. Tidak perlu API key.</p>
        <pre className="claude-setup-cmd">{installCommand()}</pre>
        <div className="perm-actions">
          <button className="btn btn-claude btn-sm" onClick={() => void installClaude()}>
            <TerminalSquare size={13} /> Pasang di terminal
          </button>
          <button className="btn btn-sm" onClick={() => void detectClaude()}>
            <RefreshCw size={13} /> Periksa ulang
          </button>
        </div>
        {info.error && <p className="hint small">{info.error}</p>}
      </div>
    );
  return (
    <div className="claude-setup">
      <CrabMascot mood="melambai" size={54} />
      <h3>Masuk ke Claude</h3>
      <p>Masuk sekali dengan akun Claude kamu. Setelah itu panel ini langsung bisa dipakai.</p>
      <div className="perm-actions">
        <button className="btn btn-claude btn-sm" onClick={() => void loginClaude()}>
          <LogIn size={13} /> Masuk
        </button>
        <button className="btn btn-sm" onClick={() => void detectClaude()}>
          <RefreshCw size={13} /> Periksa ulang
        </button>
      </div>
    </div>
  );
}

export default function ClaudePanel() {
  const chat = useStore((s) => s.chat);
  const running = useStore((s) => s.chatRunning);
  const info = useStore((s) => s.claude);
  const hasText = useStore((s) => {
    const g = s.groups[s.focusedGroup];
    const t = g?.active ? s.tabs[g.active] : null;
    return t?.kind === "text";
  });
  const [showHistory, setShowHistory] = useState(false);
  // Ikuti chat ke bawah hanya bila pengguna memang sedang di bawah (tidak sedang membaca ke atas).
  const stick = useRef(true);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!info) void detectClaude();
  }, [info]);
  useEffect(() => {
    if (stick.current) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat, running]);

  const ready = !!info?.installed && info.loggedIn !== false;
  const lastIsStreaming = running && chat.length > 0 && chat[chat.length - 1].role === "assistant" && !!chat[chat.length - 1].text;

  return (
    <section className="claude-panel" aria-label="Claude Code">
      <header className="claude-head">
        <button className="claude-kepi" onClick={() => flashKepi("melambai", 2400)} aria-label="Sapa Kepi" title="Kepi, teman Claude Code">
          <Kepi size={22} />
        </button>
        <span className="claude-title">Claude Code</span>
        <span className={`claude-status ${ready ? "ok" : "bad"}`} title={info?.version ?? info?.error ?? ""}>
          {info === null ? "memeriksa…" : !info.installed ? "belum terpasang" : info.loggedIn === false ? "belum masuk" : info.plan ? info.plan.toUpperCase() : "siap"}
        </span>
        <span className="spacer" />
        <IconButton label="Riwayat percakapan" onClick={() => setShowHistory((v) => !v)} active={showHistory}>
          <History size={14} />
        </IconButton>
        <IconButton label="Buka Claude Code di terminal" onClick={() => void openClaudeInteractive()}>
          <TerminalSquare size={14} />
        </IconButton>
        <IconButton
          label="Percakapan baru"
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
          className="claude-list"
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
              <p>Tanya apa saja tentang project ini, minta Claude mengubah kode, atau menjalankan perintah. Kamu yang menyetujui setiap perubahan.</p>
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
              <CrabMascot mood="mikir" size={20} /> Claude sedang bekerja…
            </div>
          )}
        </div>
      )}

      {ready && !showHistory && <Composer onShowHistory={() => setShowHistory(true)} />}
    </section>
  );
}
