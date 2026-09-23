import { expect, test } from "@playwright/test";

import { createE2ETenant, destroyE2ETenant, type E2ETenant } from "./fixtures/e2e-fixtures";

/**
 * The embedded panel must hug its content.
 *
 * Home is a short view: the frame should be well under the 720px cap, with no
 * dead space between the last card and the tab bar. The chat thread is a
 * scrolling view and always asks for the full cap so it never jitters as
 * messages arrive.
 */

test.describe.configure({ mode: "serial" });

let tenant: E2ETenant;

test.beforeAll(async () => {
  tenant = await createE2ETenant();
});

test.afterAll(async () => {
  await destroyE2ETenant(tenant);
});

test("the embedded panel is content-sized on Home and full height in Chat", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const host = `<!doctype html><html><body style="margin:0;height:2000px">
    <script src="/api/public/widget.js" data-website-id="${tenant.websiteId}"></script>
  </body></html>`;

  await page.route("**/__widget-host", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: host }),
  );
  await page.goto("/__widget-host", { waitUntil: "domcontentloaded" });

  const frame = page.locator("iframe[title='Customer support chat']");
  await expect(frame).toBeVisible({ timeout: 30_000 });
  const widget = page.frameLocator("iframe[title='Customer support chat']");

  await widget.getByRole("button", { name: "Open chat" }).click({ timeout: 30_000 });
  await expect(widget.getByRole("button", { name: "Chat", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const heightOf = async () => (await frame.boundingBox({ timeout: 10_000 }))?.height ?? Number.NaN;

  await expect
    .poll(heightOf, { timeout: 20_000, message: "Home must be content-sized" })
    .toBeLessThan(620);
  const homeHeight = await heightOf();
  expect(homeHeight).toBeGreaterThanOrEqual(400);

  await widget.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(widget.getByLabel("Type your question")).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(heightOf, { timeout: 20_000, message: "the chat thread must use the full panel" })
    .toBeGreaterThanOrEqual(700);
});
