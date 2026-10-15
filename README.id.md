<p align="center">
  <img src="docs/assets/alexel-studio-banner.svg" alt="Alexel Studio Banner" width="100%" />
</p>

<p align="center">
  <strong>Editor Kode Berbasis AI Generasi Baru, Gratis &amp; Open Source untuk macOS, Windows, dan Linux.</strong><br/>
  Kolaborasi langsung bareng agen AI otonom favoritmu berdampingan dengan terminal asli, server bahasa (LSP), dan debugger bawaan — dengan kendali penuh persetujuan di setiap baris perubahan kode.
</p>

<p align="center">
  <a href="https://github.com/Nozella-Alexiee/alexel-studio/releases/latest"><img src="https://img.shields.io/badge/Rilis_Terbaru-v0.3.0-blue?style=for-the-badge&logo=github&logoColor=white" alt="Rilis Terbaru" /></a>
  <a href="#-agen-ai-yang-didukung"><img src="https://img.shields.io/badge/Agen_AI-Claude_·_Codex_·_Gemini_·_Antigravity-8B5CF6?style=for-the-badge" alt="Agen AI" /></a>
  <a href="#-unduh--instalasi"><img src="https://img.shields.io/badge/Platform-macOS_·_Windows_·_Linux-38BDF8?style=for-the-badge&logo=apple&logoColor=white" alt="Lintas Platform" /></a>
  <a href="#-privasi--tanpa-telemetri"><img src="https://img.shields.io/badge/Telemetri-Nol_·_100%25_Privat-10B981?style=for-the-badge" alt="Privasi Tanpa Telemetri" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lisensi-MIT-amber?style=for-the-badge" alt="Lisensi MIT" /></a>
</p>

<p align="center">
  <a href="README.md"><b>English</b></a> · <a href="README.id.md"><b>Bahasa Indonesia</b></a> · <a href="#-unduh--instalasi"><b>Unduh</b></a> · <a href="docs/AGENTS.md"><b>Protokol Agen</b></a> · <a href="CONTRIBUTING.md"><b>Berkontribusi</b></a>
</p>

---

<p align="center">
  <img src="docs/screenshots/agent.jpg" alt="Tinjauan Perubahan Kode AI di Alexel Studio" width="100%" style="border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,0.28);" />
</p>

---

## 📑 Daftar Isi

- [✨ Mengapa Alexel Studio?](#-mengapa-alexel-studio)
- [🤖 Agen AI yang Didukung](#-agen-ai-yang-didukung)
- [📸 Sorotan Fitur Utama](#-sorotan-fitur-utama)
  - [1. Tinjauan Diff Visual & Izin Bertahap](#1-tinjauan-diff-visual--izin-bertahap)
  - [2. Checkpoint Pesan & Riwayat Berkas](#2-checkpoint-pesan--riwayat-berkas)
  - [3. Debugger Multi-Bahasa Lengkap (DAP)](#3-debugger-multi-bahasa-lengkap-dap)
  - [4. Toko Agen dengan Verifikasi Integritas](#4-toko-agen-dengan-verifikasi-integritas)
  - [5. Nuansa Familiar VS Code & Tema Open VSX](#5-nuansa-familiar-vs-code--tema-open-vsx)
- [📥 Unduh & Instalasi](#-unduh--instalasi)
- [🔒 Privasi & Tanpa Telemetri](#-privasi--tanpa-telemetri)
- [⌨️ Pintasan Keyboard (Shortcuts)](#️-pintasan-keyboard-shortcuts)
- [🛠️ Build dari Kode Sumber](#️-build-dari-kode-sumber)
- [📁 Struktur Proyek](#-struktur-proyek)
- [📄 Lisensi & Merek Dagang](#-lisensi--merek-dagang)

---

## ✨ Mengapa Alexel Studio?

Banyak editor AI memperlakukan kecerdasan buatan sekadar sebagai alat *autocomplete* biasa atau sebagai kotak hitam (*black-box*) yang diam-diam mengubah berkas di belakang layar tanpa pengawasanmu.

**Alexel Studio dirancang dengan prinsip yang berbeda: *Kamu tetap memegang kendali penuh.***

1. **Persetujuan Manusia di Setiap Langkah (*Human-in-the-Loop*)**: Setiap perubahan kode, pembuatan berkas, dan perintah terminal yang diusulkan agen ditampilkan sebagai kartu diff visual yang jelas sebelum dieksekusi ke disk. Izinkan sekali, izinkan untuk satu sesi, atau tolak dengan memberi catatan revisi ke agen.
2. **Checkpoint Balik Waktu (*Time-Travel Snapshots*)**: Setiap pesan dalam percakapan berfungsi sebagai titik pemulihan. Ada kode yang keliru? Cukup satu klik untuk mengembalikan seluruh direktori kerjamu persis seperti sebelum pesan itu dikirim.
3. **Bebas Kunci Vendor (*No Vendor Lock-In*)**: Masuk langsung dengan akun resmi Claude Pro, ChatGPT Plus, atau Google Gemini milikmu sendiri. Tanpa mark-up biaya API, dan langsung menggunakan CLI agen resmi.
4. **Fondasi IDE Kelas Profesional**: Kamu tidak perlu mengorbankan utilitas utama developer. Alexel Studio menyertakan pseudo-terminal asli (`node-pty`), kecerdasan bahasa Language Server Protocol (LSP), dan debugging native Debug Adapter Protocol (DAP).
5. **Privasi Mutlak**: Tanpa pelacakan data, tanpa telemetri, dan tanpa server perantara pihak ketiga. Komunikasi berjalan langsung dari laptopmu ke penyedia AI resmi.

---

## 🤖 Agen AI yang Didukung

Alexel Studio menyediakan driver bawaan untuk agen pengodean mandiri terkemuka di industri, serta integrasi terbuka untuk agen apa pun yang mendukung standar **Agent Client Protocol (ACP)**:

| Agen | Penyedia | Akun yang Digunakan | Protokol Penghubung | Mode Perizinan |
|---|---|---|---|---|
| **Claude Code** | Anthropic | Claude Pro / Team / Max | Stream-JSON CLI resmi | Tanya dulu, Edit otomatis, Plan |
| **Codex** | OpenAI | ChatGPT Plus / API Key | `codex app-server` (JSON-RPC) | Tanya dulu, Otomatis di folder, Hanya baca |
| **Gemini** | Google | Akun Google / API Key | Agent Client Protocol (stdio) | Sesuai opsi agen |
| **Antigravity** | Google | Akun Google | `agy` CLI Stream-JSON | Edit otomatis, Plan, Ketat |
| **Agen ACP Lain** | Komunitas | Tergantung penyedia | Agent Client Protocol (stdio) | Dapat diatur di Pengaturan |

> 💡 **Penyebutan Konteks (`@`)**: Ketik `@problems`, `@terminal`, `@git-diff`, atau `@open-editors` dalam percakapan untuk secara otomatis menyuntikkan konteks editor langsung ke agen AI.

---

## 📸 Sorotan Fitur Utama

### 1. Tinjauan Diff Visual & Izin Bertahap
> Setiap usulan kode ditandai dengan sintaks CodeMirror 6 dan tampilan diff berdampingan atau gabungan. Terima sebagian atau minta agen memperbaikinya kembali.

<p align="center">
  <img src="docs/screenshots/agent.jpg" alt="Tinjauan Diff Agen AI" width="92%" style="border-radius: 10px;" />
</p>

---

### 2. Checkpoint Pesan & Riwayat Berkas
> Tidak perlu khawatir kehilangan kode yang sebelumnya sudah berjalan. Setiap simpanan berkas manual dan setiap pesan agen otomatis tercatat dalam riwayat lokal untuk perbandingan dan rollback instan.

---

### 3. Debugger Multi-Bahasa Lengkap (DAP)
> Integrasi protokol Debug Adapter Protocol penuh: pasang breakpoint, inspeksi variabel memori, pantau ekspresi (watch), call stack, dan debug console interaktif. Kompatibel dengan berkas `.vscode/launch.json`.

<p align="center">
  <img src="docs/screenshots/debug.jpg" alt="Debugger saat Breakpoint" width="92%" style="border-radius: 10px;" />
</p>

* **JavaScript / TypeScript**: Integrasi native `js-debug`
* **Python**: Adapter `debugpy`
* **C / C++ / Rust**: `lldb-dap`
* **Go**: Debugger Delve

---

### 4. Toko Agen dengan Verifikasi Integritas
> Pasang dan kelola perkakas AI langsung dari panel Ekstensi. Paket diunduh langsung dari sumber resmi (Open VSX, npm registry, GitHub) dan divalidasi dengan checksum kriptografis.

<p align="center">
  <img src="docs/screenshots/ext.jpg" alt="Panel Ekstensi Agen" width="92%" style="border-radius: 10px;" />
</p>

---

### 5. Nuansa Familiar VS Code & Tema Open VSX
> Langsung terasa nyaman bagi pengguna VS Code: command palette, pintasan keyboard yang dapat dikustomisasi, activity bar, serta ratusan tema Open VSX (dijalankan aman tanpa mengeksekusi kode JavaScript ekstensi).

<p align="center">
  <img src="docs/screenshots/light.jpg" alt="Tema Terang Alexel Studio" width="92%" style="border-radius: 10px;" />
</p>

---

## 📥 Unduh & Instalasi

Berkas installer biner resmi untuk semua sistem operasi tersedia di halaman [**Rilis Terbaru (Latest Releases)**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest):

| Sistem Operasi | Arsitektur CPU | Format Berkas | Tautan Unduhan |
|---|---|---|---|
| **macOS** | Apple Silicon (M1/M2/M3/M4) | `.dmg` | [**Alexel-Studio-mac-arm64.dmg**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **macOS** | Intel x64 | `.dmg` | [**Alexel-Studio-mac-x64.dmg**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Windows** | 64-bit (x64) | `.exe` Installer | [**Alexel-Studio-win-x64.exe**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Windows** | ARM64 | `.exe` Installer | [**Alexel-Studio-win-arm64.exe**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Linux** | Debian / Ubuntu | `.deb` | [**Alexel-Studio-linux-amd64.deb**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Linux** | Fedora / RHEL / openSUSE | `.rpm` | [**Alexel-Studio-linux-x86_64.rpm**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Linux (Universal)** | Semua Distro Linux | `.AppImage` | [**Alexel-Studio-linux-x86_64.AppImage**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |

### 💡 Catatan Keamanan Pembukaan Pertama
Karena installer merupakan build open-source komunitas:
* **macOS**: Saat pertama kali membuka, klik kanan `Alexel Studio.app` di folder Applications lalu pilih **Open**, kemudian konfirmasi.
* **Windows**: Jika muncul peringatan Microsoft Defender SmartScreen, klik **More info** lalu pilih **Run anyway**.

---

## 🔒 Privasi & Tanpa Telemetri

Kami memegang prinsip teguh bahwa perkakas kerja developer harus menghormati privasi seutuhnya:

* **Nol Pelacakan**: Tanpa metrik penggunaan, tanpa analitik di latar belakang, tanpa pustaka telemetri.
* **Tanpa Server Perantara**: Seluruh pertukaran data mengalir langsung dari laptopmu ke API resmi penyedia model AI melalui CLI resmi mereka.
* **Kredensial Aman**: Alexel Studio tidak pernah meminta, menyadap, atau menyimpan kata sandi maupun API key milikmu.

---

## ⌨️ Pintasan Keyboard (Shortcuts)

Pintasan secara dinamis menyesuaikan dengan sistem operasi (`⌘` di macOS, `Ctrl` di Windows & Linux):

| Aksi | macOS | Windows / Linux |
|---|---|---|
| **Command Palette** | `⌘ ⇧ P` | `Ctrl + Shift + P` |
| **Buka Cepat Berkas** | `⌘ P` | `Ctrl + P` |
| **Buka/Tutup Panel Agen AI** | `⌘ ⎋` | `Ctrl + Esc` |
| **Buka Terminal Terpadu** | `` ⌃ ` `` | `` Ctrl + ` `` |
| **Perbaikan Cepat / AI Fix** | `⌘ .` | `Ctrl + .` |
| **Mulai / Lanjutkan Debug** | `F5` | `F5` |
| **Pasang / Hapus Breakpoint** | `F9` | `F9` |
| **Step Over** | `F10` | `F10` |
| **Step Into** | `F11` | `F11` |

> Seluruh pintasan dapat disesuaikan di menu **Pengaturan → Pintasan Keyboard**.

---

## 🛠️ Build dari Kode Sumber

**Kebutuhan:** Node.js versi 22 atau lebih baru.

```bash
# 1. Klon repositori
git clone https://github.com/Nozella-Alexiee/alexel-studio.git
cd alexel-studio

# 2. Pasang dependensi
npm install

# 3. Jalankan aplikasi dalam mode pengembangan
npm run app

# 4. Jalankan pengujian unit
npm test
```

### Membuat Berkas Installer Distribusi:
* macOS: `npm run dist`
* Windows: `npm run dist:win`
* Linux: `npm run dist:linux`

---

## 📁 Struktur Proyek

```
alexel-studio/
├── electron/                 # Proses Utama (API Node.js & Electron)
│   ├── agents/               # Driver AI: claude, codex, gemini, antigravity, acp
│   ├── debug/                # Klien Debug Adapter Protocol (DAP) & adapters
│   ├── lsp/                  # Implementasi klien Language Server Protocol
│   └── terminal/             # Manajemen terminal semu pty
├── src/                      # Proses Renderer (Antarmuka React 19 + TypeScript)
│   ├── agents/               # Tampilan chat AI, kartu diff, checkpoint
│   ├── editor/               # Engine CodeMirror 6, pohon sintaks, keymap
│   ├── components/           # Activity bar, tab, panel, bilah status
│   └── state/                # State aplikasi, pengaturan, buffer terbuka
├── build/                    # Ikon aplikasi, metadata, dan aset packaging
├── docs/                     # Panduan arsitektur, spesifikasi protokol, tangkapan layar
└── site/                     # Kode sumber situs web unduhan resmi
```

---

## 📄 Lisensi & Merek Dagang

Didistribusikan di bawah lisensi resmi [**MIT License**](LICENSE).

*Pemberitahuan: Claude Code adalah merek dagang dari Anthropic PBC. ChatGPT dan Codex adalah merek dagang dari OpenAI. Gemini dan Antigravity adalah merek dagang dari Google LLC. Alexel Studio adalah proyek open-source independen dan tidak berafiliasi dengan, didukung oleh, atau disponsori oleh Anthropic, OpenAI, Google, atau Microsoft.*

<p align="center">
  Dibuat dengan sepenuh hati oleh <strong>Alex (Nozella-Alexiee)</strong> &amp; kontributor 🐧<br/>
  <em>Code side-by-side with autonomous AI agents.</em>
</p>
