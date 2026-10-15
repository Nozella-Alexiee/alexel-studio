# Alexel Studio

Editor kode gratis dan open source untuk macOS, Windows, dan Linux. Kerja bareng agen AI
pilihanmu (Claude Code, Codex, Gemini, Antigravity, atau agen apa pun yang mendukung Agent
Client Protocol) di samping terminal, server bahasa, dan debugger. Setiap perubahan dari agen
menunggu persetujuanmu.

[English](README.md) · [Unduh](#unduh) · [Agen](docs/AGENTS.md) · [Berkontribusi](CONTRIBUTING.md)

![Agen mengusulkan perubahan, diff menunggu persetujuan](docs/screenshots/agent.jpg)

## Fitur

- **Agen AI seperti ekstensi.** Pasang Claude Code, Codex, atau Gemini dari panel Ekstensi.
  Paket resminya diunduh, checksum-nya diperiksa, dan kamu masuk dengan akunmu sendiri.
  Antigravity dan agen ACP lain terdeteksi otomatis.
- **Kamu menyetujui setiap perubahan.** Edit dan perintah shell muncul sebagai kartu berisi diff
  atau perintah yang persis. Izinkan sekali, izinkan selama sesi, atau tolak dan beri tahu agen
  apa yang sebaiknya dilakukan. Pilih model, effort, dan mode izin per percakapan; lanjutkan
  percakapan lama dari riwayat.
- **Debugger.** Breakpoint, variabel, watch, call stack, dan Debug Console untuk
  JavaScript/TypeScript (js-debug), Python (debugpy), C/C++/Rust (lldb-dap), dan Go (Delve).
  Membaca `.vscode/launch.json`.
- **Terasa seperti VS Code.** Activity bar, palette perintah (`⌘⇧P` / `Ctrl+Shift+P`), menu
  lengkap, Source Control, Outline, Output, Masalah, shortcut yang bisa diubah, dan `settings.json`.
- **Terminal sungguhan.** zsh, bash, atau PowerShell dengan program layar penuh. Smart Run
  membaca `package.json`, `Cargo.toml`, `go.mod`, dan lainnya.
- **Server bahasa.** TypeScript dan JavaScript langsung jalan. Python, Rust, Go, C/C++, PHP,
  dan CSS jalan setelah server-nya dipasang.
- **Tema dari Open VSX.** Tema warna, tema ikon berkas, snippet, dan grammar. Kode ekstensi
  tidak pernah dijalankan.
- **Riwayat berkas.** Setiap simpan tercatat; bandingkan dan pulihkan versi mana pun.

## Unduh

Ambil installer terbaru di halaman [Releases](../../releases/latest):

| Sistem | Berkas |
|---|---|
| macOS, Apple Silicon | `Alexel-Studio-mac-arm64.dmg` |
| macOS, Intel | `Alexel-Studio-mac-x64.dmg` |
| Windows x64 / ARM64 | `Alexel-Studio-win-x64.exe` / `Alexel-Studio-win-arm64.exe` |
| Debian, Ubuntu | `Alexel-Studio-linux-amd64.deb` |
| Fedora, openSUSE | `Alexel-Studio-linux-x86_64.rpm` |
| Linux apa saja | `Alexel-Studio-linux-x86_64.AppImage` |

Build belum ditandatangani dengan sertifikat berbayar:

- **macOS:** pertama kali, klik kanan aplikasinya di Applications lalu pilih **Open**.
- **Windows:** bila SmartScreen memperingatkan penerbit tidak dikenal, pilih **More info**, lalu **Run anyway**.

## Agen AI

Setiap agen masuk dengan akunnya sendiri; Alexel Studio tidak pernah meminta atau menyimpan kredensial.

| Agen | Akun | Cara terhubung |
|---|---|---|
| Claude Code | Claude Pro atau Max | protokol stream-json dari CLI resmi |
| Codex | ChatGPT atau API key OpenAI | `codex app-server`, protokol ekstensi Codex di VS Code |
| Gemini | akun Google atau API key Gemini | Agent Client Protocol (Gemini CLI) |
| Antigravity | akun Google | CLI `agy` mode stream-json |
| Agen lain | tergantung agennya | Agent Client Protocol; atur perintahnya di Pengaturan |

Detailnya ada di [docs/AGENTS.md](docs/AGENTS.md).

## Privasi

Tidak ada telemetri. Alexel Studio hanya terhubung ke internet saat kamu:

- mengirim pesan ke agen (ke penyedia agen itu, lewat CLI-nya sendiri),
- memasang agen, debugger, atau tema (Open VSX, registry npm, atau GitHub, dengan checksum diperiksa),
- mengecek pembaruan (satu permintaan ke GitHub Releases per hari; bisa dimatikan di Pengaturan).

## Build dari kode sumber

Butuh Node.js 22 atau lebih baru.

```bash
npm install
```

```bash
npm run app
```

```bash
npm test
```

Installer: `npm run dist` (macOS), `npm run dist:win`, `npm run dist:linux`. Rilis dibuat oleh
GitHub Actions saat tag `v*` di-push (lihat `.github/workflows/release.yml`).

## Lisensi

[MIT](LICENSE). Claude, Codex, Gemini, dan Antigravity adalah merek dagang pemiliknya masing-masing.
Alexel Studio tidak berafiliasi dengan Anthropic, OpenAI, Google, atau Microsoft.
