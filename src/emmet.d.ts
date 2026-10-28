// Tipe minimal pustaka `emmet` (paketnya membawa tipe, tetapi tidak lewat "exports").
declare module "emmet" {
  export interface ExtractedAbbreviation {
    abbreviation: string;
    location: number;
    start: number;
    end: number;
  }
  export function extract(line: string, pos?: number, options?: { type?: "markup" | "stylesheet"; lookAhead?: boolean; prefix?: string }): ExtractedAbbreviation | undefined;
  export default function expand(abbr: string, config?: { type?: "markup" | "stylesheet"; syntax?: string; options?: Record<string, unknown> }): string;
}
