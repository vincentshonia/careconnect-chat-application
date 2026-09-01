import { defineConfig, devices } from "@playwright/test";

import { ensureBrowserLibraryPath } from "./tests/e2e/helpers/browser-libs";

// Make the downloaded Chromium loadable on Nix-based sandboxes; no-op elsewhere.
ensureBrowserLibraryPath();


/**
 * CareConnect browser E2E harness.
 *
 * Runs against the real production build (nitro worker output) served by
 * `bun run preview:e2e` — never against the Vite dev server, so release
 * verification never depends on HMR or development-only behaviour.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 4173);
const BASE_URL = process.env["E2E_BASE_URL"] ?? `http://127.0.0.1:${PORT}`;

/**
 * Sandboxes preinstall Chromium under a pinned build number that can differ
 * from the one this Playwright version expects (and they may omit the
 * headless-shell build entirely). Prefer an installed full Chromium when the
 * expected download is absent; elsewhere this resolves to undefined and
 * Playwright uses its own browser as normal.
 */
function resolveChromium(): string | undefined {
  const root = "/opt/ms-playwright";
  if (!existsSync(root)) return undefined;
  const build = readdirSync(root)
    .filter((entry) => /^chromium-\d+$/.test(entry))
    .sort()
    .pop();
  if (!build) return undefined;
  const binary = path.join(root, build, "chrome-linux", "chrome");
  return existsSync(binary) ? binary : undefined;
}

const CHROMIUM_PATH = resolveChromium();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env["E2E_BASE_URL"]
    ? undefined
    : {
        command: `bun run preview:e2e -- --port ${PORT}`,
        url: `${BASE_URL}/auth`,
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 180_000,
      },
});
