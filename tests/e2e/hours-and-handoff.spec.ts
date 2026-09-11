import { expect, test } from "@playwright/test";

import {
  createE2ETenant,
  destroyE2ETenant,
  fixtureReader,
  type E2ETenant,
} from "./fixtures/e2e-fixtures";
import { escalateToHuman, openWidget, waitForConversation } from "./helpers/flows";

/**
 * Queue truthfulness and opening hours, proved through the real widget:
 *
 *   a) an AI answer the assistant is not confident about stays with the
 *      assistant — it does NOT join the human waiting queue
 *   b) asking for a representative does put the conversation in that queue
 *   c) a holiday dated today closes the organization and the widget says so
 */

test.describe.configure({ mode: "serial" });
// Widget configuration is cached server-side for a minute, so the closure test
// needs more room than the default per-test budget.
test.setTimeout(240_000);

let tenant: E2ETenant;

const OFFLINE_MESSAGE = "Our care team is away for the holiday. Leave a message and we'll reply.";

test.beforeAll(async () => {
  tenant = await createE2ETenant();
  try {
    const db = fixtureReader();
    const { error } = await db
      .from("websites")
      .update({ offline_message: OFFLINE_MESSAGE })
      .eq("id", tenant.websiteId);
    if (error) throw new Error(`fixture: offline message update failed — ${error.message}`);
  } catch (error) {
    await destroyE2ETenant(tenant).catch(() => undefined);
    throw error;
  }
});

test.afterAll(async () => {
  await destroyE2ETenant(tenant);
});

test("a low-confidence assistant answer does not join the waiting queue", async ({ page }) => {
  await openWidget(page, tenant);

  // The synthetic tenant has no knowledge base at all, so this question cannot
  // be answered from approved sources — exactly the low-confidence case.
  const answered = page.waitForResponse(
    (r) => r.url().includes("/api/public/chat/message") && r.request().method() === "POST",
    { timeout: 90_000 },
  );
  const question = "Which orthopaedic surgeons are in network for a knee replacement in 2031?";
  await page.getByLabel("Type your question").fill(question);
  await page.getByLabel("Type your question").press("Enter");
  expect((await answered).status()).toBeLessThan(400);

  const conversation = await waitForConversation(tenant.websiteId, (c) => Boolean(c.id));

  // Give any (incorrect) escalation a chance to land before asserting absence.
  await page.waitForTimeout(3000);
  const db = fixtureReader();
  const { data: row } = await db
    .from("conversations")
    .select("status, escalation_requested, assigned_to, requested_agent_at")
    .eq("id", conversation.id)
    .single();

  expect(row?.escalation_requested, "an unsure answer must not request a human").toBe(false);
  expect(
    ["waiting", "escalated"].includes(String(row?.status)),
    `an unsure answer must not queue the chat (status was ${row?.status})`,
  ).toBe(false);
  expect(row?.requested_agent_at).toBeNull();
});

test("asking for a representative puts the conversation in the waiting queue", async ({ page }) => {
  await openWidget(page, tenant);

  const escalated = await escalateToHuman(page, tenant, {
    departmentName: tenant.departmentName,
    visitorName: `E2E Visitor ${tenant.runId}`,
  });

  expect(escalated.escalation_requested).toBe(true);
  expect(escalated.assigned_to, "a queued hand-off stays unassigned until claimed").toBeNull();
  expect(["waiting", "escalated"]).toContain(escalated.status);
});

test("a holiday dated today shows the offline message in the widget", async ({ page }) => {
  const db = fixtureReader();
  // The organization's own clock decides which day "today" is.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { error } = await db.from("holidays").insert({
    organization_id: tenant.organizationId,
    name: `${tenant.runId} holiday`,
    holiday_date: today,
  });
  expect(error, `holiday insert failed: ${error?.message}`).toBeNull();

  // Widget configuration is cached briefly, so poll until the closure is served.
  await expect(async () => {
    await page.goto(`/widget?w=${tenant.websiteId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open chat" }).click();
    await expect(page.getByText(OFFLINE_MESSAGE).first()).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 150_000 });
});
