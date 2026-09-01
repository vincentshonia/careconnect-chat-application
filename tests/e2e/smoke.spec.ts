import { expect, test, type ConsoleMessage } from "@playwright/test";

import { requireBrowserEnv } from "./helpers/env";

/**
 * Segment 1 infrastructure smoke test: proves Chromium launches, reaches the
 * built CareConnect application, and that a real route renders without a fatal
 * page crash. No workflow coverage and no database fixtures.
 */
test.describe("E2E harness smoke", () => {
  test("browser preflight resolves a base URL", () => {
    const { baseURL } = requireBrowserEnv();
    expect(baseURL).toMatch(/^https?:\/\//);
  });

  test("the sign-in route loads in a real browser without crashing", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message: ConsoleMessage) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const response = await page.goto("/auth", { waitUntil: "domcontentloaded" });
    expect(response?.status(), "sign-in route must return a successful status").toBeLessThan(400);

    // The app shell actually rendered (hydrated React tree, not an error page).
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("load");
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length, "sign-in page must render visible content").toBeGreaterThan(0);
    expect(bodyText).not.toContain("This page didn't load");
    await expect(page.locator("input[type=email]").first()).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(" | ")}`).toHaveLength(0);
  });

  test("the unauthenticated root redirects into the auth flow", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/auth/);
  });
});
