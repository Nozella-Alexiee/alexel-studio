# Alexel Studio: integrasi Claude Code & cara mengukur performa

## 1. Claude Code lewat CLI resmi (bukan API key)

- **Pakai langganan yang sudah ada.** Pengguna Claude Pro/Team/Max memakai CLI resmi `claude`,
  tanpa biaya token per panggilan.
- **Tidak ada API key di aplikasi.** Login ditangani CLI (`claude login`). Nozel tidak pernah
  meminta, menyimpan, atau mengirim kredensial.
- **Pencarian CLI**: PATH dari login shell, `~/.claude/local`, `~/.local/bin`, lalu CLI yang
  dibundel aplikasi desktop Claude.
- **Cara menjalankan**: `claude -p --output-format stream-json --verbose` dengan prompt lewat
  stdin (tidak muncul di daftar proses). Percakapan lanjutan memakai `--resume`.
- **Selalu terlihat dulu**: panel Claude menampilkan isi yang akan dikirim (berkas aktif atau
  seleksi saja) sebelum terkirim. Tidak ada pengiriman berkas di latar belakang.

Menghubungkan:

```bash
npm install -g @anthropic-ai/claude-code
```

```bash
claude login
```

Setelah itu buka Nozel; status bar menampilkan **Claude** dan panel Claude berstatus *terhubung*.

---

## 2. Cara mengukur performa

### Hasil ukur Alexel Studio 0.2.0 (Electron 44, MacBook Air M1, arm64)

| Ukuran | Hasil |
|---|---|
| `.dmg` | 123 MB |
| `Alexel Studio.app` | 283 MB |
| RAM, project terbuka (4 proses Electron) | ~420 MB |
| RAM + language server TypeScript (seluruh pohon proses) | ~490 MB |

Angka RAM naik saat tsserver menganalisis project besar atau saat beberapa language server
aktif bersamaan. Sebagai pembanding, versi Tauri sebelumnya ~40 MB, tetapi tanpa LSP dan
ekstensi.

### RAM (RSS seluruh pohon proses)

```bash
pgrep -f "Alexel Studio.app" | xargs ps -o rss= -p | awk '{s+=$1} END {printf "%.0f MB\n", s/1024}'
```

Untuk VS Code, ganti pola dengan `"Visual Studio Code.app"`. Bandingkan di mesin yang sama
dan dengan project yang sama terbuka.

Di dalam aplikasi, status bar menampilkan RAM proses Electron (dari `app.getAppMetrics()`);
language server tidak termasuk di angka itu.

### CPU saat idle

```bash
top -l 5 -stats pid,command,cpu | grep -i nozel
```

### Ukuran paket

```bash
du -sh "release/mac-arm64/Alexel Studio.app" release/*.dmg
```

---

## 3. Rencana

- [ ] Pratinjau diff berdampingan sebelum perubahan dari Claude disimpan.
- [ ] Membaca konfigurasi `.claude/` per project secara otomatis.
