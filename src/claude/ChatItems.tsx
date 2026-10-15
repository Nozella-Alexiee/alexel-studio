// Isi daftar chat Claude: gelembung pesan, kartu alat, kartu izin (dengan diff), dan daftar to-do.

import DOMPurify from "dompurify";
import { marked } from "marked";
import { AlertCircle, Check, CheckCircle2, ChevronRight, Circle, CircleDot, Copy, FileCode2, FileDiff, ImageIcon, Info, ListChecks, Loader2, ShieldAlert, TerminalSquare, TextCursorInput, Wrench, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import * as A from "../app/actions";
import * as docs from "../editor/documents";
import { IconButton } from "../components/ui";
import { diffRows, unifiedRows } from "../lib/diff";
import { openExternal } from "../lib/ipc";
import { basename, relative } from "../lib/paths";
import { getState, type ChatMessage } from "../state/store";
import { answerPermission, applyCodeToActive, proposedEdit, toolTarget } from "./claude";

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

export function Markdown({ text }: { text: string }) {
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

// ---------------- Diff ringkas ----------------

function DiffView({ before, after, unified }: { before?: string; after?: string; unified?: string }) {
  const d = useMemo(() => (unified !== undefined ? unifiedRows(unified) : diffRows(before ?? "", after ?? "")), [before, after, unified]);
  return (
    <div className="chat-diff" role="group" aria-label={`Perubahan: ${d.added} baris ditambah, ${d.removed} dihapus`}>
      {d.rows.map((r, i) => (
        <div key={i} className={`chat-diff-row k-${r.k === "+" ? "add" : r.k === "-" ? "del" : r.k === "…" ? "gap" : "ctx"}`}>
          <span className="chat-diff-sign" aria-hidden>
            {r.k === "…" ? "⋯" : r.k}
          </span>
          <span className="chat-diff-text">{r.t}</span>
        </div>
      ))}
      {d.more > 0 && <div className="chat-diff-more">+{d.more} baris lagi</div>}
    </div>
  );
}

function useProposed(toolName: string, input: Record<string, unknown>, active: boolean) {
  const [p, setP] = useState<{ path: string; before: string; after: string } | null>(null);
  useEffect(() => {
    if (!active || !["Edit", "MultiEdit", "Write"].includes(toolName)) return;
    let live = true;
    void proposedEdit(input, toolName).then((r) => live && setP(r));
    return () => {
      live = false;
    };
  }, [toolName, input, active]);
  return p;
}

function openDiff(p: { path: string; before: string; after: string }, title: string, onAccept?: () => void) {
  void import("../panels/compare").then((m) =>
    m.openCompare({ title, filename: basename(p.path), leftLabel: "Sekarang", rightLabel: "Usulan Claude", left: p.before, right: p.after, acceptLabel: onAccept ? "Izinkan" : undefined, onAccept })
  );
}

// ---------------- Alat ----------------

const isEdit = (n: string) => n === "Edit" || n === "MultiEdit" || n === "Write" || n === "ApplyPatch";
/** Diff siap pakai (Codex ApplyPatch mengirim unified diff). */
const patchOf = (input: Record<string, unknown>) => (typeof input.diff === "string" && input.diff ? input.diff : null);

function ToolCard({ m }: { m: ChatMessage }) {
  const t = m.tool!;
  const [open, setOpen] = useState(false);
  const proposed = useProposed(t.name, t.input, open && isEdit(t.name));
  const status =
    t.status === "running" ? <Loader2 size={12} className="spin" aria-label="berjalan" /> : t.status === "ok" ? <Check size={12} aria-label="selesai" /> : t.status === "denied" ? <X size={12} aria-label="ditolak" /> : <AlertCircle size={12} aria-label="gagal" />;
  const icon = t.name === "Bash" ? <TerminalSquare size={12} aria-hidden /> : isEdit(t.name) ? <FileDiff size={12} aria-hidden /> : <Wrench size={12} aria-hidden />;
  const file = typeof t.input.file_path === "string" ? (t.input.file_path as string) : null;
  return (
    <div className={`chat-tool is-${t.status}`}>
      <button className="chat-tool-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronRight size={12} className={`chev ${open ? "is-open" : ""}`} aria-hidden />
        {icon}
        <span className="chat-tool-text">{m.text}</span>
        {t.name === "Bash" && <code className="chat-tool-cmd">{String(t.input.command ?? "")}</code>}
        <span className="chat-tool-status">{status}</span>
      </button>
      {m.meta && t.status !== "ok" && <div className="chat-tool-note">{m.meta}</div>}
      {open && (
        <div className="chat-tool-body">
          {patchOf(t.input) && <DiffView unified={patchOf(t.input)!} />}
          {isEdit(t.name) && !patchOf(t.input) && proposed && t.status !== "ok" && <DiffView before={proposed.before} after={proposed.after} />}
          {isEdit(t.name) && t.name !== "Write" && t.status === "ok" && typeof t.input.old_string === "string" && <DiffView before={String(t.input.old_string)} after={String(t.input.new_string ?? "")} />}
          {t.result && !isEdit(t.name) && <pre className="chat-tool-result">{t.result.slice(0, 3000)}</pre>}
          {file && (
            <button className="btn btn-sm" onClick={() => void A.openFile(file)}>
              Buka {basename(file)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Izin ----------------

function AskQuestions({ m }: { m: ChatMessage }) {
  const p = m.perm!;
  const qs = (Array.isArray(p.input.questions) ? p.input.questions : []) as { question: string; header?: string; multiSelect?: boolean; options?: { label: string; description?: string }[] }[];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const done = qs.every((q) => (picked[q.question]?.length ?? 0) > 0 || (other[q.question] ?? "").trim());
  const submit = () => {
    const answers: Record<string, string> = {};
    for (const q of qs) answers[q.question] = [...(picked[q.question] ?? []), ...((other[q.question] ?? "").trim() ? [other[q.question].trim()] : [])].join(", ");
    void answerPermission(m.id, "allow", { updatedInput: { ...p.input, answers } });
  };
  return (
    <div className="perm-questions">
      {qs.map((q) => (
        <fieldset key={q.question} className="perm-q">
          <legend>{q.question}</legend>
          {(q.options ?? []).map((o) => {
            const on = picked[q.question]?.includes(o.label) ?? false;
            return (
              <button
                key={o.label}
                className={`perm-opt ${on ? "is-on" : ""}`}
                aria-pressed={on}
                onClick={() =>
                  setPicked((s) => {
                    const cur = s[q.question] ?? [];
                    return { ...s, [q.question]: q.multiSelect ? (on ? cur.filter((x) => x !== o.label) : [...cur, o.label]) : [o.label] };
                  })
                }
              >
                <strong>{o.label}</strong>
                {o.description && <span>{o.description}</span>}
              </button>
            );
          })}
          <input className="input" placeholder="Jawaban lain…" value={other[q.question] ?? ""} onChange={(e) => setOther((s) => ({ ...s, [q.question]: e.target.value }))} aria-label={`Jawaban lain untuk: ${q.question}`} />
        </fieldset>
      ))}
      <div className="perm-actions">
        <button className="btn btn-claude btn-sm" disabled={!done} onClick={submit}>
          Kirim jawaban
        </button>
        <button className="btn btn-sm" onClick={() => void answerPermission(m.id, "deny", { reason: "Pengguna memilih tidak menjawab." })}>
          Lewati
        </button>
      </div>
    </div>
  );
}

function PermissionCard({ m }: { m: ChatMessage }) {
  const p = m.perm!;
  const pending = p.state === "pending";
  const [reason, setReason] = useState("");
  const [denying, setDenying] = useState(false);
  const proposed = useProposed(p.toolName, p.input, isEdit(p.toolName));
  const root = getState().root ?? "";
  const target = toolTarget(p.toolName, p.input);
  const canAlways = Array.isArray(p.suggestions) && p.suggestions.length > 0;
  const done =
    p.state === "allowed" ? "Diizinkan" : p.state === "always" ? "Diizinkan selama sesi ini" : p.state === "denied" ? `Ditolak${p.reason ? `: ${p.reason}` : ""}` : p.state === "expired" ? "Kedaluwarsa" : null;

  if (p.toolName === "ExitPlanMode")
    return (
      <div className={`chat-perm is-plan ${pending ? "is-pending" : ""}`}>
        <div className="chat-perm-head">
          <ListChecks size={14} aria-hidden /> Rencana Claude
        </div>
        <div className="chat-perm-plan">
          <Markdown text={String(p.input.plan ?? "")} />
        </div>
        {pending ? (
          <div className="perm-actions">
            <button className="btn btn-claude btn-sm" onClick={() => void answerPermission(m.id, "allow", { mode: "acceptEdits" })}>
              Setujui, edit otomatis
            </button>
            <button className="btn btn-sm" onClick={() => void answerPermission(m.id, "allow", { mode: "default" })}>
              Setujui, tanya tiap edit
            </button>
            <button className="btn btn-sm" onClick={() => setDenying(true)}>
              Terus merencanakan
            </button>
          </div>
        ) : (
          <div className="chat-perm-done">{done}</div>
        )}
        {pending && denying && <DenyBox reason={reason} setReason={setReason} onSend={() => void answerPermission(m.id, "deny", { reason: reason || "Belum setuju, lanjutkan merencanakan." })} />}
      </div>
    );

  if (p.toolName === "AskUserQuestion")
    return (
      <div className={`chat-perm is-question ${pending ? "is-pending" : ""}`}>
        <div className="chat-perm-head">
          <Info size={14} aria-hidden /> Claude bertanya
        </div>
        {pending ? <AskQuestions m={m} /> : <div className="chat-perm-done">{p.state === "allowed" ? "Terjawab" : done}</div>}
      </div>
    );

  return (
    <div className={`chat-perm ${pending ? "is-pending" : `is-${p.state}`}`} role={pending ? "alertdialog" : undefined} aria-label={pending ? `Izin: ${m.text}` : undefined}>
      <div className="chat-perm-head">
        <ShieldAlert size={14} aria-hidden />
        <span>
          {p.toolName === "Bash"
            ? "Jalankan perintah?"
            : p.toolName === "ApplyPatch"
              ? `Ubah ${Array.isArray(p.input.changes) && p.input.changes.length > 1 ? `${p.input.changes.length} berkas` : target ? relative(root, String(p.input.file_path ?? target)) : "berkas"}?`
              : isEdit(p.toolName)
                ? `${p.toolName === "Write" ? "Tulis" : "Edit"} ${target ? relative(root, String(p.input.file_path ?? target)) : "berkas"}?`
                : `Izinkan ${m.text}?`}
        </span>
      </div>
      {p.toolName === "Bash" && (
        <>
          <pre className="chat-perm-cmd">{String(p.input.command ?? "")}</pre>
          {typeof p.input.description === "string" && <div className="chat-perm-desc">{p.input.description}</div>}
        </>
      )}
      {patchOf(p.input) && <DiffView unified={patchOf(p.input)!} />}
      {isEdit(p.toolName) && !patchOf(p.input) && proposed && (
        <>
          <DiffView before={proposed.before} after={proposed.after} />
          <button className="link-btn" onClick={() => openDiff(proposed, `Usulan Claude untuk ${basename(proposed.path)}`, pending ? () => void answerPermission(m.id, "allow") : undefined)}>
            Buka diff lengkap
          </button>
        </>
      )}
      {typeof p.input.description === "string" && p.toolName !== "Bash" && <div className="chat-perm-desc">{p.input.description}</div>}
      {!isEdit(p.toolName) && p.toolName !== "Bash" && Object.keys(p.input).length > 0 && <pre className="chat-perm-cmd">{JSON.stringify(p.input, null, 2).slice(0, 1500)}</pre>}
      {pending ? (
        <>
          <div className="perm-actions">
            <button className="btn btn-claude btn-sm" onClick={() => void answerPermission(m.id, "allow")} autoFocus>
              Izinkan
            </button>
            {canAlways && (
              <button className="btn btn-sm" onClick={() => void answerPermission(m.id, "always")} title="Jangan tanya lagi untuk jenis ini sampai percakapan selesai">
                Izinkan selama sesi
              </button>
            )}
            <button className="btn btn-sm btn-ghost-danger" onClick={() => setDenying((v) => !v)}>
              Tolak
            </button>
          </div>
          {denying && <DenyBox reason={reason} setReason={setReason} onSend={() => void answerPermission(m.id, "deny", { reason })} />}
        </>
      ) : (
        <div className="chat-perm-done">{done}</div>
      )}
    </div>
  );
}

function DenyBox({ reason, setReason, onSend }: { reason: string; setReason: (v: string) => void; onSend: () => void }) {
  return (
    <form
      className="perm-deny"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <input className="input" autoFocus placeholder="Beri tahu Claude apa yang sebaiknya dilakukan (opsional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Alasan menolak" />
      <button className="btn btn-sm" type="submit">
        Kirim
      </button>
    </form>
  );
}

// ---------------- To-do ----------------

function TodoCard({ m }: { m: ChatMessage }) {
  const todos = useMemo(() => {
    try {
      return JSON.parse(m.text) as { content: string; status: string }[];
    } catch {
      return [];
    }
  }, [m.text]);
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <div className="chat-todo">
      <div className="chat-todo-head">
        <ListChecks size={13} aria-hidden /> Rencana kerja <span className="hint">{done}/{todos.length}</span>
      </div>
      <ul>
        {todos.map((t, i) => (
          <li key={i} className={`is-${t.status}`}>
            {t.status === "completed" ? <CheckCircle2 size={12} aria-label="selesai" /> : t.status === "in_progress" ? <CircleDot size={12} aria-label="dikerjakan" /> : <Circle size={12} aria-label="belum" />}
            <span>{t.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- Pesan ----------------

// memo: pesan lama tidak di-render ulang (marked + DOMPurify) setiap ada pesan baru.
export const Message = memo(function Message({ m }: { m: ChatMessage }) {
  if (m.role === "tool" && m.tool) return <ToolCard m={m} />;
  if (m.role === "permission" && m.perm) return <PermissionCard m={m} />;
  if (m.role === "todo") return <TodoCard m={m} />;
  if (m.role === "info") return <div className="chat-info">{m.text}</div>;
  if (m.role === "tool")
    return (
      <div className="chat-tool-line">
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
        {(m.context || m.images) && (
          <div className="chat-ctx">
            {m.images ? (
              <span>
                <ImageIcon size={11} aria-hidden /> {m.images}
              </span>
            ) : null}
            {m.context && <span>+ {m.context}</span>}
          </div>
        )}
      </div>
    );
  if (!m.text) return null;
  return (
    <div className="chat-msg chat-assistant">
      <Markdown text={m.text} />
      {m.meta && <div className="chat-meta">{m.meta}</div>}
    </div>
  );
});
