// Ripgrep yang ikut di installer: versi dan SHA-256 di-pin (tidak ada unduhan tanpa cek hash).
// Dipakai ekstensi VS Code (Todo Tree dan sejenisnya) yang mencari `@vscode/ripgrep/bin/rg`.
// Hash mac dicocokkan dengan berkas .sha256 resmi rilis; hash Linux/Windows dihitung dari aset rilis
// resmi (berkas .sha256-nya tidak tersedia di rilis 15.2.0).
export const VERSION = "15.2.0";

/** key = `${os}-${arch}` seperti makro electron-builder (`${os}` = mac|win|linux). */
export const TARGETS = {
  "mac-arm64": { asset: "aarch64-apple-darwin.tar.gz", sha256: "3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4" },
  "mac-x64": { asset: "x86_64-apple-darwin.tar.gz", sha256: "af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1" },
  "linux-x64": { asset: "x86_64-unknown-linux-musl.tar.gz", sha256: "33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c" },
  "win-x64": { asset: "x86_64-pc-windows-msvc.zip", sha256: "71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5" },
  "win-arm64": { asset: "aarch64-pc-windows-msvc.zip", sha256: "e4abca10c3a64ebea742667dd7009449d49403db5460dd6873e389fa2945360f" },
};

export const urlFor = (t) => `https://github.com/BurntSushi/ripgrep/releases/download/${VERSION}/ripgrep-${VERSION}-${t.asset}`;
