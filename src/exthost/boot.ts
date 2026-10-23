import { watchExtensionCommands } from "./commands";
import { startHost, watchHostInputs } from "./client";

/** Dipanggil setelah daftar ekstensi terpasang dimuat. */
export async function bootExtHost() {
  watchExtensionCommands();
  watchHostInputs();
  await startHost();
}
