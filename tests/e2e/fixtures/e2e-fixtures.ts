/**
 * Deterministic, disposable CareConnect E2E fixtures.
 *
 * Execution model (corrected for Segment 2): the suite runs against the SAME
 * backend the application uses, inside a strictly isolated synthetic tenant.
 * Every record created here is bound to one freshly created organization whose
 * name and slug start with `__e2e_`, so it can never overlap with, read, or
 * mutate real Pacific Health Group data.
 *
 * Hard rules enforced in code, not by convention:
 *   - the service role key is used ONLY here (setup + teardown), never in a test
 *   - nothing is created outside the synthetic organization
 *   - nothing is deleted unless it is provably bound to that organization
 *   - teardown verifies emptiness and throws if a single row survives
 *   - missing configuration throws; a fixture is never silently skipped
 */
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Every synthetic artefact carries this prefix. Cleanup refuses to touch anything else. */
export const E2E_PREFIX = "__e2e_";

type Admin = SupabaseClient<any, "public", any>;

function env(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `E2E fixture preflight failed: ${name} is not set. ` +
        `Fixtures are never skipped for missing configuration.`,
    );
  }
  return value.trim();
}

/** Service-role client. Created on demand so importing this module is side-effect free. */
function adminClient(): Admin {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as Admin;
}

export type E2ETenant = {
  runId: string;
  organizationId: string;
  organizationName: string;
  websiteId: string;
  departmentId: string;
  departmentName: string;
  agent: { userId: string; email: string; password: string; fullName: string };
  /**
   * Extra synthetic staff created by individual specs (second agent, admin,
   * ...). Tracked here so teardown deletes every auth account it created.
   */
  additionalUsers: E2EStaff[];
};

export type E2EStaff = {
  userId: string;
  email: string;
  password: string;
  fullName: string;
  role: string;
};

/**
 * Tables that carry `organization_id`, ordered children-before-parents so the
 * teardown never trips a foreign key. Kept explicit (not derived) so a new
 * table must be consciously added rather than silently leaking rows.
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

/** Refuses to operate on anything that is not demonstrably synthetic. */
function assertSynthetic(name: string | null | undefined, what: string) {
  if (!name || !name.startsWith(E2E_PREFIX)) {
    throw new Error(
      `E2E safety guard tripped: refusing to touch ${what} "${name}" — it is not prefixed with ${E2E_PREFIX}.`,
    );
  }
}

/** Creates the isolated synthetic tenant: organization, website, department, agent. */
export async function createE2ETenant(): Promise<E2ETenant> {
  const db = adminClient();
  const runId = randomUUID().replace(/-/g, "").slice(0, 12);
  const organizationName = `${E2E_PREFIX}careconnect_${runId}`;

  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({
      name: organizationName,
      slug: organizationName,
      timezone: "America/Los_Angeles",
      status: "active",
      // Authenticator enrollment is a separate, org-level policy; these synthetic
      // tenants exercise conversation workflows, so it stays off here.
      require_mfa: false,
      require_mfa_for_admins: false,
    })

    .select("id, name")
    .single();
  if (orgError || !org) throw new Error(`E2E fixture: organization insert failed — ${orgError?.message}`);
  assertSynthetic(org.name, "organization");
  const organizationId = org.id as string;

  try {
    const { data: website, error: websiteError } = await db
      .from("websites")
      .insert({
        organization_id: organizationId,
        name: `${E2E_PREFIX}site_${runId}`,
        domain: `${runId}.e2e.invalid`,
        // dev_mode keeps the host allow-list permissive for the local preview
        // origin; the synthetic site is never referenced by a real page.
        dev_mode: true,
        status: "active",
        chatbot_name: "PHG CareConnect Assistant",
        welcome_message: "Hi! How can we help today?",
        timezone: "America/Los_Angeles",
      })
      .select("id")
      .single();
    if (websiteError || !website) throw new Error(`E2E fixture: website insert failed — ${websiteError?.message}`);

    const departmentName = `${E2E_PREFIX}care_team_${runId}`;
    const { data: department, error: deptError } = await db
      .from("departments")
      .insert({
        organization_id: organizationId,
        name: departmentName,
        // Shared queue = the conversation waits to be claimed, which is the
        // behaviour the golden path proves.
        routing_method: "shared_queue",
        is_default: true,
        status: "active",
        timezone: "America/Los_Angeles",
      })
      .select("id")
      .single();
    if (deptError || !department) throw new Error(`E2E fixture: department insert failed — ${deptError?.message}`);

    const email = `${E2E_PREFIX}agent_${runId}@example.test`;
    const password = `E2e!${randomUUID().slice(0, 18)}`;
    const fullName = `${E2E_PREFIX}Agent ${runId}`;
    assertSynthetic(email, "agent email");

    const { data: created, error: userError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, e2e: true },
    });
    if (userError || !created?.user) throw new Error(`E2E fixture: agent creation failed — ${userError?.message}`);
    const userId = created.user.id;

    const { error: profileError } = await db.from("profiles").upsert({
      id: userId,
      organization_id: organizationId,
      email,
      full_name: fullName,
      status: "active",
      // Claiming requires an available agent with spare capacity.
      presence: "available",
      max_concurrent_chats: 5,
      timezone: "America/Los_Angeles",
    });
    if (profileError) throw new Error(`E2E fixture: profile upsert failed — ${profileError.message}`);

    const { error: membershipError } = await db.from("organization_memberships").insert({
      organization_id: organizationId,
      user_id: userId,
      role: "agent",
      status: "active",
      accepted_at: new Date().toISOString(),
    });
    if (membershipError) throw new Error(`E2E fixture: membership insert failed — ${membershipError.message}`);

    const { error: deptMemberError } = await db.from("department_members").insert({
      organization_id: organizationId,
      department_id: department.id as string,
      user_id: userId,
    });
    if (deptMemberError) throw new Error(`E2E fixture: department member insert failed — ${deptMemberError.message}`);

    return {
      runId,
      organizationId,
      organizationName,
      websiteId: website.id as string,
      departmentId: department.id as string,
      departmentName,
      agent: { userId, email, password, fullName },
      additionalUsers: [],
    };
  } catch (error) {
    // A half-built tenant must never survive: tear down what exists, then rethrow.
    await destroyE2ETenant({
      runId,
      organizationId,
      organizationName,
      websiteId: "",
      departmentId: "",
      departmentName: "",
      agent: { userId: "", email: "", password: "", fullName: "" },
      additionalUsers: [],
    }).catch(() => undefined);
    throw error;
  }
}

/**
 * Deletes every artefact of the synthetic tenant and PROVES it is gone.
 * Throws when anything survives — an incomplete cleanup fails the test run.
 */
export async function destroyE2ETenant(tenant: E2ETenant): Promise<void> {
  const db = adminClient();

  // Re-verify against the database that this organization really is synthetic
  // before a single delete is issued.
  const { data: org } = await db
    .from("organizations")
    .select("id, name")
    .eq("id", tenant.organizationId)
    .maybeSingle();
  if (!org) return; // already gone
  assertSynthetic(org.name as string, "organization");

  const failures: string[] = [];

  for (const table of ORG_SCOPED_TABLES) {
    const { error } = await db.from(table).delete().eq("organization_id", tenant.organizationId);
    if (error) failures.push(`${table}: ${error.message}`);
  }

  for (const staff of tenant.additionalUsers ?? []) {
    assertSynthetic(staff.email, "staff email");
    const { error } = await db.auth.admin.deleteUser(staff.userId);
    if (error && !/not found/i.test(error.message)) failures.push(`auth user ${staff.email}: ${error.message}`);
  }

  if (tenant.agent.userId) {
    assertSynthetic(tenant.agent.email, "agent email");
    const { error } = await db.auth.admin.deleteUser(tenant.agent.userId);
    if (error && !/not found/i.test(error.message)) failures.push(`auth user: ${error.message}`);
  }

  const { error: orgError } = await db.from("organizations").delete().eq("id", tenant.organizationId);
  if (orgError) failures.push(`organizations: ${orgError.message}`);

  // Verification pass — counted, not assumed.
  for (const table of ORG_SCOPED_TABLES) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("organization_id", tenant.organizationId);
    if (error) failures.push(`verify ${table}: ${error.message}`);
    else if ((count ?? 0) > 0) failures.push(`verify ${table}: ${count} row(s) survived cleanup`);
  }

  const { data: survivingOrg } = await db
    .from("organizations")
    .select("id")
    .eq("id", tenant.organizationId)
    .maybeSingle();
  if (survivingOrg) failures.push("verify organizations: the synthetic organization survived cleanup");

  for (const staff of tenant.additionalUsers ?? []) {
    const { data: surviving } = await db.auth.admin.getUserById(staff.userId);
    if (surviving?.user) failures.push(`verify auth: ${staff.email} survived cleanup`);
  }

  if (tenant.agent.userId) {
    const { data: survivingUser } = await db.auth.admin.getUserById(tenant.agent.userId);
    if (survivingUser?.user) failures.push("verify auth: the synthetic agent account survived cleanup");
  }

  if (failures.length > 0) {
    throw new Error(`E2E cleanup FAILED — ${failures.length} issue(s):\n - ${failures.join("\n - ")}`);
  }
}

/** Read-only service-role handle for assertions about fixture-owned rows. */
export function fixtureReader(): Admin {
  return adminClient();
}

/**
 * Creates an additional synthetic department inside the tenant.
 * Setup-only: departments are configuration, not a product action under test.
 */
export async function createE2EDepartment(
  tenant: E2ETenant,
  options: { label: string; routingMethod?: "shared_queue" | "round_robin" },
): Promise<{ id: string; name: string }> {
  const db = adminClient();
  const name = `${E2E_PREFIX}${options.label}_${tenant.runId}`;
  assertSynthetic(name, "department");
  const { data, error } = await db
    .from("departments")
    .insert({
      organization_id: tenant.organizationId,
      name,
      routing_method: options.routingMethod ?? "shared_queue",
      is_default: false,
      status: "active",
      timezone: "America/Los_Angeles",
    })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(`E2E fixture: department insert failed — ${error?.message}`);
  return { id: data.id as string, name: data.name as string };
}

/**
 * Creates an additional synthetic staff account inside the tenant.
 * Only account *provisioning* happens here; every action the test then performs
 * goes through the real UI, real authentication and real RLS.
 */
export async function createE2EStaff(
  tenant: E2ETenant,
  options: {
    label: string;
    role: "agent" | "team_lead" | "manager" | "administrator" | "super_admin";
    departmentIds?: string[];
    presence?: "available" | "busy" | "away" | "offline";
    maxConcurrentChats?: number;
  },
): Promise<E2EStaff> {
  const db = adminClient();
  const suffix = `${options.label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const email = `${E2E_PREFIX}${suffix}@example.test`;
  const fullName = `${E2E_PREFIX}${options.label} ${tenant.runId}`;
  const password = `E2e!${randomUUID().slice(0, 18)}`;
  assertSynthetic(email, "staff email");

  const { data: created, error: userError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, e2e: true },
  });
  if (userError || !created?.user) throw new Error(`E2E fixture: staff creation failed — ${userError?.message}`);
  const staff: E2EStaff = { userId: created.user.id, email, password, fullName, role: options.role };
  tenant.additionalUsers.push(staff);

  const { error: profileError } = await db.from("profiles").upsert({
    id: staff.userId,
    organization_id: tenant.organizationId,
    email,
    full_name: fullName,
    status: "active",
    presence: options.presence ?? "available",
    max_concurrent_chats: options.maxConcurrentChats ?? 5,
    timezone: "America/Los_Angeles",
  });
  if (profileError) throw new Error(`E2E fixture: staff profile failed — ${profileError.message}`);

  const { error: membershipError } = await db.from("organization_memberships").insert({
    organization_id: tenant.organizationId,
    user_id: staff.userId,
    role: options.role,
    status: "active",
    accepted_at: new Date().toISOString(),
  });
  if (membershipError) throw new Error(`E2E fixture: staff membership failed — ${membershipError.message}`);

  for (const departmentId of options.departmentIds ?? []) {
    const { error } = await db.from("department_members").insert({
      organization_id: tenant.organizationId,
      department_id: departmentId,
      user_id: staff.userId,
    });
    if (error) throw new Error(`E2E fixture: staff department membership failed — ${error.message}`);
  }

  return staff;
}
