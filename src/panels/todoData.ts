import { api } from "../lib/ipc";
import { getState, isSaver, setState } from "../state/store";

let timer = 0;
let running = false;

export async function refreshTodos() {
  const root = getState().root;
  if (!root || running) return;
  running = true;
  try {
    const t = await api.todos(root);
    if (getState().root === root) setState({ todos: t });
  } catch {
    setState({ todos: [] });
  } finally {
    running = false;
  }
}

/** Dipanggil saat berkas berubah; ditunda supaya tidak memindai berkali-kali. */
export function scheduleTodoRefresh() {
  clearTimeout(timer);
  timer = window.setTimeout(() => void refreshTodos(), isSaver() ? 8000 : 2500);
}
