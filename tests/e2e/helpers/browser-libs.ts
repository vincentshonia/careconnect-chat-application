import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Some Linux sandboxes (Nix-based images in particular) ship the shared
 * libraries Chromium needs inside the Nix store instead of the usual system
 * paths, so the Playwright-downloaded Chromium fails with
 * "error while loading shared libraries: ...".
 *
 * This helper is a no-op on any machine where /nix/store does not exist
 * (normal CI, normal developer laptops, `playwright install --with-deps`).
 * Where it does exist, it appends the store directories that provide the
 * sonames Chromium links against to LD_LIBRARY_PATH.
 */
const REQUIRED_SONAMES = [
  "libglib-2.0.so.0",
  "libgio-2.0.so.0",
  "libgobject-2.0.so.0",
  "libgmodule-2.0.so.0",
  "libnss3.so",
  "libnssutil3.so",
  "libsmime3.so",
  "libnspr4.so",
  "libatk-1.0.so.0",
  "libatk-bridge-2.0.so.0",
  "libatspi.so.0",
  "libcups.so.2",
  "libdbus-1.so.3",
  "libdrm.so.2",
  "libgbm.so.1",
  "libudev.so.1",
  "libexpat.so.1",
  "libxkbcommon.so.0",
  "libpango-1.0.so.0",
  "libpangocairo-1.0.so.0",
  "libcairo.so.2",
  "libasound.so.2",
  "libX11.so.6",
  "libXcomposite.so.1",
  "libXdamage.so.1",
  "libXext.so.6",
  "libXfixes.so.3",
  "libXrandr.so.2",
  "libXrender.so.1",
  "libXcursor.so.1",
  "libXi.so.6",
  "libXtst.so.6",
  "libxcb.so.1",
  "libxshmfence.so.1",
  "libfontconfig.so.1",
  "libfreetype.so.6",
  "libGL.so.1",
  "libEGL.so.1",
  "libpng16.so.16",
  "libharfbuzz.so.0",
];

export function ensureBrowserLibraryPath(): void {
  const store = "/nix/store";
  if (process.platform !== "linux" || !existsSync(store)) return;

  const existing = process.env["LD_LIBRARY_PATH"] ?? "";
  const known = new Set(existing.split(":").filter(Boolean));
  const found = new Set<string>();

  let entries: string[];
  try {
    entries = readdirSync(store);
  } catch {
    return;
  }

  const remaining = new Set(REQUIRED_SONAMES);
  for (const entry of entries) {
    if (remaining.size === 0) break;
    const libDir = path.join(store, entry, "lib");
    if (!existsSync(libDir)) continue;
    for (const soname of [...remaining]) {
      if (existsSync(path.join(libDir, soname))) {
        remaining.delete(soname);
        if (!known.has(libDir)) found.add(libDir);
      }
    }
  }

  if (found.size === 0) return;
  process.env["LD_LIBRARY_PATH"] = [existing, ...found].filter(Boolean).join(":");
}
