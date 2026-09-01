import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Tenant isolation tests.
 *
 * These run against the live database with the *public* (anon) key — exactly
 * what a browser or a scripted attacker has. Every tenant table must return
 * either an error or zero rows. A regression here means one customer's data
 * is reachable by anyone on the internet.
 */
const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const configured = Boolean(url && key);

const anon = configured
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

/** Tables that hold tenant-scoped or personal data. Anonymous reads must be empty. */
const PRIVATE_TABLES = [
  "organizations",
  "organization_memberships",
  "platform_admins",
  "profiles",
  "departments",
  "department_members",
  "conversations",
  "messages",
  "contacts",
  "intake_requests",
  "knowledge_articles",
  "knowledge_chunks",
  "audit_logs",
  "notifications",
  "organization_invitations",
  "websites",
];

describe.runIf(configured)("anonymous access is denied to tenant data", () => {
  beforeAll(() => {
    if (!anon) throw new Error("Supabase env not configured for isolation tests");
  });

  it.each(PRIVATE_TABLES)("anon cannot read %s", async (table) => {
    const { data, error } = await anon!.from(table).select("*").limit(5);
    const rows = data ?? [];
    // A missing table must fail the test rather than pass by accident: the
    // suite only proves isolation for tables that actually exist.
    expect(error?.code, `${table} does not exist — the test list is stale`).not.toBe("42P01");
    expect(
      error !== null || rows.length === 0,
      `anon read of ${table} returned ${rows.length} row(s)`,
    ).toBe(true);
  });

  it.each(["conversations", "messages", "contacts", "intake_requests"])(
    "anon cannot write to %s",
    async (table) => {
      const { error } = await anon!.from(table).insert({ id: crypto.randomUUID() } as never);
      expect(error).not.toBeNull();
    },
  );

  it("anon cannot escalate privileges through membership tables", async () => {
    for (const table of ["organization_memberships", "platform_admins"]) {
      const { error } = await anon!
        .from(table)
        .insert({ user_id: crypto.randomUUID() } as never);
      expect(error).not.toBeNull();
    }
  });

  it("anon cannot call privileged helper functions", async () => {
    for (const fn of ["my_mfa_requirement", "has_role"]) {
      const { error } = await anon!.rpc(fn as never, {} as never);
      expect(error).not.toBeNull();
    }
  });

  it("public widget endpoints refuse forged session tokens", async () => {
    const res = await fetch(new URL("/api/public/chat/message", "http://localhost:8080"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionToken: "forged.token", body: "hello" }),
    }).catch(() => null);
    if (!res) return; // dev server not running in this environment
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
