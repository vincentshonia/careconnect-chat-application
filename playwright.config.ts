import { defineConfig, devices } from "@playwright/test";

/**
 * CareConnect browser E2E harness.
 *
 * Runs against the real production build (nitro worker output) served by
 * `bun run preview:e2e` — never against the Vite dev server, so release
 * verification never depends on HMR or development-only behaviour.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 4173);
const BASE_URL = process.env["E2E_BASE_URL"] ?? `http://127.0.0.1:${PORT}`;

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
