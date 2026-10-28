import { beforeEach, describe, expect, it } from "vitest";
import { targetDir } from "../app/actions";
import { setState } from "../state/store";

describe("targetDir: resolusi folder target untuk berkas/folder baru", () => {
  const ROOT = "/Users/mac/Project-Alex";

  beforeEach(() => {
    setState({
      root: ROOT,
      dirs: {
        [ROOT]: [
          { name: "src", path: `${ROOT}/src`, is_dir: true, is_symlink: false, size: null, extension: null },
          { name: "package.json", path: `${ROOT}/package.json`, is_dir: false, is_symlink: false, size: 100, extension: "json" },
        ],
        [`${ROOT}/src`]: [
          { name: "components", path: `${ROOT}/src/components`, is_dir: true, is_symlink: false, size: null, extension: null },
          { name: "index.ts", path: `${ROOT}/src/index.ts`, is_dir: false, is_symlink: false, size: 50, extension: "ts" },
        ],
      },
      selectedTreePath: null,
      groups: [{ tabs: [], active: null }],
    });
  });

  it("jika path adalah root project, tetap di root (tidak kabur ke dirname parent)", () => {
    expect(targetDir(ROOT)).toBe(ROOT);
    expect(targetDir(`${ROOT}/`)).toBe(ROOT);
  });

  it("jika path adalah folder yang sudah ada di s.dirs, kembalikan folder itu (masuk ke dalam)", () => {
    expect(targetDir(`${ROOT}/src`)).toBe(`${ROOT}/src`);
  });

  it("jika path adalah folder dari cache entries (meski belum diexpand ke s.dirs), kembalikan folder itu", () => {
    expect(targetDir(`${ROOT}/src/components`)).toBe(`${ROOT}/src/components`);
  });

  it("jika path adalah berkas biasa, kembalikan folder induknya (bukan root)", () => {
    expect(targetDir(`${ROOT}/src/index.ts`)).toBe(`${ROOT}/src`);
  });

  it("jika path null tapi ada folder yang dipilih di tree (selectedTreePath), gunakan folder itu", () => {
    setState({ selectedTreePath: `${ROOT}/src/components` });
    expect(targetDir(null)).toBe(`${ROOT}/src/components`);
    expect(targetDir()).toBe(`${ROOT}/src/components`);
  });

  it("jika path null tapi ada berkas yang dipilih di tree, gunakan folder induk berkas tersebut", () => {
    setState({ selectedTreePath: `${ROOT}/src/index.ts` });
    expect(targetDir(null)).toBe(`${ROOT}/src`);
  });

  it("jika path dan selectedTreePath null, tapi ada tab aktif, gunakan folder tab aktif", () => {
    setState({
      selectedTreePath: null,
      tabs: { [`${ROOT}/src/index.ts`]: { id: `${ROOT}/src/index.ts`, name: "index.ts", kind: "text", lang: "typescript", dirty: false, preview: "code" } },
      groups: [{ tabs: [`${ROOT}/src/index.ts`], active: `${ROOT}/src/index.ts` }],
    });
    expect(targetDir(null)).toBe(`${ROOT}/src`);
  });

  it("jika tidak ada pilihan apa pun, kembalikan root project", () => {
    setState({ selectedTreePath: null, groups: [{ tabs: [], active: null }] });
    expect(targetDir(null)).toBe(ROOT);
  });
});
