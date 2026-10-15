# Panduan cepat Nozel Code 🐧

## 1. Pilih desain

Buka **Pengaturan** (`⌘,`) → **Desain**, atau tekan `Ctrl+⌘T` untuk berganti ke desain berikutnya.

| Grup | Desain | Karakter |
|---|---|---|
| Pinguin | **Antartika** | gelap biru es, Nozi ber-kupluk mengintip di sidebar |
| Pinguin | **Tuxedo** | hitam-putih kontras tinggi, rail ikon ala Control |
| Pinguin | **Kawanan** | terang ceria, satu panel fokus, kawanan pinguin di dashboard |
| Klasik | Aurora Glass / Zen / Control | tiga desain awal |

Nozi di status bar berganti ekspresi: santai, sibuk (Claude bekerja / proses berjalan), error, sukses.

## 2. Buka project

`⌘O` atau seret folder ke jendela. Dashboard project muncul saat belum ada tab terbuka.
`⌘P` untuk lompat ke berkas, `⌘K` untuk semua perintah.

## 3. Autocomplete & error asli (LSP)

TypeScript/JavaScript langsung jalan (server dibundel). Untuk bahasa lain, pasang server-nya,
lalu cek di **Pengaturan → Server bahasa**:

| Bahasa | Server |
|---|---|
| Python | `npm i -g pyright` |
| PHP | `npm i -g intelephense` |
| Rust | `rustup component add rust-analyzer` |
| Go | `go install golang.org/x/tools/gopls@latest` |
| C/C++ | `clangd` (Xcode Command Line Tools) |
| CSS | `npm i -g vscode-langservers-extracted` |

⌘klik untuk ke definisi; error muncul di panel **Masalah** (`⌘⇧M`).

## 4. Ekstensi

`⌘⇧X` → cari di Open VSX → **Pasang**.

- **Tema warna** (Dracula, One Dark Pro, Catppuccin, ...): klik **Pakai**. Warnanya menimpa desain aktif, tata letak dan Nozi tetap. Lepas lewat tombol yang sama atau perintah *Lepas tema ekstensi*.
- **Tema ikon** (Material Icon Theme): klik **Pakai ikon**. Ikon berganti di Explorer, tab, Git, dan pencarian.
- **Bahasa** (Svelte, Astro, Prisma, ...): langsung aktif saat berkasnya dibuka. Grammar pendukung (JS/TS/CSS) yang dibutuhkan terpasang otomatis dan bertanda *pendukung*.
- **Snippet** (ES7+ React, ...): muncul di autocomplete.

Ekstensi yang butuh API VS Code (GitLens, Copilot, debugger) tidak didukung. Kode JavaScript ekstensi tidak pernah dijalankan.

## 5. Fitur khas Nozel

| Fitur | Cara |
|---|---|
| Smart Run | `⌘R` / `F5`, atau tombol ▶ di toolbar |
| Time-travel per berkas | `⌘⇧H` |
| Port & proses | panel bawah → **Port** |
| Papan TODO | sidebar / panel bawah → **TODO** |
| Snapshot kode jadi gambar | `⌘⇧2` |
| Claude jelaskan error | tombol Claude di panel Masalah / terminal |
| Mode hemat baterai | otomatis di baterai; atur di Pengaturan |
