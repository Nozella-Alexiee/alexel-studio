// Pencocokan glob ala VS Code (`**/*.ts`, `{a,b}`, `?`, `[abc]`); salinan renderer dari electron/exthost/glob.ts.

export function globToRegExp(glob: string): RegExp {
  let re = "";
  let i = 0;
  let braces = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` = nol atau lebih folder; `**` di akhir = apa pun.
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
          continue;
        }
        re += ".*";
        i += 2;
        continue;
      }
      re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      braces++;
      re += "(?:";
    } else if (c === "}" && braces > 0) {
      braces--;
      re += ")";
    } else if (c === "," && braces > 0) re += "|";
    else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end < 0) re += "\\[";
      else {
        let body = glob.slice(i + 1, end);
        if (body.startsWith("!")) body = "^" + body.slice(1);
        re += `[${body.replace(/\\/g, "\\\\")}]`;
        i = end;
      }
    } else if (c === "\\") {
      re += "\\\\";
    } else re += c.replace(/[.+^$()|\\]/g, "\\$&");
    i++;
  }
  return new RegExp(`^${re}$`);
}

const cache = new Map<string, RegExp>();
/** `relPath` memakai "/" sebagai pemisah. Pola tanpa "/" dicocokkan dengan nama berkas di folder mana pun. */
export function globMatch(glob: string, relPath: string): boolean {
  let re = cache.get(glob);
  if (!re) {
    re = globToRegExp(glob.includes("/") ? glob : `**/${glob}`);
    cache.set(glob, re);
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  }
  return re.test(relPath.replace(/\\/g, "/"));
}
