/**
 * Shared browser flows for the CareConnect E2E specs.
 *
 * Every helper drives the real product surface: the public widget, the real
 * sign-in form and the real inbox. No test-only endpoints, no direct writes to
 * `assigned_to`, no RLS bypass. Service-role access is confined to fixtures and
 * to post-condition assertions.
 */
import { expect, type Page } from "@playwright/test";

import { fixtureReader, type E2ETenant } from "../fixtures/e2e-fixtures";

export type ConversationRow = {
  id: string;
  reference: string;
  status: string;
  assigned_to: string | null;
  department_id: string | null;
  escalation_requested: boolean;
  organization_id: string;
  website_id: string;
  resolved_by: string | null;
};

const CONVERSATION_COLUMNS =
  "id, reference, status, assigned_to, department_id, escalation_requested, organization_id, website_id, resolved_by, created_at";

/** Polls the database until a conversation of this website matches, or fails. */
export async function waitForConversation(
  websiteId: string,
  predicate: (row: ConversationRow) => boolean,
  options: { timeoutMs?: number; conversationId?: string } = {},
): Promise<ConversationRow> {
  const db = fixtureReader();
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let last: unknown = null;
  while (Date.now() < deadline) {
    let query = db.from("conversations").select(CONVERSATION_COLUMNS).eq("website_id", websiteId);
    if (options.conversationId) query = query.eq("id", options.conversationId);
    const { data } = await query.order("created_at", { ascending: false }).limit(1);
    const row = (data?.[0] ?? null) as ConversationRow | null;
    last = row;
    if (row && predicate(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for conversation state. Last seen: ${JSON.stringify(last)}`);
}

/** Opens the widget page for the synthetic website on its Chat tab. */
export async function openWidget(page: Page, tenant: E2ETenant): Promise<void> {
  await page.goto(`/widget?w=${tenant.websiteId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByLabel("Type your question")).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to an agent" })).toBeVisible();
}


/**
 * Visitor hand-off: opens the "Talk to an agent" form, fills it and submits.
 * Returns the conversation the backend created.
 */
export async function escalateToHuman(
  page: Page,
  tenant: E2ETenant,
  options: { departmentName: string; visitorName: string },
): Promise<ConversationRow> {
  await page.getByRole("button", { name: "Talk to an agent" }).click();
  await expect(page.getByText("Speak with a representative")).toBeVisible();

  await page
    .getByLabel("Which team can help you?")
    .selectOption({ label: options.departmentName });
  await page.getByLabel("Full name").fill(options.visitorName);
  await page.getByLabel("Phone number").fill("5555550142");
  await page.getByLabel("Email address").fill(`${tenant.runId}.visitor@example.test`);
  await page.getByLabel("Reason for contacting").fill("I would like to speak with a representative.");
  await page.getByRole("checkbox").check();

  const escalateResponse = page.waitForResponse(
    (r) => r.url().includes("/api/public/chat/escalate") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "Submit" }).click();
  expect((await escalateResponse).status(), "the hand-off request must be accepted").toBeLessThan(400);

  return waitForConversation(tenant.websiteId, (c) => c.escalation_requested === true);
}

/** Signs a synthetic staff member in through the real sign-in form. */
export async function signIn(
  page: Page,
  credentials: { email: string; password: string },
): Promise<void> {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(credentials.email);
  await page.locator("#password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/inbox/, { timeout: 60_000 });
}

/** Opens a specific conversation in the inbox by its reference. */
export async function openConversation(
  page: Page,
  reference: string,
  tab?: "Waiting" | "Mine" | "Department" | "Active" | "Closed" | "All conversations",
): Promise<void> {
  if (tab) await page.getByRole("button", { name: tab, exact: true }).click();
  const search = page.getByPlaceholder("Search reference or subject");
  const listItem = page.getByRole("button", { name: new RegExp(reference) });
  /* The queue query can still be in flight when the tab mounts; re-issuing the
     search refetches it, so poll instead of betting on a single attempt. */
  await expect(async () => {
    await search.fill("");
    await search.fill(reference);
    await expect(listItem).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 90_000 });
  await listItem.click();
}

