# Nozel Code ⚡

> **Editor kode desktop modern, ultra-ringan, dan cepat untuk macOS Apple Silicon (MacBook Air M1 8 GB RAM) dengan pendamping bawaan resmi Claude Code CLI (Claude Pro/Max).**

---

## 🚀 Mengapa Nozel Code?

Sebagian besar editor modern seperti VS Code berbasis Electron dan memakan RAM ratusan megabyte bahkan saat tidak digunakan. **Nozel Code** dibangun khusus untuk efisiensi maksimal:

- **Tauri 2 + Rust**: Core native ultra-ringan dengan memori dasar hanya **~38 MB RAM** (vs ~650 MB di VS Code, **~94% lebih hemat**).
- **CodeMirror 6**: Syntax highlighting instan, minim memory footprint, tanpa beratnya engine Monaco.
- **Mac-Native Aesthetic**: Header modern bergaya macOS dengan spacing traffic light, dark/light theme, dan tipografi Apple SF Mono.
- **Official Claude Code CLI Bridge**: Terhubung langsung ke Claude Code CLI langganan **Claude Pro/Max** tanpa biaya token API per-call dan tanpa risiko bocornya API key.
- **Strict Privacy & User Consent**: Menampilkan transparansi penuh payload sebelum kueri dijalankan. Tanpa telemetri tersembunyi.

---

## 🛠️ Persyaratan Sistem

- macOS 12+ (Apple Silicon M1/M2/M3/M4 disarankan)
- Node.js 18+ & npm 9+
- Rust Toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- *(Opsional untuk AI)* Claude Code CLI: `npm install -g @anthropic-ai/claude-code`

---

## 💻 Panduan Menjalankan & Mengembangkan

### 1. Instalasi Dependensi
```bash
# Clone atau buka direktori proyek
cd nozel-code

# Instal dependensi frontend
npm install
```

### 2. Menjalankan Pengujian (Test Suite)
Proyek ini dilengkapi dengan unit test otomatis di Rust (backend) dan Vitest (frontend):
```bash
# Menjalankan seluruh pengujian (Rust + TypeScript):
npm run test:all

# Atau jalankan masing-masing:
npm run test              # Vitest frontend tests
cargo test --manifest-path src-tauri/Cargo.toml  # Rust backend tests
```

### 3. Menjalankan Aplikasi
```bash
# Mode Web Preview (Cepat untuk pengujian antarmuka di browser):
npm run dev

# Mode Desktop Desktop Native macOS (Tauri dev mode):
npm run tauri dev
```

### 4. Membangun Paket Aplikasi macOS (Production Bundle)
```bash
# Membangun file .app dan .dmg untuk macOS:
npm run tauri build
```
Hasil paket aplikasi akan berada di `src-tauri/target/release/bundle/macos/`.

---

## 📋 Fitur yang Tersedia (MVP)

1. **Antarmuka & Pengalaman Pengguna (Mac-First UX)**:
   - Modern traffic lights window styling dengan frame header elegan.
   - Sidebar file tree collapsible dengan icon spesifik untuk tiap tipe file.
   - Tab editor dengan indikator perubahan yang belum disimpan (`●`).
   - Breadcrumb file path dan status bar informatif (baris, kolom, bahasa, encoding).
   - Saklar tema Dark Mode & Light Mode instan.

2. **Manajemen Berkas & Operasi File**:
   - Pemilih folder proyek asli macOS (`@tauri-apps/plugin-dialog`).
   - Buka, ubah, dan simpan file (`Cmd+S`).
   - Buat file baru (`New File`) dan folder baru (`New Folder`).
   - Hapus berkas dengan konfirmasi.
   - Peringatan konfirmasi sebelum menutup berkas yang memiliki perubahan belum tersimpan (`Save`, `Don't Save`, `Cancel`).

3. **Editor Kode (CodeMirror 6)**:
   - Nomor baris (line numbers), code folding, dan bracket matching.
   - Pencarian kode bawaan (`Cmd+F`).
   - Deteksi otomatis sintaks untuk:
     - JavaScript (`.js`, `.jsx`)
     - TypeScript (`.ts`, `.tsx`)
     - JSON (`.json`)
     - HTML (`.html`)
     - CSS (`.css`, `.scss`)
     - Markdown (`.md`)
     - Python (`.py`)
     - Rust (`.rs`)
     - Plain text fallback.

4. **Claude Code Companion Hub ("Hal yang Tidak Ada di VS Code")**:
   - Deteksi real-time status instalasi CLI `claude` pada sistem macOS.
   - Menghubungkan akun Claude Pro/Max melalui CLI resmi tanpa menanam API key.
   - Satu klik untuk membuka Terminal macOS interaktif langsung di working directory proyek.
   - Fitur Quick Query dengan peninjauan payload transparan & persetujuan wajib (consent gate).
   - Widget monitor RAM real-time yang membandingkan konsumsi memori Nozel Code vs VS Code.

---

## 📊 Detail Benchmark & Arsitektur Claude
Silakan baca dokumentasi lengkap di:
- [docs/CLAUDE_INTEGRATION_AND_BENCHMARKS.md](docs/CLAUDE_INTEGRATION_AND_BENCHMARKS.md)
