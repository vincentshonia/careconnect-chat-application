import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { permissionsFor, roleTransitionError, type OrgRole } from "@/lib/permissions";
import { dashboardScopeFor, reportScopeFor } from "@/lib/report-scope";
import { requireTestEnv } from "./helpers/required-env";

/**
 * Authenticated RBAC integration tests.
 *
 * These provision real, ephemeral users across two tenants and then talk to
 * the database as those users through the public API — the same path a browser
 * takes. They prove the boundaries unit tests cannot: cross-tenant denial,
 * role boundaries within one tenant, department-level visibility, self-service
 * profile limits (including for administrators) and loss of authorization the
 * moment a membership is suspended, without signing the user out.
 *
 * Everything created here is deleted again in `afterAll`.
 */
const url = process.env['SUPABASE_URL'] ?? "";
const anonKey = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? "";
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? "";
const configured = requireTestEnv({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey });

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
  /** deptA1, owned by user A */
  convA1: string;
  /** deptA1, unowned */
  convA1Open: string;
  /** deptA2, unowned */
  convA2: string;
  convB: string;
  users: Record<string, { id: string; email: string; role: OrgRole; departments: string[] }>;
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

async function createUser(key: string, org: string, role: OrgRole, departments: string[]) {
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
  ctx.users[key] = { id, email, role, departments };
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

/** Ids of conversations this signed-in user can actually read. */
async function visibleConversations(key: string, ids: string[]) {
  const { data } = await clients[key]!.from("conversations").select("id").in("id", ids);
  return (data ?? []).map((r) => r.id as string);
}

/**
 * Resolve the reporting scope the way the server does: read the caller's real
 * membership role and department rows through their own authenticated session,
 * expand the role into permissions, then apply the scope rules. This exercises
 * the whole role -> permission -> scope chain rather than a synthetic actor.
 */
async function scopeForSignedInUser(key: string) {
  const client = clients[key]!;
  const userId = ctx.users[key]!.id;
  const { data: membership, error } = await client
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`membership read ${key}: ${error.message}`);
  const { data: depts } = await client
    .from("department_members")
    .select("department_id")
    .eq("user_id", userId);
  const actor = {
    userId,
    organizationId: (membership?.organization_id ?? "") as string,
    departmentIds: (depts ?? []).map((d) => d.department_id as string),
    permissions: permissionsFor((membership?.role ?? null) as OrgRole | null, null),
  };
  return { actor, report: reportScopeFor(actor), dashboard: dashboardScopeFor(actor) };
}

describe("authenticated RBAC boundaries", () => {
  beforeAll(async () => {
    ctx.users = {};
    ctx.orgA = await createOrg(`RbacA${suffix}`);
    ctx.orgB = await createOrg(`RbacB${suffix}`);
    ctx.deptA1 = await createDepartment(ctx.orgA, `Intake ${suffix}`);
    ctx.deptA2 = await createDepartment(ctx.orgA, `Billing ${suffix}`);
    ctx.websiteA = await createWebsite(ctx.orgA, `SiteA${suffix}`);
    ctx.websiteB = await createWebsite(ctx.orgB, `SiteB${suffix}`);

    // Full role matrix inside tenant A.
    const userA = await createUser("userA", ctx.orgA, "agent", [ctx.deptA1]);
    await createUser("userB", ctx.orgA, "agent", [ctx.deptA1]);
    await createUser("userC", ctx.orgA, "agent", [ctx.deptA2]);
    await createUser("lead", ctx.orgA, "team_lead", [ctx.deptA1]);
    await createUser("manager", ctx.orgA, "manager", [ctx.deptA1]);
    await createUser("managerNone", ctx.orgA, "manager", []);
    await createUser("adminA", ctx.orgA, "administrator", []);
    await createUser("superA", ctx.orgA, "super_admin", []);
    await createUser("suspended", ctx.orgA, "agent", [ctx.deptA1]);
    // Tenant B employee.
    await createUser("agentB", ctx.orgB, "agent", []);

    ctx.convA1 = await createConversation(
      ctx.orgA,
      ctx.websiteA,
      ctx.deptA1,
      `A1-${suffix}`,
      userA,
    );
    ctx.convA1Open = await createConversation(
      ctx.orgA,
      ctx.websiteA,
      ctx.deptA1,
      `A1open-${suffix}`,
    );
    ctx.convA2 = await createConversation(ctx.orgA, ctx.websiteA, ctx.deptA2, `A2-${suffix}`);
    ctx.convB = await createConversation(ctx.orgB, ctx.websiteB, null, `B1-${suffix}`);
  }, 120_000);

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
  }, 120_000);

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

    it("a member of tenant B cannot write into tenant A", async () => {
      const { error } = await clients['agentB']!.from("conversations").insert({
        organization_id: ctx.orgA,
        website_id: ctx.websiteA,
        reference: `forged-${suffix}`,
      } as never);
      expect(error).not.toBeNull();
    });
  });

  describe("Standard Users", () => {
    it("A and B both see the conversations in their shared department", async () => {
      const seenA = await visibleConversations("userA", [ctx.convA1, ctx.convA1Open]);
      const seenB = await visibleConversations("userB", [ctx.convA1, ctx.convA1Open]);
      expect(seenA.sort()).toEqual([ctx.convA1, ctx.convA1Open].sort());
      expect(seenB.sort()).toEqual([ctx.convA1, ctx.convA1Open].sort());
    });

    it("B may view A's owned conversation but cannot take ownership of it", async () => {
      await clients['userB']!
        .from("conversations")
        .update({ assigned_to: ctx.users['userB']!.id })
        .eq("id", ctx.convA1);
      const { data } = await admin
        .from("conversations")
        .select("assigned_to")
        .eq("id", ctx.convA1)
        .single();
      expect(data?.assigned_to).toBe(ctx.users['userA']!.id);
    });

    it("B cannot reply on a conversation owned by A", async () => {
      const { error } = await clients['userB']!.from("messages").insert({
        conversation_id: ctx.convA1,
        organization_id: ctx.orgA,
        website_id: ctx.websiteA,
        sender_type: "agent",
        sender_user_id: ctx.users['userB']!.id,
        body: "impersonation attempt",
      } as never);
      expect(error).not.toBeNull();
    });

    it("A can reply on the conversation they own", async () => {
      const { error } = await clients['userA']!.from("messages").insert({
        conversation_id: ctx.convA1,
        organization_id: ctx.orgA,
        website_id: ctx.websiteA,
        sender_type: "agent",
        sender_user_id: ctx.users['userA']!.id,
        body: "hello from the owner",
      } as never);
      expect(error).toBeNull();
    });

    it("C cannot see the other department's conversations", async () => {
      const seen = await visibleConversations("userC", [ctx.convA1, ctx.convA1Open]);
      expect(seen).toHaveLength(0);
    });

    it("C sees their own department's conversation", async () => {
      const seen = await visibleConversations("userC", [ctx.convA2]);
      expect(seen).toEqual([ctx.convA2]);
    });

    it("a Standard User cannot modify roles", async () => {
      await clients['userA']!
        .from("organization_memberships")
        .update({ role: "administrator" })
        .eq("user_id", ctx.users['userA']!.id);
      const { data } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", ctx.users['userA']!.id)
        .single();
      expect(data?.role).toBe("agent");
      expect(
        roleTransitionError({
          actorRole: "agent",
          actorIsSelf: true,
          actorIsPlatformAdmin: false,
          targetCurrentRole: "agent",
          targetNewRole: "administrator",
        }),
      ).toBeTruthy();
    });

    it("a Standard User cannot make themselves a platform administrator", async () => {
      const { error } = await clients['userA']!
        .from("platform_admins")
        .insert({ user_id: ctx.users['userA']!.id, role: "platform_owner" } as never);
      expect(error).not.toBeNull();
    });

    it("a Standard User cannot grant themselves a role row", async () => {
      const { error } = await clients['userA']!.from("user_roles").insert({
        user_id: ctx.users['userA']!.id,
        role: "administrator",
        organization_id: ctx.orgA,
      } as never);
      expect(error).not.toBeNull();
    });
  });

  describe("Team Lead", () => {
    it("can access their assigned department's conversations", async () => {
      const seen = await visibleConversations("lead", [ctx.convA1, ctx.convA1Open]);
      expect(seen.sort()).toEqual([ctx.convA1, ctx.convA1Open].sort());
    });

    it("cannot access an unauthorized department", async () => {
      const seen = await visibleConversations("lead", [ctx.convA2]);
      expect(seen).toHaveLength(0);
    });

    it("cannot change organization roles", async () => {
      await clients['lead']!
        .from("organization_memberships")
        .update({ role: "agent" })
        .eq("user_id", ctx.users['userB']!.id);
      const { data } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", ctx.users['userB']!.id)
        .single();
      expect(data?.role).toBe("agent");
      expect(
        roleTransitionError({
          actorRole: "team_lead",
          actorIsSelf: false,
          actorIsPlatformAdmin: false,
          targetCurrentRole: "agent",
          targetNewRole: "manager",
        }),
      ).toBeTruthy();
    });
  });

  describe("Manager", () => {
    it("can access their assigned department", async () => {
      const seen = await visibleConversations("manager", [ctx.convA1, ctx.convA1Open]);
      expect(seen.sort()).toEqual([ctx.convA1, ctx.convA1Open].sort());
    });

    it("cannot access an unauthorized department", async () => {
      const seen = await visibleConversations("manager", [ctx.convA2]);
      expect(seen).toHaveLength(0);
    });

    it("cannot change organization roles", async () => {
      expect(
        roleTransitionError({
          actorRole: "manager",
          actorIsSelf: false,
          actorIsPlatformAdmin: false,
          targetCurrentRole: "agent",
          targetNewRole: "team_lead",
        }),
      ).toBeTruthy();
      await clients['manager']!
        .from("organization_memberships")
        .update({ role: "team_lead" })
        .eq("user_id", ctx.users['userB']!.id);
      const { data } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", ctx.users['userB']!.id)
        .single();
      expect(data?.role).toBe("agent");
    });
  });

  describe("Manager with zero departments", () => {
    it("receives no department conversations at all", async () => {
      const seen = await visibleConversations("managerNone", [
        ctx.convA1,
        ctx.convA1Open,
        ctx.convA2,
      ]);
      expect(seen).toHaveLength(0);
    });

    it("never falls back to organization-wide reporting scope", async () => {
      const { report, dashboard } = await scopeForSignedInUser("managerNone");
      expect(dashboard).toBe("team");
      expect(report.level).toBe("team");
      expect(report.departmentIds).toEqual([]);
    });
  });

  describe("Administrator", () => {
    it("can access organization-wide conversations", async () => {
      const seen = await visibleConversations("adminA", [
        ctx.convA1,
        ctx.convA1Open,
        ctx.convA2,
      ]);
      expect(seen.sort()).toEqual([ctx.convA1, ctx.convA1Open, ctx.convA2].sort());
    });

    it("cannot access organization B", async () => {
      const seen = await visibleConversations("adminA", [ctx.convB]);
      expect(seen).toHaveLength(0);
      const { data } = await clients['adminA']!
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", ctx.orgB);
      expect(data ?? []).toHaveLength(0);
    });

    it("cannot promote another user to Super Admin", async () => {
      expect(
        roleTransitionError({
          actorRole: "administrator",
          actorIsSelf: false,
          actorIsPlatformAdmin: false,
          targetCurrentRole: "agent",
          targetNewRole: "super_admin",
        }),
      ).toBeTruthy();
      await clients['adminA']!
        .from("organization_memberships")
        .update({ role: "super_admin" })
        .eq("user_id", ctx.users['userB']!.id);
      const { data } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", ctx.users['userB']!.id)
        .single();
      expect(data?.role).toBe("agent");
    });

    it("cannot modify their own role", async () => {
      expect(
        roleTransitionError({
          actorRole: "administrator",
          actorIsSelf: true,
          actorIsPlatformAdmin: false,
          targetCurrentRole: "administrator",
          targetNewRole: "super_admin",
        }),
      ).toBeTruthy();
      await clients['adminA']!
        .from("organization_memberships")
        .update({ role: "super_admin" })
        .eq("user_id", ctx.users['adminA']!.id);
      const { data } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", ctx.users['adminA']!.id)
        .single();
      expect(data?.role).toBe("administrator");
    });
  });

  describe("Super Admin", () => {
    it("receives organization-wide access", async () => {
      const seen = await visibleConversations("superA", [
        ctx.convA1,
        ctx.convA1Open,
        ctx.convA2,
      ]);
      expect(seen.sort()).toEqual([ctx.convA1, ctx.convA1Open, ctx.convA2].sort());
    });

    it("still cannot access another tenant", async () => {
      const seen = await visibleConversations("superA", [ctx.convB]);
      expect(seen).toHaveLength(0);
      const { data } = await clients['superA']!
        .from("organizations")
        .select("id")
        .eq("id", ctx.orgB);
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("personal profile updates never grant authority", () => {
    for (const key of ["userA", "adminA", "superA"] as const) {
      it(`${key} cannot move themselves to another organization`, async () => {
        await clients[key]!
          .from("profiles")
          .update({ organization_id: ctx.orgB })
          .eq("id", ctx.users[key]!.id);
        const { data } = await admin
          .from("profiles")
          .select("organization_id")
          .eq("id", ctx.users[key]!.id)
          .single();
        expect(data?.organization_id).toBe(ctx.orgA);
      });

      it(`${key} cannot raise their own concurrent chat capacity`, async () => {
        await admin
          .from("profiles")
          .update({ max_concurrent_chats: 2 })
          .eq("id", ctx.users[key]!.id);
        await clients[key]!
          .from("profiles")
          .update({ max_concurrent_chats: 99 })
          .eq("id", ctx.users[key]!.id);
        const { data } = await admin
          .from("profiles")
          .select("max_concurrent_chats")
          .eq("id", ctx.users[key]!.id)
          .single();
        expect(data?.max_concurrent_chats).toBe(2);
      });

      it(`${key} cannot change their own account status`, async () => {
        await admin.from("profiles").update({ status: "active" }).eq("id", ctx.users[key]!.id);
        await clients[key]!
          .from("profiles")
          .update({ status: "suspended" })
          .eq("id", ctx.users[key]!.id);
        const { data } = await admin
          .from("profiles")
          .select("status")
          .eq("id", ctx.users[key]!.id)
          .single();
        expect(data?.status).toBe("active");
      });

      it(`${key}'s profile email keeps mirroring the sign-in email`, async () => {
        await clients[key]!
          .from("profiles")
          .update({ email: "attacker@example.test" })
          .eq("id", ctx.users[key]!.id);
        const { data } = await admin
          .from("profiles")
          .select("email")
          .eq("id", ctx.users[key]!.id)
          .single();
        expect(data?.email).toBe(ctx.users[key]!.email.toLowerCase());
      });
    }

    it("a Standard User can still edit their own personal details", async () => {
      const { error } = await clients['userA']!
        .from("profiles")
        .update({ full_name: "Renamed Agent", phone: "555-0100" })
        .eq("id", ctx.users['userA']!.id);
      expect(error).toBeNull();
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", ctx.users['userA']!.id)
        .single();
      expect(data?.full_name).toBe("Renamed Agent");
    });

    it("a Standard User cannot edit a colleague's profile", async () => {
      await clients['userA']!
        .from("profiles")
        .update({ full_name: "Hacked" })
        .eq("id", ctx.users['userB']!.id);
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", ctx.users['userB']!.id)
        .single();
      expect(data?.full_name).not.toBe("Hacked");
    });

    it("an Administrator can still perform authorized staff management on another employee", async () => {
      const { error } = await clients['adminA']!
        .from("profiles")
        .update({ max_concurrent_chats: 7, status: "inactive", title: "Senior Advocate" })
        .eq("id", ctx.users['userC']!.id);
      expect(error).toBeNull();
      const { data } = await admin
        .from("profiles")
        .select("max_concurrent_chats, status, title")
        .eq("id", ctx.users['userC']!.id)
        .single();
      expect(data?.max_concurrent_chats).toBe(7);
      expect(data?.status).toBe("inactive");
      expect(data?.title).toBe("Senior Advocate");
      await admin.from("profiles").update({ status: "active" }).eq("id", ctx.users['userC']!.id);
    });
  });

  describe("role -> permission -> reporting scope", () => {
    it("a Standard User resolves to self scope", async () => {
      const { report, dashboard } = await scopeForSignedInUser("userA");
      expect(dashboard).toBe("self");
      expect(report.level).toBe("self");
      expect(report.staffIds).toEqual([ctx.users['userA']!.id]);
      expect(report.departmentIds).toEqual([ctx.deptA1]);
    });

    it("a Team Lead resolves to their assigned departments", async () => {
      const { report, dashboard } = await scopeForSignedInUser("lead");
      expect(dashboard).toBe("team");
      expect(report.level).toBe("team");
      expect(report.departmentIds).toEqual([ctx.deptA1]);
      expect(report.staffIds).toBeNull();
    });

    it("a Manager resolves to their assigned departments", async () => {
      const { report } = await scopeForSignedInUser("manager");
      expect(report.level).toBe("team");
      expect(report.departmentIds).toEqual([ctx.deptA1]);
    });

    it("an Administrator resolves to organization scope", async () => {
      const { report, dashboard } = await scopeForSignedInUser("adminA");
      expect(dashboard).toBe("organization");
      expect(report.level).toBe("organization");
      expect(report.departmentIds).toBeNull();
      expect(report.organizationId).toBe(ctx.orgA);
    });

    it("a Super Admin resolves to organization scope", async () => {
      const { report, dashboard } = await scopeForSignedInUser("superA");
      expect(dashboard).toBe("organization");
      expect(report.level).toBe("organization");
      expect(report.organizationId).toBe(ctx.orgA);
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
      expect(rows.map((r) => r.user_id)).toContain(ctx.users['userB']!.id);
      expect(rows.map((r) => r.user_id)).not.toContain(ctx.users['agentB']!.id);
    });

    it("is not callable by signed-in users directly", async () => {
      const { error } = await clients['userA']!.rpc("reassignment_candidates", {
        _org: ctx.orgA,
        _conversation: ctx.convA1,
      } as never);
      expect(error).not.toBeNull();
    });
  });

  // Kept last: it permanently revokes one user's membership.
  describe("membership suspension revokes an existing session", () => {
    it("denies tenant reads and writes on the still-signed-in client", async () => {
      const client = clients['suspended']!;
      const before = await visibleConversations("suspended", [ctx.convA1Open]);
      expect(before).toEqual([ctx.convA1Open]);

      const { error: suspendError } = await admin
        .from("organization_memberships")
        .update({ status: "suspended" })
        .eq("user_id", ctx.users['suspended']!.id);
      expect(suspendError).toBeNull();

      // Same JWT, same client, no re-authentication.
      const { data: session } = await client.auth.getSession();
      expect(session.session).not.toBeNull();

      const { data: reads } = await client
        .from("conversations")
        .select("id")
        .in("id", [ctx.convA1, ctx.convA1Open, ctx.convA2]);
      expect(reads ?? []).toHaveLength(0);

      const { error: writeError } = await client.from("conversations").insert({
        organization_id: ctx.orgA,
        website_id: ctx.websiteA,
        reference: `suspended-${suffix}`,
      } as never);
      expect(writeError).not.toBeNull();

      const { data: orgs } = await client.from("organizations").select("id").eq("id", ctx.orgA);
      expect(orgs ?? []).toHaveLength(0);
    });
  });
});
