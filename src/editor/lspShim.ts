// @codemirror/lsp-client sudah menjawab semua request server→klien dengan MethodNotFound, sedangkan
// banyak server (YAML, Prisma, Docker…) memintanya saat start: `workspace/configuration` yang dijawab
// null membuat Prisma crash. Request itu dijawab di sini sebelum sampai ke klien; sisanya lewat biasa.

export interface ShimContext {
  /** Nilai per seksi untuk `workspace/configuration` (mis. { prisma: { enableDiagnostics: true } }). */
  settings: Record<string, unknown> | null;
  rootUri: string;
  rootName: string;
}

const HANDLED = /"method"\s*:\s*"(workspace\/configuration|client\/registerCapability|client\/unregisterCapability|window\/workDoneProgress\/create|workspace\/workspaceFolders)"/;

/** Ambil nilai bersarang: "yaml.format" → settings.yaml.format; seksi kosong → seluruh objek. */
function section(settings: Record<string, unknown> | null, name: string | undefined): unknown {
  if (!settings) return null;
  if (!name) return settings;
  let cur: unknown = settings;
  for (const part of name.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return null;
  }
  return cur;
}

/** Balasan JSON-RPC untuk request server yang kita tangani, atau null bila bukan urusan kita. */
export function answerServerRequest(message: string, ctx: ShimContext): string | null {
  // Cek murah di awal pesan sebelum parse JSON penuh (notifikasi diagnostik bisa sangat besar).
  if (!HANDLED.test(message.slice(0, 300))) return null;
  let m: { id?: number | string; method?: string; params?: { items?: { section?: string }[] } };
  try {
    m = JSON.parse(message);
  } catch {
    return null;
  }
  if (m.id === undefined || !m.method) return null;
  let result: unknown = null;
  switch (m.method) {
    case "workspace/configuration":
      result = (m.params?.items ?? []).map((i) => section(ctx.settings, i.section));
      break;
    case "workspace/workspaceFolders":
      result = [{ uri: ctx.rootUri, name: ctx.rootName }];
      break;
    default:
      result = null; // registerCapability, unregisterCapability, workDoneProgress/create
  }
  return JSON.stringify({ jsonrpc: "2.0", id: m.id, result });
}
