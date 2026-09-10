/**
 * Release-critical suites must never silently skip — and must never touch the
 * production project.
 *
 * `requireTestEnv` replaces the former `describe.runIf(configured)` guards: when
 * a required credential is missing the suite file fails loudly at import time
 * instead of reporting a false PASS with zero executed assertions.
 *
 * `requireTestBackend` goes further: the integration suites resolve their
 * connection ONLY from `TEST_SUPABASE_*`, and refuse to run when those point at
 * the production project. There is no fallback to `SUPABASE_URL`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Every artefact an integration fixture creates carries this prefix. */
export const TEST_PREFIX = "__test_";

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
 * Resolves the dedicated test project. Fails fast — never degrades to
 * production — when the variables are absent or point at the live project.
 */
export function requireTestBackend(options: { publishable?: boolean } = {}): TestBackend {
  const url = normalize(process.env["TEST_SUPABASE_URL"]);
  const serviceKey = (process.env["TEST_SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
  const anonKey = (process.env["TEST_SUPABASE_PUBLISHABLE_KEY"] ?? "").trim();

  const required: Record<string, string> = {
    TEST_SUPABASE_URL: url,
    TEST_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  };
  if (options.publishable) required["TEST_SUPABASE_PUBLISHABLE_KEY"] = anonKey;
  requireTestEnv(required);

  const productionUrl = normalize(process.env["SUPABASE_URL"]);
  if (productionUrl && url.toLowerCase() === productionUrl.toLowerCase()) {
    throw new Error(
      "Integration suites refuse to run: TEST_SUPABASE_URL is the same project as SUPABASE_URL. " +
        "These suites create and delete tenants and must never be pointed at production.",
    );
  }

  return { url, serviceKey, anonKey };
}

/** Refuses to operate on anything that is not demonstrably synthetic. */
export function assertSynthetic(name: string | null | undefined, what: string): void {
  if (!name || !name.startsWith(TEST_PREFIX)) {
    throw new Error(
      `Test safety guard tripped: refusing to touch ${what} "${name}" — it is not prefixed with ${TEST_PREFIX}.`,
    );
  }
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
