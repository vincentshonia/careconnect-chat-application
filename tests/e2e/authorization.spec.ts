import { expect, test } from "@playwright/test";

import {
  createE2EDepartment,
  createE2EStaff,
  createE2ETenant,
  destroyE2ETenant,
  type E2EStaff,
  type E2ETenant,
} from "./fixtures/e2e-fixtures";
import { escalateToHuman, openWidget, signIn } from "./helpers/flows";

/**
 * Authorization negatives, proven in the browser.
 *
 *   - a Standard User outside the conversation's department cannot open it
 *   - a member of a different tenant cannot open it
 *   - hand-crafting the URL, or calling the data API straight from the page,
 *     does not get around the backend rules
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let tenant: E2ETenant;
let otherTenant: E2ETenant;
let outsideAgent: E2EStaff;
let conversationId: string;
let conversationReference: string;

test.beforeAll(async () => {
  tenant = await createE2ETenant();
  otherTenant = await createE2ETenant();
  const otherDepartment = await createE2EDepartment(tenant, { label: "billing_team" });
  outsideAgent = await createE2EStaff(tenant, {
    label: "outside_agent",
    role: "agent",
    departmentIds: [otherDepartment.id],
  });
});

test.afterAll(async () => {
  await destroyE2ETenant(tenant);
  await destroyE2ETenant(otherTenant);
});

test("a visitor conversation exists in the care team's queue", async ({ browser }) => {
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await openWidget(visitor, tenant);
  const conversation = await escalateToHuman(visitor, tenant, {
    departmentName: tenant.departmentName,
    visitorName: `E2E Authz ${tenant.runId}`,
  });
  conversationId = conversation.id;
  conversationReference = conversation.reference;
  expect(conversation.organization_id).toBe(tenant.organizationId);
  await visitorContext.close();
});

test("a Standard User in another department cannot open the conversation", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, outsideAgent);

  // Direct URL manipulation: the drill-down link for a chat they may not see.
  await page.goto(`/inbox?c=${conversationId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Select a conversation.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(conversationReference)).toHaveCount(0);

  // Searching every queue they can reach never surfaces it either.
  for (const tab of ["Waiting", "Department", "Active", "Closed"] as const) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.getByPlaceholder("Search reference or subject").fill(conversationReference);
    await expect(page.getByRole("button", { name: new RegExp(conversationReference) })).toHaveCount(0);
  }

  await context.close();
});

test("a member of a different tenant cannot open the conversation", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, otherTenant.agent);

  await page.goto(`/inbox?c=${conversationId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Select a conversation.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(conversationReference)).toHaveCount(0);

  await context.close();
});

test("calling the data API from the browser does not bypass backend authorization", async ({ browser }) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  expect(supabaseUrl, "SUPABASE_URL must be configured for this suite").toBeTruthy();
  expect(publishableKey, "SUPABASE_PUBLISHABLE_KEY must be configured for this suite").toBeTruthy();

  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, outsideAgent);

  // The page uses its own real session; the token is never read by the test.
  const result = await page.evaluate(
    async ({ url, key, id }) => {
      const entry = Object.keys(window.localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      const raw = entry ? window.localStorage.getItem(entry) : null;
      let token: string | null = null;
      try {
        const parsed = JSON.parse(raw ?? "null");
        token = parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
      } catch {
        token = null;
      }
      const headers: Record<string, string> = {
        apikey: key,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const read = await fetch(`${url}/rest/v1/conversations?id=eq.${id}&select=id,status`, { headers });
      const readBody = await read.text();

      const write = await fetch(`${url}/rest/v1/conversations?id=eq.${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "resolved" }),
      });
      const writeBody = await write.text();

      return {
        hadToken: Boolean(token),
        readStatus: read.status,
        readBody,
        writeStatus: write.status,
        writeBody,
      };
    },
    { url: supabaseUrl as string, key: publishableKey as string, id: conversationId },
  );

  expect(result.hadToken, "the page must be authenticated for this to be a real bypass attempt").toBe(true);
  // A read either errors or returns nothing — never the other department's chat.
  if (result.readStatus < 400) expect(JSON.parse(result.readBody)).toHaveLength(0);
  // A write must never take effect.
  if (result.writeStatus < 400) expect(JSON.parse(result.writeBody)).toHaveLength(0);

  await context.close();
});

test("the conversation is untouched after every bypass attempt", async () => {
  const { fixtureReader } = await import("./fixtures/e2e-fixtures");
  const { data } = await fixtureReader()
    .from("conversations")
    .select("id, status, assigned_to, organization_id")
    .eq("id", conversationId)
    .maybeSingle();
  expect(data).toBeTruthy();
  expect((data as any).organization_id).toBe(tenant.organizationId);
  expect((data as any).status).not.toBe("resolved");
  expect((data as any).assigned_to).toBeNull();
});
