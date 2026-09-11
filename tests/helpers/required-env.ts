/**
 * Release-critical suites must never silently skip — and must never damage real
 * tenant data.
 *
 * `requireTestEnv` replaces the former `describe.runIf(configured)` guards: when
 * a required credential is missing the suite file fails loudly at import time
 * instead of reporting a false PASS with zero executed assertions.
 *
 * This deployment runs on Lovable Cloud, where there is only one backend. The
 * integration suites therefore run against the primary project, but ONLY with
 * an explicit opt-in (`ALLOW_INTEGRATION_TESTS_ON_PRIMARY=true`) and behind the
 * synthetic-prefix guards below: every fixture row is created through
 * `syntheticName()`/`syntheticEmail()`, and every delete refuses any row whose
 * name or e-mail is not prefixed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Every artefact an integration fixture creates carries this prefix. */
export const TEST_PREFIX = "__test_";
/** The browser E2E fixtures use their own prefix; teardown accepts both. */
export const E2E_PREFIX = "__e2e_";
const SYNTHETIC_PREFIXES = [TEST_PREFIX, E2E_PREFIX] as const;

/** Organization that must never be touched by any test. */
export const PROTECTED_ORGANIZATION = "Pacific Health Group";

export function requireTestEnv(vars: Record<string, string | undefined>): true {
  const missing = Object.entries(vars)
    .filter(([, value]) => !value || value.trim() === "")
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Release-critical suite cannot run: missing required environment variable(s): ${missing.join(", ")}. ` +
        `These tests are never skipped — configure the environment and re-run.`,
    );
  }
  return true;
}

export type TestBackend = {
  url: string;
  serviceKey: string;
  anonKey: string;
};

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

/**
 * Resolves the primary backend for an integration suite. Requires an explicit,
 * deliberate opt-in: without `ALLOW_INTEGRATION_TESTS_ON_PRIMARY=true` the
 * suite fails fast at import time rather than writing to the live project.
 */
export function requireTestBackend(options: { publishable?: boolean } = {}): TestBackend {
  const allow = (process.env["ALLOW_INTEGRATION_TESTS_ON_PRIMARY"] ?? "").trim().toLowerCase();
  if (allow !== "true") {
    throw new Error(
      'Integration suites refuse to run: ALLOW_INTEGRATION_TESTS_ON_PRIMARY is not set to "true". ' +
        "This deployment has a single backend, so these suites create and delete synthetic " +
        `${TEST_PREFIX} tenants inside the live project. Set ALLOW_INTEGRATION_TESTS_ON_PRIMARY=true to acknowledge that.`,
    );
  }

  const url = normalize(process.env["SUPABASE_URL"]);
  const serviceKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
  const anonKey = (process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "").trim();

  const required: Record<string, string> = {
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  };
  if (options.publishable) required["SUPABASE_PUBLISHABLE_KEY"] = anonKey;
  requireTestEnv(required);

  return { url, serviceKey, anonKey };
}

/** Refuses to operate on anything that is not demonstrably synthetic. */
export function assertSynthetic(name: string | null | undefined, what: string): void {
  if (!name || !SYNTHETIC_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    throw new Error(
      `Test safety guard tripped: refusing to touch ${what} "${name}" — it is not prefixed with ${SYNTHETIC_PREFIXES.join(" or ")}.`,
    );
  }
}

type CountClient = SupabaseClient<any, "public", any>;

export type ProtectedBaseline = {
  organizationId: string;
  conversations: number;
  contacts: number;
  memberships: number;
};

async function countFor(db: CountClient, table: string, organizationId: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (error) throw new Error(`baseline count ${table}: ${error.message}`);
  return count ?? 0;
}

/**
 * Captures the live tenant's row counts before a suite runs. The suite asserts
 * the id was found, so a rename or a missing tenant is a loud failure rather
 * than a silently skipped safety check.
 */
export async function captureProtectedBaseline(db: CountClient): Promise<ProtectedBaseline> {
  const { data, error } = await db
    .from("organizations")
    .select("id")
    .eq("name", PROTECTED_ORGANIZATION)
    .maybeSingle();
  if (error) throw new Error(`protected baseline: ${error.message}`);
  const organizationId = (data as { id: string } | null)?.id;
  if (!organizationId) {
    throw new Error(`protected baseline: organization "${PROTECTED_ORGANIZATION}" was not found.`);
  }
  return {
    organizationId,
    conversations: await countFor(db, "conversations", organizationId),
    contacts: await countFor(db, "contacts", organizationId),
    memberships: await countFor(db, "organization_memberships", organizationId),
  };
}

/** Proves the suite left the live tenant completely untouched. */
export async function readProtectedBaseline(
  db: CountClient,
  baseline: ProtectedBaseline,
): Promise<Omit<ProtectedBaseline, "organizationId">> {
  return {
    conversations: await countFor(db, "conversations", baseline.organizationId),
    contacts: await countFor(db, "contacts", baseline.organizationId),
    memberships: await countFor(db, "organization_memberships", baseline.organizationId),
  };
}

/** Prefixed, collision-free name for any synthetic record. */
export function syntheticName(label: string, suffix: string): string {
  return `${TEST_PREFIX}${label}_${suffix}`;
}

/** Prefixed, collision-free e-mail for any synthetic account. */
export function syntheticEmail(label: string, suffix: string): string {
  return `${TEST_PREFIX}${label}_${suffix}@example.test`.toLowerCase();
}

type AnyClient = SupabaseClient<any, "public", any>;

/**
 * Tables carrying `organization_id`, children before parents so a teardown can
 * never trip a foreign key. Explicit on purpose: a new table must be added
 * consciously rather than silently leaking rows.
 */
const ORG_SCOPED_TABLES = [
  "qa_reviews",
  "conversation_ratings",
  "ai_responses",
  "internal_notes",
  "conversation_events",
  "messages",
  "intake_events",
  "intake_requests",
  "conversations",
  "visitors",
  "contacts",
  "notifications",
  "notification_preferences",
  "audit_logs",
  "knowledge_chunks",
  "knowledge_articles",
  "knowledge_categories",
  "faqs",
  "services",
  "response_templates",
  "routing_rules",
  "performance_targets",
  "business_hours",
  "holidays",
  "usage_counters",
  "organization_limits",
  "organization_invitations",
  "department_members",
  "departments",
  "websites",
  "user_roles",
  "organization_memberships",
  "profiles",
  "workspaces",
] as const;

/**
 * Deletes every row belonging to the given synthetic organizations. Each
 * organization's name is re-read from the database and checked against the
 * prefix before a single delete is issued.
 */
export async function purgeSyntheticOrganizations(
  db: AnyClient,
  organizationIds: (string | null | undefined)[],
): Promise<void> {
  for (const organizationId of organizationIds.filter(Boolean) as string[]) {
    const { data: org } = await db
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) continue;
    assertSynthetic((org as { name: string }).name, "organization");

    for (const table of ORG_SCOPED_TABLES) {
      await db.from(table).delete().eq("organization_id", organizationId);
    }
    await db.from("organizations").delete().eq("id", organizationId);
  }
}

/** Deletes synthetic auth accounts, refusing any address without the prefix. */
export async function purgeSyntheticUsers(
  db: AnyClient,
  users: { id: string; email: string }[],
): Promise<void> {
  for (const user of users) {
    if (!user?.id) continue;
    assertSynthetic(user.email, "account email");
    await db.from("profiles").delete().eq("id", user.id);
    await db.auth.admin.deleteUser(user.id);
  }
}

/**
 * Final sweep: removes any synthetic auth account that a suite created but did
 * not track for teardown (an early throw between account creation and the
 * fixture's own cleanup list). Only prefixed addresses are ever deleted, so a
 * real account can never be caught by this sweep.
 */
export async function purgeOrphanSyntheticUsers(db: AnyClient): Promise<number> {
  const orphans: { id: string; email: string }[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`orphan sweep failed: ${error.message}`);
    const users = data?.users ?? [];
    for (const user of users) {
      const email = user.email ?? "";
      if (SYNTHETIC_PREFIXES.some((prefix) => email.startsWith(prefix))) {
        orphans.push({ id: user.id, email });
      }
    }
    if (users.length < 200) break;
  }
  await purgeSyntheticUsers(db, orphans);
  return orphans.length;
}
