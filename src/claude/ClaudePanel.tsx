import DOMPurify from "dompurify";
import { marked } from "marked";
import { Bot, Check, Copy, CornerDownLeft, FileCode2, Plus, Sparkles, Square, TerminalSquare, Wrench, AlertCircle, TextCursorInput } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { openClaudeInteractive } from "../app/run";
import * as docs from "../editor/documents";
import { PenguinMascot, usePenguinVariant } from "../components/PenguinMascot";
import { IconButton, Spinner } from "../components/ui";
import { openExternal } from "../lib/ipc";
import { activeTab, getState, useStore, type ChatMessage } from "../state/store";
import { applyCodeToActive, cancelClaude, detectClaude, newConversation, sendToClaude } from "./claude";

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="chat-code">
      <div className="chat-code-bar">
        <span>{lang || "kode"}</span>
        <span className="spacer" />
        <IconButton
          label="Salin"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </IconButton>
        <IconButton label="Sisipkan di kursor" onClick={() => docs.insertAtCursor(getState().focusedGroup, code)}>
          <TextCursorInput size={12} />
        </IconButton>
        <IconButton label="Ganti isi berkas aktif (dibandingkan dulu)" onClick={() => void applyCodeToActive(code)}>
          <FileCode2 size={12} />
        </IconButton>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: ({ t: "md"; v: string } | { t: "code"; lang: string; v: string })[] = [];
    const re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: "md", v: text.slice(last, m.index) });
      out.push({ t: "code", lang: m[1], v: m[2].replace(/\n$/, "") });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ t: "md", v: text.slice(last) });
    return out;
  }, [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.t === "code" ? (
          <CodeBlock key={i} lang={p.lang} code={p.v} />
        ) : (
          <div
            key={i}
            className="chat-md"
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest("a");
              if (a) {
                e.preventDefault();
                void openExternal(a.getAttribute("href") ?? "");
              }
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(p.v, { async: false, gfm: true }) as string, { FORBID_ATTR: ["style"], FORBID_TAGS: ["style", "img", "form", "input"] }) }}
          />
        )
      )}
    </>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "tool")
    return (
      <div className="chat-tool">
        <Wrench size={12} aria-hidden /> {m.text}
      </div>
    );
  if (m.role === "error")
    return (
      <div className="chat-msg chat-error" role="alert">
        <AlertCircle size={14} aria-hidden />
        <div>
          <Markdown text={m.text} />
          {m.meta && <div className="chat-meta">{m.meta}</div>}
        </div>
      </div>
    );
  if (m.role === "user")
    return (
      <div className="chat-msg chat-user">
        <div className="chat-user-text">{m.text}</div>
        {m.context && <div className="chat-ctx">+ {m.context}</div>}
      </div>
    );
  return (
    <div className="chat-msg chat-assistant">
      <Markdown text={m.text} />
      {m.meta && <div className="chat-meta">{m.meta}</div>}
    </div>
  );
}

const QUICK = [
  { label: "Jelaskan berkas ini", prompt: "Jelaskan apa yang dilakukan berkas ini secara singkat." },
  { label: "Cari bug", prompt: "Periksa berkas ini dan sebutkan bug atau risiko yang nyata. Beri perbaikannya." },
  { label: "Tulis test", prompt: "Tulis unit test untuk berkas ini memakai framework test yang dipakai project." },
];

export default function ClaudePanel() {
  const chat = useStore((s) => s.chat);
  const running = useStore((s) => s.chatRunning);
  const info = useStore((s) => s.claude);
  const includeDefault = useStore((s) => s.settings.claudeIncludeFile);
  const tab = useStore((s) => activeTab(s));
  const [text, setText] = useState("");
  const [includeFile, setIncludeFile] = useState(includeDefault);
  const [useSelection, setUseSelection] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const penguin = usePenguinVariant();

  useEffect(() => {
    if (!info) void detectClaude();
  }, [info]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat]);

  const send = async (prompt = text) => {
    const ok = await sendToClaude(prompt, { includeFile: includeFile && !useSelection, includeSelection: useSelection });
    if (ok && prompt === text) setText("");
  };

  const fileName = tab?.kind === "text" ? tab.name : null;

  return (
    <section className="claude-panel" aria-label="Claude Code">
      <header className="claude-head">
        <Sparkles size={15} className="claude-mark" aria-hidden />
        <span className="claude-title">Claude Code</span>
        <span className={`claude-status ${info?.installed ? "ok" : "bad"}`} title={info?.version ?? info?.error ?? ""}>
          {info === null ? "memeriksa…" : info.installed ? "terhubung" : "belum terpasang"}
        </span>
        <span className="spacer" />
        <IconButton label="Claude interaktif di terminal" onClick={() => void openClaudeInteractive()}>
          <TerminalSquare size={14} />
        </IconButton>
        <IconButton label="Percakapan baru" onClick={newConversation} disabled={!!running}>
          <Plus size={14} />
        </IconButton>
      </header>

      <div className="claude-list" ref={list} aria-live="polite">
        {chat.length === 0 ? (
          <div className="claude-empty">
            <Bot size={26} aria-hidden />
            <p>Tanya apa saja tentang kode di project ini. Claude Code memakai langganan Pro/Max kamu lewat CLI resmi, tanpa API key.</p>
            {info && !info.installed && <p className="tone-danger-fg">{info.error}</p>}
            <div className="claude-quick">
              {QUICK.map((q) => (
                <button key={q.label} className="chip" onClick={() => void send(q.prompt)} disabled={!fileName || !!running}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chat.map((m) => <Message key={m.id} m={m} />)
        )}
        {running && (
          <div className="chat-typing">
            {penguin ? <PenguinMascot variant={penguin} mood="sibuk" size={22} /> : <Spinner size={12} />} Claude sedang bekerja…
          </div>
        )}
      </div>

      <div className="claude-composer">
        <div className="claude-chips">
          <button className={`chip ${includeFile && !useSelection ? "is-on" : ""}`} onClick={() => { setIncludeFile((v) => !v); setUseSelection(false); }} disabled={!fileName} aria-pressed={includeFile && !useSelection}>
            <FileCode2 size={12} /> {fileName ?? "tidak ada berkas"}
          </button>
          <button className={`chip ${useSelection ? "is-on" : ""}`} onClick={() => setUseSelection((v) => !v)} disabled={!fileName} aria-pressed={useSelection}>
            <TextCursorInput size={12} /> Seleksi saja
          </button>
        </div>
        <textarea
          id="claude-input"
          className="input textarea claude-input"
          placeholder="Tanya Claude… (⌘↵ kirim)"
          value={text}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Pesan untuk Claude"
        />
        <div className="claude-send">
          <span className="hint">{getState().settings.claudeConfirm ? "Kamu akan melihat isi yang dikirim sebelum terkirim." : "Konfirmasi kirim dimatikan di Pengaturan."}</span>
          {running ? (
            <button className="btn btn-danger btn-sm" onClick={() => void cancelClaude()}>
              <Square size={12} /> Batalkan
            </button>
          ) : (
            <button className="btn btn-claude btn-sm" onClick={() => void send()} disabled={!text.trim()}>
              Kirim <CornerDownLeft size={12} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
