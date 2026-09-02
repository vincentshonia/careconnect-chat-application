import { expect, test } from "@playwright/test";

import {
  createE2EStaff,
  createE2ETenant,
  destroyE2ETenant,
  fixtureReader,
  type E2EStaff,
  type E2ETenant,
} from "./fixtures/e2e-fixtures";
import {
  escalateToHuman,
  openConversation,
  openWidget,
  signIn,
  waitForConversation,
} from "./helpers/flows";

/**
 * Resolution, satisfaction rating and the reporting surface it feeds.
 *
 *   visitor chats -> reaches a human -> agent claims, replies and resolves
 *   -> visitor rates the chat -> the rating is stored against the right
 *   organization/website/conversation -> an authorized reporting surface
 *   reflects this isolated tenant's data and nothing else.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let tenant: E2ETenant;
let admin: E2EStaff;

test.beforeAll(async () => {
  tenant = await createE2ETenant();
  admin = await createE2EStaff(tenant, {
    label: "reporting_admin",
    role: "administrator",
    departmentIds: [tenant.departmentId],
  });
});

test.afterAll(async () => {
  await destroyE2ETenant(tenant);
});

test("a resolved conversation is rated and shows up in authorized reporting", async ({ browser }) => {
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await openWidget(visitor, tenant);

  /* One real exchange first — only the transport is asserted, never AI wording. */
  const messageResponse = visitor.waitForResponse(
    (r) => r.url().includes("/api/public/chat/message") && r.request().method() === "POST",
    { timeout: 90_000 },
  );
  await visitor.getByLabel("Type your question").fill("What services do you offer for new members?");
  await visitor.getByLabel("Type your question").press("Enter");
  expect((await messageResponse).status(), "the visitor message must be accepted").toBeLessThan(400);

  const conversation = await escalateToHuman(visitor, tenant, {
    departmentName: tenant.departmentName,
    visitorName: `E2E CSAT ${tenant.runId}`,
  });
  expect(conversation.organization_id).toBe(tenant.organizationId);

  /* An administrator claims, replies and resolves through the real inbox. */
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  await openConversation(adminPage, conversation.reference, "Waiting");

  const claim = adminPage.getByRole("button", { name: /Claim conversation/ });
  if (await claim.count()) {
    await claim.click();
    await waitForConversation(tenant.websiteId, (c) => c.assigned_to === admin.userId, {
      conversationId: conversation.id,
      timeoutMs: 45_000,
    });
  }

  const reply = adminPage.getByPlaceholder(/Reply to the visitor/);
  await expect(reply).toBeVisible({ timeout: 30_000 });
  await reply.fill("Thanks for reaching out — here is how enrollment works.");
  await reply.press("Enter");
  await expect(
    adminPage.getByText("Thanks for reaching out — here is how enrollment works."),
  ).toBeVisible({ timeout: 30_000 });

  await adminPage.getByRole("button", { name: "Resolve", exact: true }).click();
  const resolved = await waitForConversation(tenant.websiteId, (c) => c.status === "resolved", {
    conversationId: conversation.id,
    timeoutMs: 45_000,
  });
  expect(resolved.resolved_by ?? admin.userId).toBe(admin.userId);

  /* The visitor rates the chat through the real prompt. */
  await expect(visitor.getByText("How helpful was this chat?")).toBeVisible({ timeout: 60_000 });
  const rateResponse = visitor.waitForResponse(
    (r) => r.url().includes("/api/public/chat/rate") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  await visitor.getByRole("button", { name: "Rate 5 out of 5" }).click();
  expect((await rateResponse).status(), "the rating must be accepted").toBeLessThan(400);
  await expect(visitor.getByText("Thank you — your feedback helps our team improve.")).toBeVisible();

  /* Stored against the right organization, website and conversation. */
  const db = fixtureReader();
  let rating: Record<string, unknown> | null = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !rating) {
    const { data } = await db
      .from("conversation_ratings")
      .select("conversation_id, organization_id, website_id, score")
      .eq("conversation_id", conversation.id)
      .maybeSingle();
    rating = (data as Record<string, unknown> | null) ?? null;
    if (!rating) await new Promise((r) => setTimeout(r, 500));
  }
  expect(rating, "the visitor rating must be persisted").toBeTruthy();
  expect(rating!["organization_id"]).toBe(tenant.organizationId);
  expect(rating!["website_id"]).toBe(tenant.websiteId);
  expect(rating!["score"]).toBe(5);

  /* The authorized reporting surface reflects this isolated tenant only. */
  await adminPage.goto("/reports", { waitUntil: "domcontentloaded" });
  await expect(adminPage.getByRole("heading", { name: /Reports/ })).toBeVisible({ timeout: 60_000 });
  await expect(adminPage.getByText("CSAT", { exact: true })).toBeVisible({ timeout: 60_000 });

  const { count: tenantConversations } = await db
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId);
  expect(tenantConversations, "the synthetic tenant holds exactly this chat").toBe(1);

  await adminContext.close();
  await visitorContext.close();
});
