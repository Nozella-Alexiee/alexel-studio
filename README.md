# Alexel Studio 🐧

> Editor kode desktop buatan sendiri ala VS Code, dengan identitas pinguin (maskot **Nozi**),
> 6 desain yang bisa diganti kapan saja, autocomplete beneran lewat LSP, ekstensi dari Open VSX,
> dan Claude Code bawaan lewat CLI resmi (langganan Pro/Max, tanpa API key).

---

## Isi singkat

| | |
|---|---|
| **Platform** | Electron 44 (macOS arm64; Windows lewat `npm run dist:win`) |
| **Editor** | CodeMirror 6, state per tab (undo, kursor, fold tetap saat pindah tab), split editor |
| **Desain** | Klasik: Aurora Glass, Zen, Control · Pinguin: Antartika, Tuxedo, Kawanan |
| **Autocomplete** | LSP: TypeScript/JavaScript (dibundel), Python, PHP, Rust, Go, C/C++, CSS bila server terpasang |
| **Ekstensi** | Open VSX: tema warna, tema ikon berkas, snippet, grammar TextMate. Kode JS ekstensi tidak dijalankan |
| **Terminal** | PTY asli (node-pty): `vim`, `htop`, `npm run dev` jalan normal |
| **Claude** | Claude Code CLI resmi, isi yang dikirim ditampilkan dulu sebelum terkirim |

### Angka jujur (diukur di MacBook Air M1)

| | Alexel Studio 0.2.0 (Electron) | Catatan |
|---|---|---|
| Ukuran `.dmg` | 123 MB | arm64 |
| Ukuran app | 283 MB | sebagian besar framework Electron |
| RAM, project terbuka | ~420 MB | 4 proses Electron |
| RAM + language server TS | ~490 MB | naik lagi saat tsserver menganalisis project besar |

Versi Tauri lama jauh lebih kecil (~40 MB RAM), tapi tidak punya LSP, ekstensi, dan tampilan
yang konsisten lintas OS. Pilihan pindah ke Electron diambil dengan sadar: **fitur nomor satu**.

---

## Fitur

**Desain & Nozi**
- 6 desain, masing-masing dengan tata letak sendiri (bukan hanya warna). Ganti di Pengaturan atau `Ctrl+⌘T`.
- Desain pinguin punya maskot Nozi: ekspresi di status bar (santai, sibuk, error, sukses), tips, dan empty state.
- Tema warna dari ekstensi bisa ditimpa di atas desain mana saja. Tata letak dan Nozi tetap.

**Editor**
- Quick Open fuzzy (`⌘P`), palette perintah (`⌘K` / `⌘⇧P`), simbol di berkas (`⌘⇧O`), pergi ke baris (`Ctrl+G`).
- Split editor (`⌘\`), minimap, git gutter, word wrap, preview Markdown/HTML terisolasi.
- Autocomplete, hover, go-to-definition (⌘klik), dan error asli dari language server di panel Masalah.

**Fitur yang tidak ada di VS Code / VSCodium**
- **Mode hemat baterai**: otomatis aktif saat di baterai, memperlambat proses latar.
- **Time-travel per berkas** (`⌘⇧H`): setiap simpan tercatat, bisa dibandingkan dan dipulihkan.
- **Port & proses manager**: lihat siapa yang memakai port, hentikan dengan satu klik.
- **Claude jelaskan error**: kirim error dari terminal/Masalah ke Claude.
- **Smart Run** (`⌘R` / `F5`): deteksi otomatis cara menjalankan berkas/project (npm, cargo, python, go, php, make, docker compose...).
- **Papan TODO project**: semua `TODO`/`FIXME` dalam satu papan.
- **Snapshot kode jadi gambar** (`⌘⇧2`).
- **Dashboard project**: ringkasan bahasa, git, TODO, dan skrip.

**Git**: status, stage/unstage, commit, push/pull, branch, diff per berkas, penanda konflik.

**Ekstensi** (`⌘⇧X`)
- Cari & pasang dari [Open VSX](https://open-vsx.org). Checksum sha256 diverifikasi.
- Yang didukung: tema warna, tema ikon berkas (mis. Material Icon Theme), snippet, dan grammar
  TextMate (mis. Svelte, Astro, Prisma). Grammar bawaan VS Code yang dibutuhkan (JS/TS/CSS/HTML)
  dipasang otomatis dari namespace resmi `vscode`.
- **Tidak didukung**: ekstensi yang memakai API VS Code (GitLens, Copilot, debugger, dsb.) dan tema ikon berbasis font.

---

## Keamanan

- `contextIsolation`, `sandbox`, tanpa `nodeIntegration`. Renderer hanya bisa memanggil command lewat satu pintu IPC dengan whitelist.
- CSP ketat; navigasi dan popup diblok, tautan dibuka di browser.
- Preview HTML disajikan dari protokol terpisah (`nozelpreview://`), hanya bisa membaca folder project.
- Ikon ekstensi disajikan dari `nozelext://`, hanya svg/png di dalam folder ekstensi.
- Hapus berkas = pindah ke Trash. Isi yang dikirim ke Claude selalu ditampilkan dulu.

---

## Pengembangan

Kebutuhan: macOS 12+, Node.js 20+. Opsional: [Claude Code CLI](https://docs.claude.com/en/docs/claude-code), language server tambahan (`pyright`, `intelephense`, `rust-analyzer`, `gopls`, `clangd`).

```bash
npm install
```

```bash
npm run app
```

```bash
npm test
```

```bash
npm run dist
```

| Skrip | Fungsi |
|---|---|
| `npm run app` | Electron mode dev (Vite + rebuild main process otomatis) |
| `npm run dev` | Mode demo di browser (backend tiruan, untuk mengutak-atik UI) |
| `npm test` | Vitest: frontend + main process |
| `npm run build` | Typecheck + build renderer & main process |
| `npm run dist` | Paket `.dmg` di folder `release/` |

Struktur:

```
electron/        main process: fs, git, pty, search, lsp, extensions, claude, watcher, preview
src/app/         aksi, perintah, persistensi sesi
src/editor/      CodeMirror: dokumen, bahasa, LSP, minimap, git gutter, snippet
src/extensions/  tema warna, tema ikon, grammar TextMate, registry ekstensi
src/shells/      tata letak per desain (Aurora, Zen, Control)
src/panels/      Explorer, Git, Cari, TODO, Ekstensi, Terminal, Dashboard, Pengaturan
src/design/      daftar desain + token warna (src/styles/tokens.css)
```
