import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Authenticated RBAC integration tests.
 *
 * These provision real, ephemeral users in two tenants and then talk to the
 * database as those users through the public API — the same path a browser
 * takes. They prove three boundaries that unit tests cannot: cross-tenant
 * denial, role boundaries within one tenant, and department-level visibility.
 *
 * Everything created here is deleted again in `afterAll`.
 */
const url = process.env['SUPABASE_URL'] ?? "";
const anonKey = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? "";
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? "";
const configured = Boolean(url && anonKey && serviceKey);

const admin = configured
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : (null as unknown as SupabaseClient);

const suffix = Math.random().toString(36).slice(2, 8);
const password = `Test!${Math.random().toString(36).slice(2, 12)}Aa1`;

type Ctx = {
  orgA: string;
  orgB: string;
  deptA1: string;
  deptA2: string;
  websiteA: string;
  websiteB: string;
  convA1: string;
  convA2: string;
  convB: string;
  users: Record<string, { id: string; email: string }>;
};

const ctx = {} as Ctx;
const clients: Record<string, SupabaseClient> = {};

async function createOrg(name: string) {
  const { data, error } = await admin
    .from("organizations")
    .insert({ name, slug: `${name.toLowerCase()}-${suffix}` })
    .select("id")
    .single();
  if (error) throw new Error(`org: ${error.message}`);
  return data.id as string;
}

async function createDepartment(org: string, name: string) {
  const { data, error } = await admin
    .from("departments")
    .insert({ organization_id: org, name })
    .select("id")
    .single();
  if (error) throw new Error(`department: ${error.message}`);
  return data.id as string;
}

async function createWebsite(org: string, name: string) {
  const { data, error } = await admin
    .from("websites")
    .insert({
      organization_id: org,
      name,
      domain: `${name.toLowerCase()}-${suffix}.example.com`,
      public_key: `pk_test_${suffix}_${name.toLowerCase()}`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`website: ${error.message}`);
  return data.id as string;
}

async function createUser(key: string, org: string, role: string, departments: string[]) {
  const email = `rbac-${key}-${suffix}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `RBAC ${key}` },
  });
  if (error || !data.user) throw new Error(`user ${key}: ${error?.message}`);
  const id = data.user.id;

  await admin
    .from("profiles")
    .upsert({ id, organization_id: org, full_name: `RBAC ${key}`, email, presence: "available" });
  const { error: memberError } = await admin
    .from("organization_memberships")
    .insert({ organization_id: org, user_id: id, role, status: "active" });
  if (memberError) throw new Error(`membership ${key}: ${memberError.message}`);
  for (const department of departments) {
    await admin
      .from("department_members")
      .insert({ department_id: department, user_id: id, organization_id: org });
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in ${key}: ${signInError.message}`);
  clients[key] = client;
  ctx.users[key] = { id, email };
  return id;
}

async function createConversation(
  org: string,
  website: string,
  department: string | null,
  reference: string,
  assignedTo: string | null = null,
) {
  const { data, error } = await admin
    .from("conversations")
    .insert({
      organization_id: org,
      website_id: website,
      department_id: department,
      reference,
      status: assignedTo ? "assigned" : "waiting",
      assigned_to: assignedTo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`conversation: ${error.message}`);
  return data.id as string;
}

describe.runIf(configured)("authenticated RBAC boundaries", () => {
  beforeAll(async () => {
    ctx.users = {};
    ctx.orgA = await createOrg(`RbacA${suffix}`);
    ctx.orgB = await createOrg(`RbacB${suffix}`);
    ctx.deptA1 = await createDepartment(ctx.orgA, `Intake ${suffix}`);
    ctx.deptA2 = await createDepartment(ctx.orgA, `Billing ${suffix}`);
    ctx.websiteA = await createWebsite(ctx.orgA, `SiteA${suffix}`);
    ctx.websiteB = await createWebsite(ctx.orgB, `SiteB${suffix}`);

    await createUser("agentA", ctx.orgA, "agent", [ctx.deptA1]);
    const otherAgent = await createUser("agentA2", ctx.orgA, "agent", [ctx.deptA2]);
    await createUser("adminA", ctx.orgA, "administrator", []);
    await createUser("agentB", ctx.orgB, "agent", []);

    ctx.convA1 = await createConversation(ctx.orgA, ctx.websiteA, ctx.deptA1, `A1-${suffix}`);
    ctx.convA2 = await createConversation(
      ctx.orgA,
      ctx.websiteA,
      ctx.deptA2,
      `A2-${suffix}`,
      otherAgent,
    );
    ctx.convB = await createConversation(ctx.orgB, ctx.websiteB, null, `B1-${suffix}`);
  }, 60_000);

  afterAll(async () => {
    if (!configured) return;
    for (const org of [ctx.orgA, ctx.orgB].filter(Boolean)) {
      await admin.from("conversation_events").delete().eq("organization_id", org);
      await admin.from("messages").delete().eq("organization_id", org);
      await admin.from("conversations").delete().eq("organization_id", org);
      await admin.from("department_members").delete().eq("organization_id", org);
      await admin.from("departments").delete().eq("organization_id", org);
      await admin.from("websites").delete().eq("organization_id", org);
      await admin.from("audit_logs").delete().eq("organization_id", org);
      await admin.from("notifications").delete().eq("organization_id", org);
      await admin.from("organization_memberships").delete().eq("organization_id", org);
    }
    for (const user of Object.values(ctx.users ?? {})) {
      await admin.from("profiles").delete().eq("id", user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
    for (const org of [ctx.orgA, ctx.orgB].filter(Boolean)) {
      await admin.from("organizations").delete().eq("id", org);
    }
  }, 60_000);

  describe("cross-tenant denial", () => {
    it("a member of tenant B sees no conversation from tenant A", async () => {
      const { data } = await clients['agentB']!
        .from("conversations")
        .select("id")
        .eq("organization_id", ctx.orgA);
      expect(data ?? []).toHaveLength(0);
    });

    it("a member of tenant B cannot read tenant A's organization record", async () => {
      const { data } = await clients['agentB']!
        .from("organizations")
        .select("id")
        .eq("id", ctx.orgA);
      expect(data ?? []).toHaveLength(0);
    });

    it("an administrator of tenant A cannot read tenant B's conversations", async () => {
      const { data } = await clients['adminA']!
        .from("conversations")
        .select("id")
        .eq("organization_id", ctx.orgB);
      expect(data ?? []).toHaveLength(0);
    });

    it("a member of tenant B cannot write into tenant A", async () => {
      const { error } = await clients['agentB']!.from("conversations").insert({
        organization_id: ctx.orgA,
        website_id: ctx.websiteA,
        reference: `forged-${suffix}`,
      } as never);
      expect(error).not.toBeNull();
    });
  });

  describe("department visibility", () => {
    it("an agent sees the unclaimed conversation in their own department", async () => {
      const { data } = await clients['agentA']!
        .from("conversations")
        .select("id")
        .eq("id", ctx.convA1);
      expect((data ?? []).map((r) => r.id)).toContain(ctx.convA1);
    });

    it("an agent does not see another department's assigned conversation", async () => {
      const { data } = await clients['agentA']!
        .from("conversations")
        .select("id")
        .eq("id", ctx.convA2);
      expect(data ?? []).toHaveLength(0);
    });

    it("an administrator sees every conversation in their tenant", async () => {
      const { data } = await clients['adminA']!
        .from("conversations")
        .select("id")
        .in("id", [ctx.convA1, ctx.convA2]);
      expect((data ?? []).length).toBe(2);
    });
  });

  describe("role boundaries and privilege escalation", () => {
    it("an agent cannot promote themselves", async () => {
      await clients['agentA']!
        .from("organization_memberships")
        .update({ role: "administrator" })
        .eq("user_id", ctx.users['agentA']!.id);
      const { data } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", ctx.users['agentA']!.id)
        .single();
      expect(data?.role).toBe("agent");
    });

    it("an agent cannot make themselves a platform administrator", async () => {
      const { error } = await clients['agentA']!
        .from("platform_admins")
        .insert({ user_id: ctx.users['agentA']!.id, role: "platform_owner" } as never);
      expect(error).not.toBeNull();
    });

    it("an agent cannot grant themselves a role row", async () => {
      const { error } = await clients['agentA']!
        .from("user_roles")
        .insert({
          user_id: ctx.users['agentA']!.id,
          role: "administrator",
          organization_id: ctx.orgA,
        } as never);
      expect(error).not.toBeNull();
    });

    it("an administrator cannot reach another tenant's memberships", async () => {
      const { data } = await clients['adminA']!
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", ctx.orgB);
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("personal settings are locked to personal fields", () => {
    it("a user cannot move themselves to another organization", async () => {
      await clients['agentA']!
        .from("profiles")
        .update({ organization_id: ctx.orgB })
        .eq("id", ctx.users['agentA']!.id);
      const { data } = await admin
        .from("profiles")
        .select("organization_id")
        .eq("id", ctx.users['agentA']!.id)
        .single();
      expect(data?.organization_id).toBe(ctx.orgA);
    });

    it("a user cannot raise their own concurrent chat capacity or reactivate a suspended account", async () => {
      await admin
        .from("profiles")
        .update({ max_concurrent_chats: 2, status: "active" })
        .eq("id", ctx.users['agentA']!.id);
      await clients['agentA']!
        .from("profiles")
        .update({ max_concurrent_chats: 99, status: "suspended" })
        .eq("id", ctx.users['agentA']!.id);
      const { data } = await admin
        .from("profiles")
        .select("max_concurrent_chats, status")
        .eq("id", ctx.users['agentA']!.id)
        .single();
      expect(data?.max_concurrent_chats).toBe(2);
      expect(data?.status).toBe("active");
    });

    it("profiles.email always mirrors the sign-in email", async () => {
      await clients['agentA']!
        .from("profiles")
        .update({ email: "attacker@example.test" })
        .eq("id", ctx.users['agentA']!.id);
      const { data } = await admin
        .from("profiles")
        .select("email")
        .eq("id", ctx.users['agentA']!.id)
        .single();
      expect(data?.email).toBe(ctx.users['agentA']!.email);
    });

    it("a user can still edit their own personal details", async () => {
      const { error } = await clients['agentA']!
        .from("profiles")
        .update({ full_name: "Renamed Agent", phone: "555-0100" })
        .eq("id", ctx.users['agentA']!.id);
      expect(error).toBeNull();
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", ctx.users['agentA']!.id)
        .single();
      expect(data?.full_name).toBe("Renamed Agent");
    });

    it("a user cannot edit a colleague's profile", async () => {
      await clients['agentA']!
        .from("profiles")
        .update({ full_name: "Hacked" })
        .eq("id", ctx.users['agentA2']!.id);
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", ctx.users['agentA2']!.id)
        .single();
      expect(data?.full_name).not.toBe("Hacked");
    });
  });

  describe("eligible transfer targets", () => {
    it("only lists teammates in the conversation's department", async () => {
      const { data, error } = await admin.rpc("reassignment_candidates", {
        _org: ctx.orgA,
        _conversation: ctx.convA1,
      } as never);
      expect(error).toBeNull();
      const rows = (data ?? []) as Array<{ user_id: string; in_department: boolean }>;
      expect(rows.map((r) => r.user_id)).toContain(ctx.users['agentA']!.id);
      expect(rows.map((r) => r.user_id)).not.toContain(ctx.users['agentA2']!.id);
      expect(rows.map((r) => r.user_id)).not.toContain(ctx.users['agentB']!.id);
    });

    it("is not callable by signed-in users directly", async () => {
      const { error } = await clients['agentA']!.rpc("reassignment_candidates", {
        _org: ctx.orgA,
        _conversation: ctx.convA1,
      } as never);
      expect(error).not.toBeNull();
    });
  });
});
