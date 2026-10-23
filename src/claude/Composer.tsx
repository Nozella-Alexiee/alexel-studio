// Kotak pesan Claude: @-mention berkas, slash command, lampiran gambar, chip konteks,
// serta pemilih mode izin, model, dan effort (seperti ekstensi Claude Code di VS Code).

import {
  ArrowUp,
  AtSign,
  Brain,
  Check,
  ChevronDown,
  FileCode2,
  Gauge,
  ImagePlus,
  ListChecks,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Square,
  TextCursorInput,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as docs from "../editor/documents";
import { FileIcon } from "../components/FileIcon";
import { fuzzyFilter } from "../lib/fuzzy";
import { prettyKeys } from "../lib/keys";
import { basename, relative } from "../lib/paths";
import { projectFiles } from "../lib/projectFiles";
import { MENTIONS } from "./mentions";
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
  setClaudeUltracode,
  setClaudeFast,
  setClaudeThinking,
  modesAvailable,
} from "./claude";
import { CLAUDE_DEFAULT_EFFORTS, claudeEffortLevels, effortLabel, EFFORTS, modelChoices, selectedModel } from "./options";
import { agentInfo } from "../agents/registry";
import { tl } from "../i18n";

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
      toast(tl("{name} lebih dari 5 MB.", { name: file.name || tl("Gambar") }), "error");
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
  auto: <ShieldCheck size={12} aria-hidden />,
  bypassPermissions: <ShieldAlert size={12} aria-hidden />,
};

// ---------------- Saran @ dan / ----------------

interface Suggest {
  kind: "file" | "cmd";
  items: { id: string; label: string; detail?: string; ctx?: boolean; run: () => void }[];
}

const LOCAL_CMDS = [
  { name: "model", description: tl("Ganti model") },
  { name: "effort", description: tl("Ganti tingkat effort") },
  { name: "mode", description: tl("Ganti mode izin") },
  { name: "clear", description: tl("Mulai percakapan baru") },
  { name: "resume", description: tl("Lanjutkan percakapan sebelumnya") },
  { name: "ultracode", description: tl("Nyalakan atau matikan Ultracode") },
];

export function Composer({ onShowHistory }: { onShowHistory: () => void }) {
  const running = useStore((s) => s.chatRunning);
  const root = useStore((s) => s.root);
  const includeDefault = useStore((s) => s.settings.claudeIncludeFile);
  const agent = useStore((s) => s.settings.agent);
  const dynModes = useStore((s) => s.agentModes);
  const baseCaps = agentInfo(agent).caps;
  // Pilihan per agen (Claude memakai claudeModel dsb., agen lain agentPrefs).
  const choice = useStore((s) => (s.settings.agent === "claude" ? `${s.settings.claudeModel}|${s.settings.claudeEffort}|${s.settings.claudeMode}` : JSON.stringify(s.settings.agentPrefs[s.settings.agent] ?? {})));
  const { model, effort, mode } = useMemo(() => agentChoice(agent), [agent, choice]);
  const models = useStore((s) => s.claudeModels);
  const claudeInfo = useStore((s) => s.claude);
  const allowDangerous = useStore((s) => s.settings.allowDangerousModes);
  const ultracodeOn = useStore((s) => s.settings.claudeUltracode);
  const fastOn = useStore((s) => s.settings.claudeFast);
  const thinkingOn = useStore((s) => s.settings.claudeThinking);
  const fastInfo = useStore((s) => s.claudeFastInfo);
  const ultracodeAvail = useStore((s) => s.claudeUltracodeAvailable);
  const caps = useMemo(() => ({ ...baseCaps, modes: modesAvailable(agent) }), [agent, baseCaps, dynModes, claudeInfo, models, allowDangerous]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const modelList = agent === "claude" ? modelChoices(models) : [{ value: "default", displayName: tl("Bawaan"), description: tl("Model bawaan agen") }, ...models.filter((m) => m.value !== "default")];
  const modelValue = modelList.some((m) => m.value === model)
    ? model
    : "default";
  const modelObj = selectedModel(models, modelValue);
  // Claude: hanya effort yang didukung model terpilih (dan CLI); model tanpa pengaturan effort = kontrol tersembunyi.
  // Agen lain: daftar dari modelnya bila ada, kalau tidak low…max (nilai khusus Codex tidak ikut ditawarkan sembarangan).
  const claudeLevels = agent === "claude" ? claudeEffortLevels(modelObj, claudeInfo?.efforts) : null;
  const showEffort = caps.effort && (agent !== "claude" || claudeLevels !== null);
  const effortIds = agent === "claude" ? claudeLevels ?? CLAUDE_DEFAULT_EFFORTS : modelObj?.supportedEffortLevels ?? ["low", "medium", "high", "xhigh", "max"];
  const effortChoices = [EFFORTS[0], ...effortIds.map((id) => ({ id, label: effortLabel(id) }))];
  const showUltracode = agent === "claude" && ultracodeAvail && claudeLevels !== null;

  // ---- saran ----
  const refreshSuggest = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = /(^|\s)@([^\s@]*)$/.exec(before);
    if (at && root) {
      const q = at[2];
      // Baru mengetik "@": muat ulang daftar berkas (berkas baru, termasuk buatan agen).
      if (!q) void projectFiles(root).then((f) => (files.current = f));
      const start = caret - q.length - 1;
      const hits = fuzzyFilter(q, files.current, (f) => f, 8);
      const insert = (word: string) => {
        const next = value.slice(0, start) + "@" + word + " " + value.slice(caret);
        setText(next);
        setSuggest(null);
        requestAnimationFrame(() => {
          const pos = start + word.length + 2;
          area.current?.setSelectionRange(pos, pos);
          area.current?.focus();
        });
      };
      const ctxHits = MENTIONS.filter((m) => m.id.startsWith(q.toLowerCase()));
      setSuggest({
        kind: "file",
        items: [
          ...ctxHits.map((m) => ({ id: m.label, label: m.label, detail: m.hint, ctx: true, run: () => insert(m.id) })),
          ...hits.map((h) => ({ id: h.item, label: basename(h.item), detail: h.item, run: () => insert(h.item) })),
        ],
      });
      setSel(0);
      return;
    }
    const slash = /^\/([\w:-]*)$/.exec(before);
    if (slash) {
      const q = slash[1].toLowerCase();
      const all = [
        ...LOCAL_CMDS.filter((c) => (c.name === "ultracode" ? agent === "claude" && ultracodeAvail : c.name === "resume" ? caps.history : c.name === "effort" ? caps.effort : c.name === "mode" ? caps.modes.length > 0 : c.name === "model" ? caps.models : true)).map((c) => ({ ...c, local: true })),
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
    else if (name === "ultracode") void setClaudeUltracode(!ultracodeOn);
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
    if (!caps.images) {
      toast(tl("Agen ini belum menerima gambar."), "info");
      return;
    }
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
              title={tl("Seleksi di editor ikut dikirim")}
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
              title={tl("Isi berkas aktif ikut dikirim")}
            >
              <FileCode2 size={12} aria-hidden />{" "}
              {fileName ?? tl("tidak ada berkas")}
            </button>
          )}
          {images.map((im, i) => (
            <span key={i} className="cz-thumb" title={im.name}>
              <img src={im.url} alt={im.name} />
              <button
                aria-label={tl("Hapus {name}", { name: im.name })}
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
            aria-label={suggest.kind === "file" ? tl("Berkas") : tl("Perintah")}
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
                {it.ctx ? (
                  <AtSign size={13} className="cz-ctx-icon" aria-hidden />
                ) : suggest.kind === "file" ? (
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
              ? tl("{name} sedang menjawab…", { name: agentInfo(agent).short })
              : tl("Tanya {name}, @ untuk berkas, / untuk perintah", { name: agentInfo(agent).short })
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
          aria-label={tl("Pesan untuk agen AI")}
        />

        <div className="cz-bar">
          <div className="cz-pickers">
            {caps.modes.length > 0 && (
            <Picker
              className="pick-mode"
              label={tl("Mode izin")}
              title={tl("Mode izin ({keys} untuk ganti)", { keys: prettyKeys("Shift+Tab") })}
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
            {showEffort && (
            <Picker
              className="pick-effort"
              label="Effort"
              title={tl("Effort: seberapa lama agen berpikir. Berlaku mulai pesan berikutnya.")}
              icon={<Brain size={12} aria-hidden />}
              value={
                effortChoices.some((e) => e.id === effort) ? effort : "auto"
              }
              choices={effortChoices.map((e) => ({
                id: e.id,
                label: effortLabel(e.id),
                hint: e.id === "auto" ? tl("Bawaan model") : undefined,
              }))}
              onPick={(v) => void setClaudeEffort(v)}
            />
            )}
            {agent === "claude" && fastInfo && (fastInfo.reason === undefined || fastInfo.reason === "sdk_opt_in_required" || fastOn) && (
              <button type="button" role="switch" aria-checked={fastOn} className={`cz-toggle ${fastOn ? "is-on" : ""}`} title={fastOn && fastInfo?.state !== "on" && fastInfo?.reason && fastInfo.reason !== "sdk_opt_in_required" ? tl("Mode cepat diminta, tapi tidak aktif untuk akun/model ini ({reason}).", { reason: fastInfo.reason }) : tl("Mode cepat: respons lebih cepat dengan biaya lebih tinggi (bila akun dan model mendukung). Berlaku langsung.")} onClick={() => void setClaudeFast(!fastOn)}>
                <Gauge size={12} aria-hidden /> {tl("Cepat")}
              </button>
            )}
            {agent === "claude" && (
              <button type="button" role="switch" aria-checked={thinkingOn} className={`cz-toggle ${thinkingOn ? "is-on" : ""}`} title={tl("Thinking: Claude berpikir dulu sebelum menjawab. Matikan untuk respons lebih singkat. Berlaku langsung.")} onClick={() => void setClaudeThinking(!thinkingOn)}>
                <Brain size={12} aria-hidden /> {tl("Berpikir")}
              </button>
            )}
            {showUltracode && (
              <button
                type="button"
                role="switch"
                aria-checked={ultracodeOn}
                className={`cz-toggle ${ultracodeOn ? "is-on" : ""}`}
                title={tl("Ultracode: Claude bekerja lebih lama dan teliti pada tugas besar (mengerahkan banyak agen). Berlaku langsung.")}
                onClick={() => void setClaudeUltracode(!ultracodeOn)}
              >
                <Zap size={12} aria-hidden /> Ultracode
              </button>
            )}
          </div>
          <div className="cz-actions">
            {caps.images && (
            <label className="cz-icon-btn" title={tl("Lampirkan gambar")}>
              <ImagePlus size={14} aria-hidden />
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={(e) =>
                  e.target.files && void addFiles(e.target.files)
                }
                aria-label={tl("Lampirkan gambar")}
              />
            </label>
            )}
            <button
              className="cz-icon-btn"
              title={tl("Sebut berkas (@)")}
              aria-label={tl("Sebut berkas")}
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
                aria-label={tl("Hentikan")}
                title={tl("Hentikan")}
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                className="cz-send"
                onClick={() => void send()}
                disabled={!text.trim() && !images.length}
                aria-label={tl("Kirim")}
                title={`${tl("Kirim")} (Enter)`}
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="cz-foot">
        <span>{tl("Shift+Enter baris baru · @ berkas · / perintah")}</span>
        <span className="spacer" />
        {ctxPct != null && (
          <span
            title={tl("{used} dari {total} token konteks · setara ${cost} harga API", { used: usage!.context.toLocaleString(), total: usage!.window.toLocaleString(), cost: usage!.cost.toFixed(3) })}
          >
            {tl("{pct}% konteks", { pct: ctxPct })}
          </span>
        )}
      </div>
    </div>
  );
}

/** Fokus ke kotak pesan agen (dipakai perintah "Tanya agen AI"). */
export function focusComposer() {
  (
    document.getElementById("claude-input") as HTMLTextAreaElement | null
  )?.focus();
}
