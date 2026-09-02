import { expect, test } from "@playwright/test";

import {
  createE2EStaff,
  createE2ETenant,
  destroyE2ETenant,
  fixtureReader,
  type E2EStaff,
  type E2ETenant,
} from "./fixtures/e2e-fixtures";
import { escalateToHuman, openConversation, openWidget, signIn, waitForConversation } from "./helpers/flows";

/**
 * Claim exclusivity in real browsers.
 *
 * Two eligible agents of the same department race for the same waiting
 * conversation. Exactly one may end up owning it, and the loser must not be
 * able to answer as the owner.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let tenant: E2ETenant;
let secondAgent: E2EStaff;

test.beforeAll(async () => {
  tenant = await createE2ETenant();
  secondAgent = await createE2EStaff(tenant, {
    label: "rival_agent",
    role: "agent",
    departmentIds: [tenant.departmentId],
  });
});

test.afterAll(async () => {
  await destroyE2ETenant(tenant);
});

test("two agents racing for one conversation produce exactly one owner", async ({ browser }) => {
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await openWidget(visitor, tenant);
  const conversation = await escalateToHuman(visitor, tenant, {
    departmentName: tenant.departmentName,
    visitorName: `E2E Claim ${tenant.runId}`,
  });
  expect(conversation.assigned_to).toBeNull();

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const agentA = await contextA.newPage();
  const agentB = await contextB.newPage();

  await Promise.all([signIn(agentA, tenant.agent), signIn(agentB, secondAgent)]);
  await Promise.all([
    openConversation(agentA, conversation.reference, "Waiting"),
    openConversation(agentB, conversation.reference, "Waiting"),
  ]);

  const claimA = agentA.getByRole("button", { name: /Claim conversation/ });
  const claimB = agentB.getByRole("button", { name: /Claim conversation/ });
  await expect(claimA).toBeVisible();
  await expect(claimB).toBeVisible();

  // Both agents commit at the same moment.
  await Promise.all([claimA.click(), claimB.click()]);

  const claimed = await waitForConversation(
    tenant.websiteId,
    (c) => c.assigned_to !== null,
    { conversationId: conversation.id, timeoutMs: 45_000 },
  );
  expect([tenant.agent.userId, secondAgent.userId]).toContain(claimed.assigned_to);

  // The ownership never flips afterwards, and it is a single agent.
  const db = fixtureReader();
  const { data: rows } = await db
    .from("conversations")
    .select("assigned_to")
    .eq("id", conversation.id);
  expect(rows).toHaveLength(1);
  expect((rows as any)[0].assigned_to).toBe(claimed.assigned_to);

  const winnerIsA = claimed.assigned_to === tenant.agent.userId;
  const winnerPage = winnerIsA ? agentA : agentB;
  const loserPage = winnerIsA ? agentB : agentA;

  await expect(winnerPage.getByText("Assigned to you").first()).toBeVisible({ timeout: 30_000 });

  // The loser must lose both the claim affordance and the ability to reply.
  await loserPage.reload({ waitUntil: "domcontentloaded" });
  await openConversation(loserPage, conversation.reference, "Department");
  await expect(loserPage.getByText(/Assigned to /).first()).toBeVisible({ timeout: 30_000 });
  await expect(loserPage.getByRole("button", { name: /Claim conversation/ })).toHaveCount(0);
  await expect(
    loserPage.getByPlaceholder(/Reply to the visitor/),
    "an agent who lost the race must not be able to reply as the owner",
  ).toHaveCount(0);

  // No agent message can exist from the losing agent.
  const loserId = winnerIsA ? secondAgent.userId : tenant.agent.userId;
  const { data: loserMessages } = await db
    .from("messages")
    .select("id")
    .eq("conversation_id", conversation.id)
    .eq("sender_user_id", loserId);
  expect(loserMessages ?? []).toHaveLength(0);

  await contextA.close();
  await contextB.close();
  await visitorContext.close();
});
