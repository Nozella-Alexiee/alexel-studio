import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Renderer Nozel Code. Di Electron produksi dilayani lewat protokol app://nozel
// (lihat electron/main.ts); saat dev lewat http://localhost:1420.
export default defineConfig(() => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/dist-electron/**", "**/release/**", "**/electron/**"] },
  },
  build: {
    target: "chrome130",
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
    // Tes yang menjalankan PowerShell/proses nyata di runner CI Windows kadang >5 dtk saat beban tinggi.
    testTimeout: 30_000,
  },
}));
