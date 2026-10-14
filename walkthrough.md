# Walkthrough — Nozel Code: Smart Universal Code Runner & Live Output / Terminal 🚀

Aplikasi desktop **Nozel Code** untuk macOS (Apple Silicon M1/M2/M3) kini telah dilengkapi dengan fitur **Smart Universal Code Runner & Live Interactive Output / Terminal**, memungkinkan pengguna menjalankan file kode aktif (PHP, Python, Rust, JavaScript, TypeScript, Shell Script, Go, C/C++) secara instan dan melihat output langsung di dalam editor tanpa perlu membuka aplikasi terminal terpisah.

---

## ⚡ 1. Fitur Utama Baru: Smart Universal Code Runner & Live Output Panel

Sesuai permintaan Anda (*"nozel code kok ngga ada run nya sihh bangke lahh gabisa liat run run nya gw kan mau nya lengkap pokoknya lu searching lu kasih saran ntar gw acc"*):

### A. Tombol Eksekusi Instan `▶ Run Code` di Tab Bar
- Terdapat tombol **`▶ Run`** di sudut kanan atas tab bar editor.
- **Keyboard Shortcuts**: Tekan `⌘R` atau `F5` di file kodingan apa pun untuk langsung mengeksekusi file aktif.
- **Auto-Save on Run**: Jika ada perubahan file yang belum disimpan (`isDirty`), file otomatis disimpan sebelum dieksekusi.
- **Indikator Loading Real-time**: Saat kode sedang berjalan, tombol menampilkan status `Running...` dan tab OUTPUT menampilkan spinner animasi live.

### B. Panel Bawah Tab `OUTPUT` (Code Runner Console)
- **Status Header**:
  - Badge exit code: `● exit 0` (hijau terang jika sukses) atau `● exit 1` (merah jika ada runtime error).
  - Badge durasi eksekusi: `⏱️ 38 ms` (akurat dihitung via `std::time::Instant` Rust backend).
  - Tombol **Clear Output 🗑️**: Menghapus riwayat keluaran runner.
  - Tombol **Rerun Code 🔄**: Menjalankan ulang file aktif seketika.
- **Console Output**:
  - Baris perintah: `[Running] php "/path/to/server.php"`
  - Keluaran `stdout` (putih / hijau terang)
  - Keluaran `stderr` (merah tajam jika terjadi runtime exception / fatal error)
  - Baris penyelesaian: `[Done] exited with code=0 in 0.038 seconds`

### C. Tab `TERMINAL` Interaktif (Interactive CLI)
- Prompt khas terminal macOS: `macbook:nozel-project user$ <input>`.
- Pengguna dapat mengetik perintah shell bebas langsung di working directory proyek (misal: `ls -la`, `pwd`, `php -v`, `node -v`, `cargo test`, `git status`).
- Eksekusi instan saat menekan tombol **Enter**.
- **Fitur History Navigasi**: Tekan panah atas `↑` dan panah bawah `↓` untuk memanggil perintah-perintah sebelumnya.
- Dukungan perintah internal `clear` dan tombol 🗑️ di header untuk membersihkan tampilan riwayat terminal.

---

## 🛠️ 2. Multi-Language Auto-Detection Engine

Rust backend (`src-tauri/src/lib.rs`) mendeteksi interpreter atau compiler otomatis berdasarkan ekstensi file dan lingkungan macOS login PATH (`/opt/homebrew/bin`, `/usr/local/bin`, `$HOME/.cargo/bin`):

| Bahasa / Ekstensi | Runner Command Otomatis |
|---|---|
| **PHP** (`.php`) | `php "{file_path}"` |
| **Python** (`.py`) | `python3 "{file_path}"` |
| **JavaScript** (`.js`, `.mjs`, `.cjs`) | `node "{file_path}"` |
| **TypeScript** (`.ts`, `.tsx`) | `npx tsx "{file_path}"` (fallback `node`) |
| **Rust** (`.rs`) | `cargo run` (jika di folder Cargo) / `rustc "{file_path}"` |
| **Go** (`.go`) | `go run "{file_path}"` |
| **Shell** (`.sh`, `.zsh`, `.bash`) | `bash "{file_path}"` |
| **C / C++** (`.c`, `.cpp`) | `clang` / `clang++` compile & execute |

---

## 📸 Bukti Visual Mockup & Fitur Run

`mockup_run_preview.png` memperlihatkan tampilan panel saat file PHP dieksekusi:

![Nozel Code Runner & Live Output Panel](/Users/mac/.gemini/antigravity/brain/e96f9cab-1cce-41a8-8671-2c0bba51dc35/mockup_run_preview.png)

Mockup interaktif HTML tersedia di:
- [mockup_run_feature.html](file:///Users/mac/.gemini/antigravity/brain/e96f9cab-1cce-41a8-8671-2c0bba51dc35/mockup_run_feature.html)

---

## 🧪 Hasil Pengujian & Verifikasi Lengkap

### 1. Vitest Frontend Test Suite (`npm test`)
- **41 tests passed** (100% lulus di 6 test files):
  - `src/services/codeRunner.test.ts` (9 tests: PHP runner, Python runner, Rust runner, Node runner, Shell runner, Fallback runner, `pwd`, `echo`, terminal execution)
  - `src/services/tauriService.test.ts` (10 tests)
  - `src/utils/codeLinter.test.ts` (6 tests)
  - `src/utils/editorLanguage.test.ts` (8 tests)
  - `src/utils/phpHighlighting.test.ts` (5 tests)
  - `src/utils/codeExtensions.test.ts` (3 tests)

### 2. Rust Backend Test Suite (`cargo test --manifest-path src-tauri/Cargo.toml`)
- **10 cargo tests passed**:
  - `test_execute_code_run_sh`: Eksekusi shell script via backend
  - `test_execute_terminal_command_echo`: Eksekusi terminal command dengan exit code 0
  - `test_execute_code_run_nonexistent_file`: Error handling saat file tidak ditemukan
  - `test_execute_code_run_unsupported_extension`: Penanganan ekstensi file tak dikenal
  - `test_git_status_non_repo`, `test_binary_file_detection`, `test_read_and_write_file_text`, `test_read_file_image`, `test_system_footprint`, `test_list_dir_filtering_and_sorting`.

### 3. Build & Production Packaging (`npm run tauri build`)
- **Aplikasi macOS Siap Pakai**: Berhasil di-bundle dan disalin ke `/Applications/Nozel Code.app` (ukuran biner ultra-ringan: 4.79 MB).
- **DMG Installer**: Tersedia di Desktop `/Users/mac/Desktop/Nozel Code.dmg` (2.57 MB).

---

## 🚀 Cara Menjalankan & Menguji di MacBook

1. **Buka Nozel Code**:
   - Jalankan `open -a "Nozel Code"` atau cari `Nozel Code` di Spotlight (`⌘ Space`).
2. **Uji Run Code**:
   - Buka file kode apa saja (misal `server.php` atau `analyze.py`).
   - Klik tombol **`▶ Run`** di sudut kanan atas tab bar atau tekan **`⌘R`** / **`F5`**.
   - Panel bawah otomatis terbuka ke tab **OUTPUT** menampilkan command eksekusi, stdout/stderr, status `● exit 0`, dan durasi milidetik (`⏱️ X ms`).
3. **Uji Terminal**:
   - Klik tab **TERMINAL** di panel bawah.
   - Ketik `ls -la` atau `pwd`, tekan **Enter**.
   - Output shell langsung tampil di konsol secara interaktif.
