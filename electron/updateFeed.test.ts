import { describe, expect, it } from "vitest";
import { feedName, parseFeed, pickInstaller, safeName } from "./updateFeed";

const MAC = `version: 0.6.0
files:
  - url: Alexel-Studio-mac-x64.zip
    sha512: XIf48AnQUz1bBpSGAqATij/pd8C+Mtksye62Hik+YBy7idqTgrRCYuAqWSVwEPfmYWeJqp5J4kaWcD11Z1xg8g==
    size: 130031057
  - url: Alexel-Studio-mac-arm64.zip
    sha512: +dft2Ova4OTkRm0wCpwlUZ6XLXZLE4p1QTw7XZlPg3dMq4YF6bO/oxP+0dsLM+MwAGEHsgqnEglaNKPahlueKg==
    size: 126439370
  - url: Alexel-Studio-mac-arm64.dmg
    sha512: BqbNmRMXlm5Z/OjIoK4uS6y56b7WNT7wlh9RqgdjqSvGHMpkBN0CjP/JTcqvVixybZxKfDsN34nrR8oAGfAAOw==
    size: 126669037
path: Alexel-Studio-mac-x64.zip
sha512: XIf48AnQUz1bBpSGAqATij/pd8C+Mtksye62Hik+YBy7idqTgrRCYuAqWSVwEPfmYWeJqp5J4kaWcD11Z1xg8g==
releaseDate: '2026-10-23T03:19:38.325Z'
`;
const WIN = `version: 0.6.0
files:
  - url: Alexel-Studio-win-x64.exe
    sha512: EjXX2obu127ZU0yZelcYACUd9MMpFkUYBE5W9TDjxoAzWMFJIm1AC1aJ0hFD0W7rQb/bBbQztCWlSMKCvjO6Sg==
    size: 113341130
  - url: Alexel-Studio-win-arm64.exe
    sha512: fselyB8qn56i3WiAFVoAMpLfEh24N5b601ctcGBKB7ECJBaQnLo5M9cEShfAIwULc2bZZEJP5SNvRYktul1Yaw==
    size: 107293706
path: Alexel-Studio-win-x64.exe
sha512: EjXX2obu127ZU0yZelcYACUd9MMpFkUYBE5W9TDjxoAzWMFJIm1AC1aJ0hFD0W7rQb/bBbQztCWlSMKCvjO6Sg==
releaseDate: '2026-10-23T03:20:17.642Z'
`;
const LINUX = `version: 0.6.0
files:
  - url: Alexel-Studio-linux-x86_64.AppImage
    sha512: aaa+bbb/ccc==
    size: 99
path: Alexel-Studio-linux-x86_64.AppImage
sha512: aaa+bbb/ccc==
`;

describe("feed pembaruan", () => {
  it("membaca versi dan semua berkas (sha512 base64 dengan + / =)", () => {
    const f = parseFeed(MAC);
    expect(f.version).toBe("0.6.0");
    expect(f.files.map((x) => x.url)).toEqual(["Alexel-Studio-mac-x64.zip", "Alexel-Studio-mac-arm64.zip", "Alexel-Studio-mac-arm64.dmg"]);
    expect(f.files[1]).toEqual({ url: "Alexel-Studio-mac-arm64.zip", sha512: "+dft2Ova4OTkRm0wCpwlUZ6XLXZLE4p1QTw7XZlPg3dMq4YF6bO/oxP+0dsLM+MwAGEHsgqnEglaNKPahlueKg==", size: 126439370 });
  });

  it("feed kosong atau rusak = tanpa berkas", () => {
    expect(parseFeed("")).toEqual({ version: "", files: [] });
    expect(parseFeed("version: 1.0.0\nfiles:\n  - nonsense\n").files).toEqual([]);
  });

  it("memilih pemasang per OS dan arsitektur", () => {
    expect(pickInstaller(parseFeed(WIN), { platform: "win32", arch: "arm64", appImage: false })).toMatchObject({ kind: "nsis", file: { url: "Alexel-Studio-win-arm64.exe" } });
    expect(pickInstaller(parseFeed(WIN), { platform: "win32", arch: "x64", appImage: false })?.file.url).toBe("Alexel-Studio-win-x64.exe");
    // macOS memakai zip (bukan dmg) sesuai arsitektur.
    expect(pickInstaller(parseFeed(MAC), { platform: "darwin", arch: "arm64", appImage: false })).toMatchObject({ kind: "mac-zip", file: { url: "Alexel-Studio-mac-arm64.zip" } });
    expect(pickInstaller(parseFeed(MAC), { platform: "darwin", arch: "x64", appImage: false })?.file.url).toBe("Alexel-Studio-mac-x64.zip");
    expect(pickInstaller(parseFeed(LINUX), { platform: "linux", arch: "x64", appImage: true })).toMatchObject({ kind: "appimage" });
  });

  it("Linux deb/rpm (bukan AppImage) dan arsitektur tak tersedia = manual", () => {
    expect(pickInstaller(parseFeed(LINUX), { platform: "linux", arch: "x64", appImage: false })).toBeNull();
    expect(pickInstaller(parseFeed(LINUX), { platform: "linux", arch: "arm64", appImage: true })).toBeNull();
    expect(pickInstaller(parseFeed(WIN), { platform: "win32", arch: "ia32", appImage: false })).toBeNull();
  });

  it("nama feed per OS dan nama berkas aman", () => {
    expect(feedName("win32")).toBe("latest.yml");
    expect(feedName("darwin")).toBe("latest-mac.yml");
    expect(feedName("linux")).toBe("latest-linux.yml");
    expect(safeName("Alexel-Studio-win-x64.exe")).toBe("Alexel-Studio-win-x64.exe");
    expect(safeName("../evil.exe")).toBeNull();
    expect(safeName("a/b.exe")).toBeNull();
  });
});
