import { expect, test } from "@playwright/test";

import { createE2ETenant, destroyE2ETenant, type E2ETenant } from "./fixtures/e2e-fixtures";
import { escalateToHuman } from "./helpers/flows";

/**
 * A visitor returning after their old chat was removed must still be able to
 * ask for a person. The widget remembers a conversation id between visits; when
 * that id is gone server-side the request has to recover silently instead of
 * failing with "Conversation not found".
 */

test.describe.configure({ mode: "serial" });

let tenant: E2ETenant;

test.beforeAll(async () => {
  tenant = await createE2ETenant();
});

test.afterAll(async () => {
  await destroyE2ETenant(tenant);
});

test("a stale remembered conversation does not block the live-agent form", async ({ page }) => {
  const storageKey = `phg-widget-${tenant.websiteId}`;
  const deadId = "00000000-0000-4000-8000-0000000000ff";

  await page.addInitScript(
    ([key, id]) => {
      window.localStorage.setItem(
        `${key}-conv-v1`,
        JSON.stringify({
          conversationId: id,
          messages: [{ role: "visitor", text: "hello", at: new Date().toISOString() }],
          updatedAt: Date.now(),
        }),
      );
    },
    [storageKey, deadId] as const,
  );

  await page.goto(`/widget?w=${tenant.websiteId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Talk to an agent" })).toBeVisible({
    timeout: 30_000,
  });

  const conversation = await escalateToHuman(page, tenant, {
    departmentName: tenant.departmentName,
    visitorName: `${tenant.runId} Stale Visitor`,
  });

  expect(conversation.id, "a fresh conversation must replace the dead id").not.toBe(deadId);
  expect(conversation.escalation_requested).toBe(true);
  await expect(page.getByText("Conversation not found")).toHaveCount(0);
});
