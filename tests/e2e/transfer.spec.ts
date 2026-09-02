import { expect, test } from "@playwright/test";

import {
  createE2EDepartment,
  createE2EStaff,
  createE2ETenant,
  destroyE2ETenant,
  fixtureReader,
  type E2EStaff,
  type E2ETenant,
} from "./fixtures/e2e-fixtures";
import { escalateToHuman, openConversation, openWidget, signIn, waitForConversation } from "./helpers/flows";

/**
 * Transfer / reassignment, proven in a real browser against the real backend.
 *
 *   claimed conversation -> transferred to another department
 *     -> previous owner loses ownership
 *     -> receiving department's agent can claim it
 *     -> a Standard User is never offered the supervisory controls
 *     -> an administrator's availability override is recorded in the audit log
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let tenant: E2ETenant;
let secondDepartment: { id: string; name: string };
let supervisor: E2EStaff;
let receivingAgent: E2EStaff;
let busyAgent: E2EStaff;

test.beforeAll(async () => {
  tenant = await createE2ETenant();
  secondDepartment = await createE2EDepartment(tenant, { label: "enrollment_team" });
  supervisor = await createE2EStaff(tenant, {
    label: "supervisor",
    role: "administrator",
    departmentIds: [tenant.departmentId, secondDepartment.id],
  });
  receivingAgent = await createE2EStaff(tenant, {
    label: "receiving_agent",
    role: "agent",
    departmentIds: [secondDepartment.id],
  });
  // Deliberately unavailable: only an explicit, audited override can assign to them.
  busyAgent = await createE2EStaff(tenant, {
    label: "offline_agent",
    role: "agent",
    departmentIds: [tenant.departmentId],
    presence: "offline",
  });
});

test.afterAll(async () => {
  await destroyE2ETenant(tenant);
});

test("a claimed conversation transfers to another department and changes hands", async ({ browser }) => {
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await openWidget(visitor, tenant);
  const conversation = await escalateToHuman(visitor, tenant, {
    departmentName: tenant.departmentName,
    visitorName: `E2E Transfer ${tenant.runId}`,
  });
  expect(conversation.department_id).toBe(tenant.departmentId);

  /* The first-line agent claims it. */
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signIn(owner, tenant.agent);
  await openConversation(owner, conversation.reference, "Waiting");
  await owner.getByRole("button", { name: /Claim conversation/ }).click();
  await expect(owner.getByText("Assigned to you").first()).toBeVisible({ timeout: 30_000 });
  await waitForConversation(tenant.websiteId, (c) => c.assigned_to === tenant.agent.userId, {
    conversationId: conversation.id,
  });

  /* A Standard User is never offered transfer or reassignment. */
  await expect(
    owner.getByLabel("Transfer to department"),
    "a Standard User must not be offered the transfer control",
  ).toHaveCount(0);
  await expect(
    owner.getByRole("button", { name: "Reassign" }),
    "a Standard User must not be offered the reassign control",
  ).toHaveCount(0);

  /* The supervisor performs the real transfer through the real control. */
  const supervisorContext = await browser.newContext();
  const supervisorPage = await supervisorContext.newPage();
  await signIn(supervisorPage, supervisor);
  await openConversation(supervisorPage, conversation.reference, "All conversations");
  await supervisorPage
    .getByLabel("Transfer to department")
    .selectOption({ label: secondDepartment.name });

  const transferred = await waitForConversation(
    tenant.websiteId,
    (c) => c.department_id === secondDepartment.id,
    { conversationId: conversation.id, timeoutMs: 45_000 },
  );
  expect(transferred.assigned_to, "the previous owner must lose ownership on transfer").toBeNull();
  expect(transferred.escalation_requested).toBe(true);

  /* The receiving department's agent can now take it. */
  const receiverContext = await browser.newContext();
  const receiver = await receiverContext.newPage();
  await signIn(receiver, receivingAgent);
  await openConversation(receiver, transferred.reference, "Waiting");
  await receiver.getByRole("button", { name: /Claim conversation/ }).click();
  await expect(receiver.getByText("Assigned to you").first()).toBeVisible({ timeout: 30_000 });
  const reclaimed = await waitForConversation(
    tenant.websiteId,
    (c) => c.assigned_to === receivingAgent.userId,
    { conversationId: conversation.id },
  );
  expect(reclaimed.assigned_to).toBe(receivingAgent.userId);

  /* The transfer is audited. */
  const db = fixtureReader();
  const { data: transferAudit } = await db
    .from("audit_logs")
    .select("action, actor_id, record_id")
    .eq("organization_id", tenant.organizationId)
    .eq("action", "conversation.transferred");
  expect(transferAudit?.some((row: any) => row.record_id === conversation.id)).toBe(true);

  await receiverContext.close();
  await supervisorContext.close();
  await ownerContext.close();
  await visitorContext.close();
});

test("an availability override requires an administrator and is audited", async ({ browser }) => {
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await openWidget(visitor, tenant);
  const conversation = await escalateToHuman(visitor, tenant, {
    departmentName: tenant.departmentName,
    visitorName: `E2E Override ${tenant.runId}`,
  });

  const supervisorContext = await browser.newContext();
  const supervisorPage = await supervisorContext.newPage();
  await signIn(supervisorPage, supervisor);
  await openConversation(supervisorPage, conversation.reference, "All conversations");

  /* The supervisor takes it first, so the unavailable teammate is provably not
     the current owner when the override is exercised. */
  const claim = supervisorPage.getByRole("button", { name: /Claim conversation/ });
  if (await claim.count()) await claim.click();
  await waitForConversation(tenant.websiteId, (c) => c.assigned_to === supervisor.userId, {
    conversationId: conversation.id,
    timeoutMs: 45_000,
  });

  await supervisorPage.getByRole("button", { name: "Reassign" }).click();
  const dialog = supervisorPage.getByRole("dialog");
  await expect(dialog.getByText(busyAgent.fullName)).toBeVisible({ timeout: 30_000 });

  const offlineCard = dialog.locator("div.rounded-lg").filter({ hasText: busyAgent.fullName }).first();
  // An unavailable teammate is never directly assignable — only overridable.
  await expect(offlineCard.getByText("Current owner")).toHaveCount(0);
  await expect(offlineCard.getByRole("button", { name: "Assign" })).toHaveCount(0);

  await offlineCard.getByRole("button", { name: "Override…" }).click();
  await dialog.getByPlaceholder("Reason for overriding availability").fill("E2E escalation coverage");
  await dialog.getByRole("button", { name: "Confirm override" }).click();


  const overridden = await waitForConversation(
    tenant.websiteId,
    (c) => c.assigned_to === busyAgent.userId,
    { conversationId: conversation.id, timeoutMs: 45_000 },
  );
  expect(overridden.assigned_to).toBe(busyAgent.userId);

  const db = fixtureReader();
  const { data: overrideAudit } = await db
    .from("audit_logs")
    .select("action, actor_id, record_id, new_value")
    .eq("organization_id", tenant.organizationId)
    .eq("action", "conversation.transfer_override");
  const { data: allAudit } = await db
    .from("audit_logs")
    .select("action, new_value, record_id")
    .eq("organization_id", tenant.organizationId);
  const entry = (overrideAudit ?? []).find((row: any) => row.record_id === conversation.id);
  expect(entry, `an override must be audited — saw ${JSON.stringify(allAudit)}`).toBeTruthy();
  expect((entry as any).actor_id).toBe(supervisor.userId);

  await supervisorContext.close();
  await visitorContext.close();
});
