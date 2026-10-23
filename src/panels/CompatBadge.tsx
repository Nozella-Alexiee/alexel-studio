import { CheckCircle2, CircleSlash, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { inspectExtension, type Compat, type Result } from "../extensions/market";
import { tl } from "../i18n";

const CONTRIB: Record<string, () => string> = {
  themes: () => tl("tema warna"),
  iconThemes: () => tl("tema ikon"),
  snippets: () => "snippet",
  grammars: () => tl("pewarnaan sintaks"),
  languageConfiguration: () => tl("konfigurasi bahasa"),
};

export const contribList = (c: Compat) => c.data.map((k) => CONTRIB[k]?.() ?? k).join(", ");

/** Kecocokan ekstensi dengan Alexel Studio (diambil lazy dari package.json-nya, sebelum diunduh). */
export function useCompat(r: Pick<Result, "namespace" | "name" | "manifestUrl">): Compat | null | undefined {
  const [c, setC] = useState<Compat | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setC(undefined);
    inspectExtension(r)
      .then((x) => alive && setC(x))
      .catch(() => alive && setC(null));
    return () => {
      alive = false;
    };
  }, [r.namespace, r.name, r.manifestUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  return c;
}

export function CompatBadge({ compat }: { compat: Compat | null | undefined }) {
  if (compat === undefined) return <span className="compat compat-wait">…</span>;
  if (compat === null) return null;
  if (compat.server) {
    return (
      <span className="compat compat-full" title={tl("Data ekstensi + server bahasa sekali klik (autocomplete, hover, diagnostik). Fitur lain yang butuh kode ekstensi tidak berjalan.")}>
        <CheckCircle2 size={11} aria-hidden /> {tl("Lengkap + server bahasa")}
      </span>
    );
  }
  if (compat.level === "full") {
    return (
      <span className="compat compat-full" title={tl("Berjalan penuh: {list}.", { list: contribList(compat) })}>
        <CheckCircle2 size={11} aria-hidden /> {tl("Lengkap")}
      </span>
    );
  }
  if (compat.level === "host") {
    return (
      <span className="compat compat-partial" title={tl("Berisi kode ekstensi: dijalankan di extension host dengan API VS Code terbatas (eksperimental) setelah kamu mempercayainya. Sebagian fitur mungkin tidak berjalan.")}>
        <TriangleAlert size={11} aria-hidden /> {tl("Menjalankan kode (eksperimental)")}
      </span>
    );
  }
  if (compat.level === "partial") {
    return (
      <span className="compat compat-partial" title={tl("Yang dipakai: {list}. Fitur yang butuh kode ekstensi tidak berjalan.", { list: contribList(compat) })}>
        <TriangleAlert size={11} aria-hidden /> {tl("Sebagian")}
      </span>
    );
  }
  return (
    <span className="compat compat-none" title={tl("Ekstensi ini butuh menjalankan kode ekstensi, yang tidak didukung Alexel Studio.")}>
      <CircleSlash size={11} aria-hidden /> {tl("Butuh kode ekstensi")}
    </span>
  );
}
