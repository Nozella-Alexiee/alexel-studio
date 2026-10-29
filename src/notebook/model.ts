// Model notebook Jupyter (nbformat 4): baca/tulis .ipynb dengan format yang sama seperti Jupyter
// (indentasi 1 spasi, `source` sebagai array baris) supaya diff git tetap kecil.

export interface NbOutput {
  output_type: "stream" | "display_data" | "execute_result" | "error";
  name?: string;
  text?: string | string[];
  data?: Record<string, string | string[] | unknown>;
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

export interface NbCell {
  id: string;
  cell_type: "code" | "markdown" | "raw";
  source: string;
  metadata: Record<string, unknown>;
  outputs?: NbOutput[];
  execution_count?: number | null;
  attachments?: unknown;
}

export interface Notebook {
  cells: NbCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
}

const join = (s: unknown) => (Array.isArray(s) ? s.join("") : typeof s === "string" ? s : "");
export const newId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

export function parseNotebook(text: string): Notebook {
  if (!text.trim()) return emptyNotebook();
  const j = JSON.parse(text) as Record<string, unknown>;
  if (!Array.isArray(j.cells)) throw new Error("Bukan notebook nbformat 4 (tidak ada `cells`).");
  return {
    cells: (j.cells as Record<string, unknown>[]).map((c) => ({
      ...(c as object),
      id: typeof c.id === "string" ? c.id : newId(),
      cell_type: (c.cell_type === "markdown" || c.cell_type === "raw" ? c.cell_type : "code") as NbCell["cell_type"],
      source: join(c.source),
      metadata: (c.metadata as Record<string, unknown>) ?? {},
      ...(c.cell_type === "code" ? { outputs: (c.outputs as NbOutput[]) ?? [], execution_count: (c.execution_count as number | null) ?? null } : {}),
    })),
    metadata: (j.metadata as Record<string, unknown>) ?? {},
    nbformat: Number(j.nbformat) || 4,
    nbformat_minor: Number(j.nbformat_minor) || 5,
  };
}

export function emptyNotebook(): Notebook {
  return { cells: [{ id: newId(), cell_type: "code", source: "", metadata: {}, outputs: [], execution_count: null }], metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" } }, nbformat: 4, nbformat_minor: 5 };
}

/** "a\nb\n" → ["a\n", "b\n"]; baris terakhir tanpa \n tetap tanpa \n. */
export const toLines = (s: string): string[] => (s ? s.split(/(?<=\n)/) : []);

const normOutput = (o: NbOutput): NbOutput => {
  const out: NbOutput = { ...o };
  if (out.text !== undefined) out.text = toLines(join(out.text));
  if (out.data) out.data = Object.fromEntries(Object.entries(out.data).map(([k, v]) => [k, typeof v === "string" && (k.startsWith("text/") || k === "image/svg+xml" || k === "application/javascript") ? toLines(v) : v]));
  return out;
};

export function serializeNotebook(nb: Notebook): string {
  const cells = nb.cells.map((c) => {
    const base: Record<string, unknown> = { ...c, cell_type: c.cell_type, id: c.id, metadata: c.metadata ?? {}, source: toLines(c.source) };
    if (c.cell_type === "code") {
      base.execution_count = c.execution_count ?? null;
      base.outputs = (c.outputs ?? []).map(normOutput);
    } else {
      delete base.outputs;
      delete base.execution_count;
    }
    // Urutan kunci seperti Jupyter.
    const order = ["cell_type", "execution_count", "id", "metadata", "outputs", "source"];
    return Object.fromEntries([...order.filter((k) => k in base).map((k) => [k, base[k]]), ...Object.entries(base).filter(([k]) => !order.includes(k))]);
  });
  return JSON.stringify({ cells, metadata: nb.metadata, nbformat: nb.nbformat, nbformat_minor: Math.max(nb.nbformat_minor, 5) }, null, 1) + "\n";
}

export const textOf = (v: unknown) => join(v);

/** Buang kode warna ANSI dari traceback/stream. */
export const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");

/** Gabung output stream berurutan dengan nama sama (seperti Jupyter). */
export function appendOutput(list: NbOutput[], o: NbOutput): NbOutput[] {
  const last = list[list.length - 1];
  if (o.output_type === "stream" && last?.output_type === "stream" && last.name === o.name) return [...list.slice(0, -1), { ...last, text: join(last.text) + join(o.text) }];
  return [...list, o];
}
