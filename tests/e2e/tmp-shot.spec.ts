import { test, expect } from "@playwright/test";
import { createE2ETenant, destroyE2ETenant, type E2ETenant } from "./fixtures/e2e-fixtures";
let t: E2ETenant;
test.beforeAll(async () => { t = await createE2ETenant(); });
test.afterAll(async () => { await destroyE2ETenant(t); });
test("shot", async ({ page }) => {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(t.agent.email);
  await page.locator("#password").fill(t.agent.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/inbox/, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/tmp/browser/p5/light.png" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/browser/p5/dark.png" });
  expect(true).toBe(true);
});
