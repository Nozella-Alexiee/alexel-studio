// JSON dengan komentar dan koma di akhir (tasks.json, launch.json, tsconfig, package.json ekstensi).

export function stripJsonc(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  // Koma sebelum } atau ] (di luar string; string sudah utuh jadi aman dicari per-token).
  return out.replace(/("(?:[^"\\]|\\.)*")|,(\s*[}\]])/g, (_m, s, tail) => (s ? s : tail));
}

export function parseJsonc<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(stripJsonc(text)) as T;
  } catch {
    return null;
  }
}
