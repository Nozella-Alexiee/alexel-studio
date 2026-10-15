// Kotak pesan Claude: @-mention berkas, slash command, lampiran gambar, chip konteks,
// serta pemilih mode izin, model, dan effort (seperti ekstensi Claude Code di VS Code).

import {
  ArrowUp,
  AtSign,
  Brain,
  Check,
  ChevronDown,
  FileCode2,
  ImagePlus,
  ListChecks,
  Pencil,
  ShieldQuestion,
  Square,
  TextCursorInput,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as docs from "../editor/documents";
import { FileIcon } from "../components/FileIcon";
import { fuzzyFilter } from "../lib/fuzzy";
import { prettyKeys } from "../lib/keys";
import { basename, relative } from "../lib/paths";
import { projectFiles } from "../lib/projectFiles";
import { activeTab, toast, useStore } from "../state/store";
import {
  agentChoice,
  cancelClaude,
  cycleClaudeMode,
  newConversation,
  sendToClaude,
  setClaudeEffort,
  setClaudeMode,
  setClaudeModel,
} from "./claude";
import { EFFORTS, effortLabel, modelChoices } from "./options";
import { agentInfo } from "../agents/registry";

interface Img {
  media_type: string;
  data: string;
  url: string;
  name: string;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function readImage(file: File): Promise<Img | null> {
  return new Promise((resolve) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return resolve(null);
    if (file.size > MAX_IMAGE_BYTES) {
      toast(`${file.name || "Gambar"} lebih dari 5 MB.`, "error");
      return resolve(null);
    }
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      resolve({
        media_type: file.type,
        data: url.slice(url.indexOf(",") + 1),
        url,
        name: file.name || "gambar",
      });
    };
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

// ---------------- Popover pilihan ----------------

interface Choice<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

function Picker<T extends string>({
  label,
  icon,
  value,
  choices,
  onPick,
  className = "",
  title,
}: {
  label: string;
  icon: React.ReactNode;
  value: T;
  choices: Choice<T>[];
  onPick: (v: T) => void;
  className?: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const cur = choices.find((c) => c.id === value);
  return (
    <div className={`cz-picker ${className}`} ref={ref}>
      <button
        type="button"
        className="cz-pick-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {icon}
        <span>{cur?.label ?? label}</span>
        <ChevronDown size={11} aria-hidden />
      </button>
      {open && (
        <div className="cz-pop" role="listbox" aria-label={label}>
          <div className="cz-pop-title">{label}</div>
          {choices.map((c) => (
            <button
              key={c.id}
              role="option"
              aria-selected={c.id === value}
              className={`cz-pop-item ${c.id === value ? "is-on" : ""}`}
              onClick={() => {
                onPick(c.id);
                setOpen(false);
              }}
            >
              <span className="cz-pop-check">
                {c.id === value && <Check size={12} />}
              </span>
              <span className="cz-pop-text">
                <strong>{c.label}</strong>
                {c.hint && <span>{c.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MODE_ICON: Record<string, React.ReactNode> = {
  default: <ShieldQuestion size={12} aria-hidden />,
  untrusted: <ShieldQuestion size={12} aria-hidden />,
  acceptEdits: <Pencil size={12} aria-hidden />,
  "on-request": <Pencil size={12} aria-hidden />,
  plan: <ListChecks size={12} aria-hidden />,
  "read-only": <ListChecks size={12} aria-hidden />,
};

// ---------------- Saran @ dan / ----------------

interface Suggest {
  kind: "file" | "cmd";
  items: { id: string; label: string; detail?: string; run: () => void }[];
}

const LOCAL_CMDS = [
  { name: "model", description: "Ganti model" },
  { name: "effort", description: "Ganti tingkat effort" },
  { name: "mode", description: "Ganti mode izin" },
  { name: "clear", description: "Mulai percakapan baru" },
  { name: "resume", description: "Lanjutkan percakapan sebelumnya" },
];

export function Composer({ onShowHistory }: { onShowHistory: () => void }) {
  const running = useStore((s) => s.chatRunning);
  const root = useStore((s) => s.root);
  const includeDefault = useStore((s) => s.settings.claudeIncludeFile);
  const agent = useStore((s) => s.settings.agent);
  const caps = agentInfo(agent).caps;
  // Pilihan per agen (Claude memakai claudeModel dsb., agen lain agentPrefs).
  const choice = useStore((s) => (s.settings.agent === "claude" ? `${s.settings.claudeModel}|${s.settings.claudeEffort}|${s.settings.claudeMode}` : JSON.stringify(s.settings.agentPrefs[s.settings.agent] ?? {})));
  const { model, effort, mode } = useMemo(() => agentChoice(agent), [agent, choice]);
  const models = useStore((s) => s.claudeModels);
  const cliCommands = useStore((s) => s.claudeCommands);
  const usage = useStore((s) => s.chatUsage);
  const tab = useStore((s) => activeTab(s));
  const cursor = useStore((s) => s.cursor);
  const focusedGroup = useStore((s) => s.focusedGroup);

  const [text, setText] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [includeFile, setIncludeFile] = useState(includeDefault);
  const [useSel, setUseSel] = useState(true);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [sel, setSel] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const files = useRef<string[]>([]);

  useEffect(() => setIncludeFile(includeDefault), [includeDefault]);
  useEffect(() => {
    if (root) void projectFiles(root).then((f) => (files.current = f));
  }, [root]);

  const selection = useMemo(
    () =>
      tab?.kind === "text" && cursor.sel > 0
        ? docs.selectionInfo(focusedGroup)
        : null,
    [tab, cursor, focusedGroup],
  );
  useEffect(() => setUseSel(true), [selection?.from, selection?.to]);
  const fileName = tab?.kind === "text" ? tab.name : null;
  const relTab =
    tab?.kind === "text" && root ? relative(root, tab.id) : fileName;

  const modelList = agent === "claude" ? modelChoices(models) : [{ value: "default", displayName: "Bawaan", description: "Model bawaan agen" }, ...models.filter((m) => m.value !== "default")];
  const modelValue = modelList.some((m) => m.value === model)
    ? model
    : "default";
  const effortLevels = modelList.find(
    (m) => m.value === modelValue,
  )?.supportedEffortLevels;
  const effortChoices = EFFORTS.filter(
    (e) => e.id === "auto" || !effortLevels || effortLevels.includes(e.id),
  );

  // ---- saran ----
  const refreshSuggest = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = /(^|\s)@([^\s@]*)$/.exec(before);
    if (at && root) {
      const q = at[2];
      const start = caret - q.length - 1;
      const hits = fuzzyFilter(q, files.current, (f) => f, 8);
      setSuggest({
        kind: "file",
        items: hits.map((h) => ({
          id: h.item,
          label: basename(h.item),
          detail: h.item,
          run: () => {
            const next =
              value.slice(0, start) + "@" + h.item + " " + value.slice(caret);
            setText(next);
            setSuggest(null);
            requestAnimationFrame(() => {
              const pos = start + h.item.length + 2;
              area.current?.setSelectionRange(pos, pos);
              area.current?.focus();
            });
          },
        })),
      });
      setSel(0);
      return;
    }
    const slash = /^\/([\w:-]*)$/.exec(before);
    if (slash) {
      const q = slash[1].toLowerCase();
      const all = [
        ...LOCAL_CMDS.map((c) => ({ ...c, local: true })),
        ...cliCommands
          .filter((c) => !LOCAL_CMDS.some((l) => l.name === c.name))
          .map((c) => ({ ...c, local: false })),
      ];
      const items = all
        .filter((c) => c.name.toLowerCase().startsWith(q))
        .slice(0, 10)
        .map((c) => ({
          id: c.name,
          label: `/${c.name}`,
          detail: c.description,
          run: () => runSlash(c.name, c.local),
        }));
      setSuggest(items.length ? { kind: "cmd", items } : null);
      setSel(0);
      return;
    }
    setSuggest(null);
  };

  const runSlash = (name: string, local: boolean) => {
    setSuggest(null);
    if (!local) {
      setText(`/${name} `);
      area.current?.focus();
      return;
    }
    setText("");
    if (name === "clear") newConversation();
    else if (name === "resume") onShowHistory();
    else if (name === "mode") cycleClaudeMode();
    else
      (
        document.querySelector(
          `.cz-picker.pick-${name} .cz-pick-btn`,
        ) as HTMLButtonElement | null
      )?.click();
  };

  const send = async () => {
    if (running) return;
    const prompt = text.trim();
    if (!prompt && !images.length) return;
    const withSel = !!selection && useSel;
    const ok = await sendToClaude(prompt, {
      includeFile: includeFile && !withSel,
      includeSelection: withSel,
      images: images.map(({ media_type, data }) => ({ media_type, data })),
    });
    if (ok) {
      setText("");
      setImages([]);
    }
  };

  const addFiles = async (list: FileList | File[]) => {
    const got = (await Promise.all([...list].map(readImage))).filter(
      Boolean,
    ) as Img[];
    if (got.length) setImages((cur) => [...cur, ...got].slice(0, 8));
  };

  const ctxPct =
    usage && usage.window
      ? Math.min(100, Math.round((usage.context / usage.window) * 100))
      : null;

  return (
    <div
      className={`claude-composer ${dragOver ? "is-drop" : ""}`}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes("Files") ||
          e.dataTransfer.types.includes("text/x-nozel-path") ||
          e.dataTransfer.types.includes("text/x-nozel-tab")
        ) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const internal =
          e.dataTransfer.getData("text/x-nozel-path") ||
          e.dataTransfer.getData("text/x-nozel-tab");
        if (internal) {
          e.preventDefault();
          const rel = root ? relative(root, internal) : internal;
          setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${rel} `);
          return;
        }
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
        }
      }}
    >
      <div className="cz-box">
        <div className="cz-chips">
          {selection && relTab ? (
            <button
              className={`chip ${useSel ? "is-on" : ""}`}
              onClick={() => setUseSel((v) => !v)}
              aria-pressed={useSel}
              title="Seleksi di editor ikut dikirim"
            >
              <TextCursorInput size={12} aria-hidden /> {basename(relTab)}:
              {selection.from}
              {selection.to !== selection.from ? `-${selection.to}` : ""}
            </button>
          ) : (
            <button
              className={`chip ${includeFile ? "is-on" : ""}`}
              onClick={() => setIncludeFile((v) => !v)}
              disabled={!fileName}
              aria-pressed={includeFile}
              title="Isi berkas aktif ikut dikirim"
            >
              <FileCode2 size={12} aria-hidden />{" "}
              {fileName ?? "tidak ada berkas"}
            </button>
          )}
          {images.map((im, i) => (
            <span key={i} className="cz-thumb" title={im.name}>
              <img src={im.url} alt={im.name} />
              <button
                aria-label={`Hapus ${im.name}`}
                onClick={() =>
                  setImages((cur) => cur.filter((_, j) => j !== i))
                }
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>

        {suggest && suggest.items.length > 0 && (
          <div
            className="cz-suggest"
            role="listbox"
            aria-label={suggest.kind === "file" ? "Berkas" : "Perintah"}
          >
            {suggest.items.map((it, i) => (
              <button
                key={it.id}
                role="option"
                aria-selected={i === sel}
                className={`cz-sug ${i === sel ? "is-sel" : ""}`}
                onMouseMove={() => setSel(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={it.run}
              >
                {suggest.kind === "file" ? (
                  <FileIcon filename={it.label} size={14} />
                ) : (
                  <span className="cz-slash">/</span>
                )}
                <span className="cz-sug-label">
                  {suggest.kind === "file" ? it.label : it.label.slice(1)}
                </span>
                {it.detail && (
                  <span className="cz-sug-detail">{it.detail}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <textarea
          id="claude-input"
          ref={area}
          className="cz-input"
          placeholder={
            running
              ? "Claude sedang menjawab…"
              : `Tanya Claude, @ untuk berkas, / untuk perintah`
          }
          value={text}
          rows={2}
          onChange={(e) => {
            setText(e.target.value);
            refreshSuggest(e.target.value, e.target.selectionStart);
          }}
          onPaste={(e) => {
            const imgs = [...e.clipboardData.files].filter((f) =>
              f.type.startsWith("image/"),
            );
            if (imgs.length) {
              e.preventDefault();
              void addFiles(imgs);
            }
          }}
          onKeyDown={(e) => {
            if (suggest?.items.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = suggest.items.length;
                setSel((v) => (v + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                suggest.items[sel]?.run();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSuggest(null);
                return;
              }
            }
            if (e.key === "Tab" && e.shiftKey) {
              e.preventDefault();
              cycleClaudeMode();
              return;
            }
            // Enter kirim, Shift+Enter baris baru (seperti VS Code); Mod+Enter juga mengirim.
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Pesan untuk agen AI"
        />

        <div className="cz-bar">
          <div className="cz-pickers">
            {caps.modes.length > 0 && (
            <Picker
              className="pick-mode"
              label="Mode izin"
              title={`Mode izin (${prettyKeys("Shift+Tab")} untuk ganti)`}
              icon={MODE_ICON[mode]}
              value={mode}
              choices={caps.modes.map((m) => ({
                id: m.id,
                label: m.label,
                hint: m.hint,
              }))}
              onPick={(v) => void setClaudeMode(v)}
            />
            )}
            <Picker
              className="pick-model"
              label="Model"
              title="Model"
              icon={<span className="cz-model-dot" aria-hidden />}
              value={modelValue}
              choices={modelList.map((m) => ({
                id: m.value,
                label: m.displayName,
                hint: m.description,
              }))}
              onPick={(v) => void setClaudeModel(v)}
            />
            {caps.effort && (
            <Picker
              className="pick-effort"
              label="Effort"
              title="Effort: seberapa lama agen berpikir. Berlaku mulai pesan berikutnya."
              icon={<Brain size={12} aria-hidden />}
              value={
                effortChoices.some((e) => e.id === effort) ? effort : "auto"
              }
              choices={effortChoices.map((e) => ({
                id: e.id,
                label: effortLabel(e.id),
                hint: e.id === "auto" ? "Bawaan model" : undefined,
              }))}
              onPick={(v) => void setClaudeEffort(v)}
            />
            )}
          </div>
          <div className="cz-actions">
            <label className="cz-icon-btn" title="Lampirkan gambar">
              <ImagePlus size={14} aria-hidden />
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={(e) =>
                  e.target.files && void addFiles(e.target.files)
                }
                aria-label="Lampirkan gambar"
              />
            </label>
            <button
              className="cz-icon-btn"
              title="Sebut berkas (@)"
              aria-label="Sebut berkas"
              onClick={() => {
                const next = `${text}${text && !text.endsWith(" ") ? " " : ""}@`;
                setText(next);
                area.current?.focus();
                refreshSuggest(next, next.length);
              }}
            >
              <AtSign size={14} aria-hidden />
            </button>
            {running ? (
              <button
                className="cz-send is-stop"
                onClick={() => void cancelClaude()}
                aria-label="Hentikan"
                title="Hentikan"
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                className="cz-send"
                onClick={() => void send()}
                disabled={!text.trim() && !images.length}
                aria-label="Kirim"
                title={`Kirim (Enter)`}
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="cz-foot">
        <span>Shift+Enter baris baru · @ berkas · / perintah</span>
        <span className="spacer" />
        {ctxPct != null && (
          <span
            title={`${usage!.context.toLocaleString()} dari ${usage!.window.toLocaleString()} token konteks · setara $${usage!.cost.toFixed(3)} harga API`}
          >
            {ctxPct}% konteks
          </span>
        )}
      </div>
    </div>
  );
}

/** Fokus ke kotak pesan Claude (dipakai perintah "Tanya Claude"). */
export function focusComposer() {
  (
    document.getElementById("claude-input") as HTMLTextAreaElement | null
  )?.focus();
}
