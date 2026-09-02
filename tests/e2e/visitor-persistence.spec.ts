import { expect, test } from "@playwright/test";

import {
  createE2ETenant,
  destroyE2ETenant,
  fixtureReader,
  type E2ETenant,
} from "./fixtures/e2e-fixtures";
import { escalateToHuman, openWidget } from "./helpers/flows";

/**
 * Visitor identity and chat session survive a reload.
 *
 * After the visitor introduces themselves through the hand-off form, coming
 * back to the page must greet them by name and reuse the same signed chat
 * session — a reload must not turn a returning visitor into a stranger.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let tenant: E2ETenant;

test.beforeAll(async () => {
  tenant = await createE2ETenant();
});

test.afterAll(async () => {
  await destroyE2ETenant(tenant);
});

test("visitor name and chat session persist across a reload", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await openWidget(page, tenant);
  const conversation = await escalateToHuman(page, tenant, {
    departmentName: tenant.departmentName,
    visitorName: `Riley Carter ${tenant.runId}`,
  });
  expect(conversation.organization_id).toBe(tenant.organizationId);

  const sessionBefore = await page.evaluate(
    (websiteId) => window.localStorage.getItem(`phg-widget-${websiteId}-session-v2`),
    tenant.websiteId,
  );
  expect(sessionBefore, "the widget must store a signed chat session").toBeTruthy();

  const db = fixtureReader();
  const { count: visitorsBefore } = await db
    .from("visitors")
    .select("*", { count: "exact", head: true })
    .eq("website_id", tenant.websiteId);
  expect(visitorsBefore ?? 0).toBeGreaterThan(0);

  /* Reload — the returning visitor. */
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open chat" }).click();

  await expect(
    page.getByText("Hi, Riley."),
    "the returning visitor must be greeted by name",
  ).toBeVisible({ timeout: 30_000 });

  const sessionAfter = await page.evaluate(
    (websiteId) => window.localStorage.getItem(`phg-widget-${websiteId}-session-v2`),
    tenant.websiteId,
  );
  expect(sessionAfter, "the signed chat session must be reused, not re-minted").toBe(sessionBefore);

  /* Navigating away and back keeps the same identity and session. */
  await page.goto(`/widget?w=${tenant.websiteId}&p=%2Fservices`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open chat" }).click();
  await expect(page.getByText("Hi, Riley.")).toBeVisible({ timeout: 30_000 });

  const { count: visitorsAfter } = await db
    .from("visitors")
    .select("*", { count: "exact", head: true })
    .eq("website_id", tenant.websiteId);
  expect(visitorsAfter, "a returning visitor must not create a second visitor record").toBe(
    visitorsBefore,
  );

  await context.close();
});
