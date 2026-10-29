// Tipe request/respons HTTP bersama main process & renderer (tanpa import Node).

export interface HttpRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body?: string | null;
  /** Body dari berkas (sintaks `< ./data.json`), relatif terhadap `baseDir`. */
  bodyFile?: string | null;
  baseDir?: string | null;
  /** Folder project untuk {{$dotenv X}}. */
  root?: string | null;
  timeoutMs?: number;
  followRedirects?: boolean;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  /** Body teks (utf-8) bila tipe konten teks, selain itu null. */
  text: string | null;
  /** Body biner sebagai base64 (gambar/PDF/…); null untuk teks. */
  base64: string | null;
  contentType: string;
  size: number;
  truncated: boolean;
  ms: number;
  url: string;
  redirected: boolean;
}
