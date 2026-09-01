import { expect, test, type Page } from "@playwright/test";

import {
  createE2ETenant,
  destroyE2ETenant,
  fixtureReader,
  type E2ETenant,
} from "./fixtures/e2e-fixtures";

/**
 * Segment 2 — the CareConnect golden path.
 *
 * One complete real-world workflow, driven entirely through the real UI and
 * the real backend, inside a disposable synthetic tenant:
 *
 *   visitor opens the widget -> asks a question -> requests a human
 *     -> conversation waits in the queue
 *     -> agent signs in, claims it, replies
 *     -> visitor receives the agent reply
 *     -> agent resolves the conversation
 *
 * AI answer *content* is never asserted (it is non-deterministic); only the
 * transport and the state machine are.
 */

test.describe.configure({ mode: "serial" });

let tenant: E2ETenant;

test.beforeAll(async () => {
  tenant = await createE2ETenant();
});

test.afterAll(async () => {
  // Cleanup verifies itself and throws when anything survives, which fails the run.
  await destroyE2ETenant(tenant);
});

/** Waits for the conversation the widget created for this synthetic website. */
async function waitForConversation(predicate: (row: any) => boolean, timeoutMs = 30_000) {
  const db = fixtureReader();
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    const { data } = await db
      .from("conversations")
      .select(
        "id, reference, status, assigned_to, department_id, escalation_requested, organization_id, website_id, resolved_by",
      )
      .eq("website_id", tenant.websiteId)
      .order("created_at", { ascending: false })
      .limit(1);
    last = data?.[0] ?? null;
    if (last && predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for conversation state. Last seen: ${JSON.stringify(last)}`);
}

async function openWidget(page: Page) {
  await page.goto(`/widget?w=${tenant.websiteId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByLabel("Type your question")).toBeVisible();
}

test("visitor → AI chat → human hand-off → agent claim, reply and resolution", async ({ browser }) => {
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();

  /* ---------------------------------------------------------------- *
   * 1. Visitor opens the widget and sends a question
   * ---------------------------------------------------------------- */
  await openWidget(visitor);

  const question = "What services do you offer for new members?";
  const messageResponse = visitor.waitForResponse(
    (r) => r.url().includes("/api/public/chat/message") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  await visitor.getByLabel("Type your question").fill(question);
  await visitor.getByLabel("Type your question").press("Enter");

  // Transport only: the answer text itself is AI-generated and not asserted.
  expect((await messageResponse).status(), "the visitor message must be accepted").toBeLessThan(400);
  await expect(visitor.getByText(question)).toBeVisible();

  const created = await waitForConversation((c) => Boolean(c.id));
  expect(created.organization_id).toBe(tenant.organizationId);

  /* ---------------------------------------------------------------- *
   * 2. Visitor asks for a human
   * ---------------------------------------------------------------- */
  await visitor.getByRole("button", { name: "Talk to an agent" }).click();
  await expect(visitor.getByText("Speak with a representative")).toBeVisible();

  await visitor.getByLabel("Which team can help you?").selectOption({ label: tenant.departmentName });
  await visitor.getByLabel("Full name").fill(`E2E Visitor ${tenant.runId}`);
  await visitor.getByLabel("Phone number").fill("5555550142");
  await visitor.getByLabel("Email address").fill(`${tenant.runId}.visitor@example.test`);
  await visitor.getByLabel("Reason for contacting").fill("I would like to speak with a representative.");
  await visitor.getByRole("checkbox").check();

  const escalateResponse = visitor.waitForResponse(
    (r) => r.url().includes("/api/public/chat/escalate") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  await visitor.getByRole("button", { name: "Submit" }).click();
  expect((await escalateResponse).status(), "the hand-off request must be accepted").toBeLessThan(400);

  const waiting = await waitForConversation((c) => c.escalation_requested === true);
  expect(waiting.department_id, "the visitor's chosen department must be honoured").toBe(tenant.departmentId);
  expect(waiting.assigned_to, "a shared-queue hand-off must stay unassigned until claimed").toBeNull();
  expect(["waiting", "escalated", "open"]).toContain(waiting.status);

  /* ---------------------------------------------------------------- *
   * 3. The agent signs in
   * ---------------------------------------------------------------- */
  const agentContext = await browser.newContext();
  const agent = await agentContext.newPage();
  await agent.goto("/auth", { waitUntil: "domcontentloaded" });
  await agent.locator("#email").fill(tenant.agent.email);
  await agent.locator("#password").fill(tenant.agent.password);
  await agent.getByRole("button", { name: "Sign in" }).click();
  await agent.waitForURL(/\/inbox/, { timeout: 60_000 });

  /* ---------------------------------------------------------------- *
   * 4. The agent finds and claims the waiting conversation
   * ---------------------------------------------------------------- */
  await agent.getByPlaceholder("Search reference or subject").fill(waiting.reference);
  const listItem = agent.getByRole("button", { name: new RegExp(waiting.reference) });
  await expect(listItem, "the waiting conversation must be visible to the agent").toBeVisible({
    timeout: 30_000,
  });
  await listItem.click();

  await agent.getByRole("button", { name: /Claim conversation/ }).click();
  await expect(agent.getByText("Assigned to you")).toBeVisible({ timeout: 30_000 });

  const claimed = await waitForConversation((c) => c.assigned_to === tenant.agent.userId);
  expect(claimed.assigned_to).toBe(tenant.agent.userId);

  /* ---------------------------------------------------------------- *
   * 5. The agent replies and the visitor receives it
   * ---------------------------------------------------------------- */
  const replyText = `Hello, this is your CareConnect representative (${tenant.runId}).`;
  await agent.getByPlaceholder(/Reply to the visitor/).fill(replyText);
  await agent.getByRole("button", { name: /Send reply/ }).click();
  await expect(agent.getByText(replyText).first()).toBeVisible({ timeout: 30_000 });

  // The visitor's widget polls the public endpoint — no page reload allowed.
  await expect(visitor.getByText(replyText)).toBeVisible({ timeout: 60_000 });

  const db = fixtureReader();
  const { data: agentMessages } = await db
    .from("messages")
    .select("id, sender_type, body, sender_user_id")
    .eq("conversation_id", claimed.id)
    .eq("sender_type", "agent");
  expect(agentMessages?.some((m: any) => m.body === replyText)).toBe(true);

  /* ---------------------------------------------------------------- *
   * 6. The agent resolves the conversation
   * ---------------------------------------------------------------- */
  await agent.getByRole("button", { name: "Resolve", exact: true }).click();
  const resolved = await waitForConversation((c) => c.status === "resolved");
  expect(resolved.resolved_by ?? tenant.agent.userId).toBe(tenant.agent.userId);

  await agentContext.close();
  await visitorContext.close();
});
