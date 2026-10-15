import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { beginTurn, checkpointList, checkpointPre, checkpointRestore, observe } from "./checkpoints";
import type { Ctx } from "./util";

const tmp = (name: string) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `alexel-cp-${name}-`)));

function setup() {
  const root = tmp("proj");
  const userData = tmp("ud");
  const events: { event: string; payload: unknown }[] = [];
  const ctx: Ctx = {
    userData,
    emit: (event, payload) => events.push({ event, payload }),
    trash: async (p) => fs.rmSync(p, { recursive: true, force: true }),
    reveal: () => {},
  };
  return { root, ctx, events };
}

const line = (o: unknown) => JSON.stringify(o);
const claudeStream = (key: string, file: string) => {
  observe(key, line({ type: "stream_event", event: { type: "message_start" } }));
  observe(key, line({ type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "Edit", id: "t1" } } }));
  // file_path datang terpotong-potong di beberapa delta.
  const json = JSON.stringify({ file_path: file, old_string: "a", new_string: "b" });
  for (let i = 0; i < json.length; i += 7) observe(key, line({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: json.slice(i, i + 7) } } }));
};

describe("checkpoint agen", () => {
  it("menyalin isi berkas saat path Claude mengalir, lalu memulihkannya", async () => {
    const { root, ctx, events } = setup();
    const f = path.join(root, "a.ts");
    fs.writeFileSync(f, "asli\n");
    beginTurn(ctx, "chat-1", "turn-1", root);
    claudeStream("chat-1", f);
    fs.writeFileSync(f, "diubah agen\n");
    observe("chat-1", line({ type: "result", subtype: "success" }));
    expect(events.some((e) => e.event === "checkpoint-touched")).toBe(true);
    expect(checkpointList(ctx, root, "chat-1")).toHaveLength(1);
    expect(checkpointPre(ctx, root, "chat-1", f)?.content).toBe("asli\n");
    const r = await checkpointRestore(ctx, root, "chat-1", "turn-1");
    expect(r.restored).toEqual([f]);
    expect(fs.readFileSync(f, "utf8")).toBe("asli\n");
  });

  it("dua giliran: isi paling awal dipakai, berkas buatan agen dihapus", async () => {
    const { root, ctx } = setup();
    const a = path.join(root, "a.txt");
    const b = path.join(root, "baru.txt");
    fs.writeFileSync(a, "v1");
    beginTurn(ctx, "chat-2", "t1", root);
    observe("chat-2", line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: a, content: "v2" } }] } }));
    fs.writeFileSync(a, "v2");
    observe("chat-2", line({ type: "result" }));
    beginTurn(ctx, "chat-2", "t2", root);
    // Codex: ApplyPatch dengan daftar perubahan; satu berkas baru.
    observe("chat-2", line({ type: "assistant", message: { content: [{ type: "tool_use", name: "ApplyPatch", input: { changes: [{ path: a, kind: "update" }, { path: b, kind: "add" }] } }] } }));
    fs.writeFileSync(a, "v3");
    fs.writeFileSync(b, "baru");
    observe("chat-2", line({ type: "result" }));

    // Pulihkan ke sebelum giliran kedua: a = v2, b dihapus.
    let r = await checkpointRestore(ctx, root, "chat-2", "t2");
    expect(fs.readFileSync(a, "utf8")).toBe("v2");
    expect(fs.existsSync(b)).toBe(false);
    expect(r.removed).toEqual([b]);
    // Pulihkan ke sebelum giliran pertama: a = v1.
    r = await checkpointRestore(ctx, root, "chat-2", "t1");
    expect(fs.readFileSync(a, "utf8")).toBe("v1");
  });

  it("ACP: isi lama dari agen; path di luar project diabaikan", () => {
    const { root, ctx } = setup();
    const f = path.join(root, "g.py");
    fs.writeFileSync(f, "sudah ditulis agen");
    beginTurn(ctx, "chat-3", "t1", root);
    observe("chat-3", line({ type: "control_request", request: { subtype: "can_use_tool", tool_name: "ApplyPatch", input: { file_path: f, before: "isi lama", after: "sudah ditulis agen" } } }));
    observe("chat-3", line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: path.join(os.tmpdir(), "luar.txt") } }] } }));
    expect(checkpointPre(ctx, root, "chat-3", f)?.content).toBe("isi lama");
    expect(checkpointList(ctx, root, "chat-3")[0].files.map((x) => x.path)).toEqual([f]);
  });

  it("menolak kunci percakapan tidak valid", () => {
    const { root, ctx } = setup();
    expect(() => checkpointList(ctx, root, "../x")).toThrow();
  });
});
