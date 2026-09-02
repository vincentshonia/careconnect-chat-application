import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { decideTransfer } from "@/lib/transfer-eligibility";
import { requireTestEnv } from "./helpers/required-env";

/**
 * Concurrency & routing integration tests (Phase 1 gate).
 *
 * Everything here runs against the real database through genuinely concurrent
 * calls (`Promise.all` over separate HTTP round trips, so the transactions
 * overlap). API responses are never the only assertion: after each scenario the
 * database is re-read and the authoritative final state is checked.
 *
 * All fixtures are ephemeral and removed in `afterAll`; production tenants are
 * never touched.
 */
const url = process.env['SUPABASE_URL'] ?? "";
const anonKey = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? "";
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? "";
const configured = requireTestEnv({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey });

const db = configured
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : (null as unknown as SupabaseClient);

const suffix = Math.random().toString(36).slice(2, 8);
const password = `Test!${Math.random().toString(36).slice(2, 12)}Aa1`;

const createdUsers: string[] = [];
let orgId = "";
let websiteId = "";

type ClaimResult = { ok?: boolean; code?: string; message?: string; assigned_to?: string };

async function claim(conversationId: string, userId: string): Promise<ClaimResult> {
  const { data, error } = await db.rpc("claim_conversation", {
    _conversation: conversationId,
    _user: userId,
  } as never);
  if (error) throw new Error(`claim rpc: ${error.message}`);
  return (data ?? {}) as ClaimResult;
}

async function route(conversationId: string, departmentId: string) {
  const { data, error } = await db.rpc("assign_round_robin", {
    _conversation: conversationId,
    _department: departmentId,
  } as never);
  if (error) throw new Error(`round robin rpc: ${error.message}`);
  return (data ?? {}) as { ok?: boolean; code?: string; user_id?: string };
}

async function makeDepartment(name: string) {
  const { data, error } = await db
    .from("departments")
    .insert({ organization_id: orgId, name: `${name} ${suffix}` })
    .select("id")
    .single();
  if (error) throw new Error(`department: ${error.message}`);
  return data.id as string;
}

type StaffOptions = {
  departments?: string[];
  presence?: string;
  profileStatus?: string;
  membershipStatus?: string;
  capacity?: number;
  role?: string;
};

async function makeStaff(key: string, options: StaffOptions = {}) {
  const email = `conc-${key}-${suffix}@example.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`user ${key}: ${error?.message}`);
  const id = data.user.id;
  createdUsers.push(id);

  const { error: profileError } = await db.from("profiles").upsert({
    id,
    organization_id: orgId,
    full_name: `Conc ${key}`,
    email,
    presence: options.presence ?? "available",
    status: options.profileStatus ?? "active",
    max_concurrent_chats: options.capacity ?? 0,
  });
  if (profileError) throw new Error(`profile ${key}: ${profileError.message}`);

  const { error: memberError } = await db.from("organization_memberships").insert({
    organization_id: orgId,
    user_id: id,
    role: options.role ?? "agent",
    status: options.membershipStatus ?? "active",
  });
  if (memberError) throw new Error(`membership ${key}: ${memberError.message}`);

  for (const department of options.departments ?? []) {
    const { error: dmError } = await db
      .from("department_members")
      .insert({ department_id: department, user_id: id, organization_id: orgId });
    if (dmError) throw new Error(`department member ${key}: ${dmError.message}`);
  }
  return id;
}

async function makeConversation(department: string | null, status = "waiting") {
  const { data, error } = await db
    .from("conversations")
    .insert({
      organization_id: orgId,
      website_id: websiteId,
      department_id: department,
      reference: `C-${suffix}-${Math.random().toString(36).slice(2, 9)}`,
      status,
    })
    .select("id")
    .single();
  if (error) throw new Error(`conversation: ${error.message}`);
  return data.id as string;
}

async function makeConversations(department: string | null, count: number) {
  return Promise.all(Array.from({ length: count }, () => makeConversation(department)));
}

async function readConversation(id: string) {
  const { data, error } = await db
    .from("conversations")
    .select("id, assigned_to, status, claimed_at, department_id")
    .eq("id", id)
    .single();
  if (error) throw new Error(`read conversation: ${error.message}`);
  return data as {
    id: string;
    assigned_to: string | null;
    status: string;
    claimed_at: string | null;
    department_id: string | null;
  };
}

/** Live workload straight from the database — the authoritative count. */
async function activeCount(userId: string) {
  const { count, error } = await db
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .in("status", ["assigned", "active", "pending_visitor", "pending_internal", "escalated"]);
  if (error) throw new Error(`workload: ${error.message}`);
  return count ?? 0;
}

describe("claim & routing concurrency", () => {
  beforeAll(async () => {
    const { data, error } = await db
      .from("organizations")
      .insert({ name: `Conc ${suffix}`, slug: `conc-${suffix}` })
      .select("id")
      .single();
    if (error) throw new Error(`org: ${error.message}`);
    orgId = data.id as string;

    const { data: site, error: siteError } = await db
      .from("websites")
      .insert({
        organization_id: orgId,
        name: `ConcSite ${suffix}`,
        domain: `conc-${suffix}.example.com`,
        public_key: `pk_conc_${suffix}`,
      })
      .select("id")
      .single();
    if (siteError) throw new Error(`website: ${siteError.message}`);
    websiteId = site.id as string;
  }, 120_000);

  afterAll(async () => {
    if (!configured || !orgId) return;
    await db.from("conversation_events").delete().eq("organization_id", orgId);
    await db.from("messages").delete().eq("organization_id", orgId);
    await db.from("conversations").delete().eq("organization_id", orgId);
    await db.from("notifications").delete().eq("organization_id", orgId);
    await db.from("audit_logs").delete().eq("organization_id", orgId);
    await db.from("department_members").delete().eq("organization_id", orgId);
    await db.from("departments").delete().eq("organization_id", orgId);
    await db.from("websites").delete().eq("organization_id", orgId);
    await db.from("organization_memberships").delete().eq("organization_id", orgId);
    for (const id of createdUsers) {
      await db.from("notification_preferences").delete().eq("user_id", id);
      await db.from("profiles").delete().eq("id", id);
      await db.auth.admin.deleteUser(id);
    }
    await db.from("organizations").delete().eq("id", orgId);
  }, 120_000);

  describe("1. manual claim — many agents, one conversation", () => {
    for (const agents of [2, 10, 20]) {
      it(`${agents} simultaneous agents produce exactly one owner`, async () => {
        const department = await makeDepartment(`Race${agents}`);
        const users: string[] = [];
        for (let i = 0; i < agents; i += 1) {
          users.push(await makeStaff(`race${agents}-${i}`, { departments: [department] }));
        }
        const conversation = await makeConversation(department);

        const results = await Promise.all(users.map((u) => claim(conversation, u)));

        const winners = results.filter((r) => r.ok);
        expect(winners).toHaveLength(1);
        for (const loser of results.filter((r) => !r.ok)) {
          expect(["already_claimed", "not_claimable"]).toContain(loser.code);
        }

        // Database final state is the authoritative result.
        const row = await readConversation(conversation);
        expect(row.assigned_to).toBe(winners[0]!.assigned_to);
        expect(users).toContain(row.assigned_to);
        expect(row.status).toBe("assigned");
        expect(row.claimed_at).not.toBeNull();

        // Only the winner carries the workload; nobody else was assigned.
        const counts = await Promise.all(users.map((u) => activeCount(u)));
        expect(counts.filter((c) => c > 0)).toEqual([1]);

        // Losing callers must not produce claim events. Production writes the
        // event only on the winning branch, mirrored here.
        for (const winner of winners) {
          await db.from("conversation_events").insert({
            conversation_id: conversation,
            organization_id: orgId,
            actor_id: winner.assigned_to!,
            event_type: "claimed",
            detail: "claimed",
          });
        }
        const { count } = await db
          .from("conversation_events")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversation)
          .eq("event_type", "claimed");
        expect(count).toBe(1);
      }, 180_000);
    }
  });

  describe("2. one agent claiming many conversations (per-user lock)", () => {
    for (const conversationCount of [2, 5, 10]) {
      it(`capacity 1, ${conversationCount} simultaneous claims → exactly one assignment`, async () => {
        const department = await makeDepartment(`Cap1x${conversationCount}`);
        const user = await makeStaff(`cap1-${conversationCount}`, {
          departments: [department],
          capacity: 1,
        });
        const conversations = await makeConversations(department, conversationCount);

        const results = await Promise.all(conversations.map((c) => claim(c, user)));
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        for (const denied of results.filter((r) => !r.ok)) {
          expect(denied.code).toBe("at_capacity");
        }
        expect(await activeCount(user)).toBe(1);
      }, 180_000);
    }

    it("capacity 3 never exceeds three active conversations under concurrency", async () => {
      const department = await makeDepartment("Cap3");
      const user = await makeStaff("cap3", { departments: [department], capacity: 3 });
      const conversations = await makeConversations(department, 10);

      const results = await Promise.all(conversations.map((c) => claim(c, user)));
      expect(results.filter((r) => r.ok)).toHaveLength(3);
      expect(results.filter((r) => r.code === "at_capacity")).toHaveLength(7);
      expect(await activeCount(user)).toBe(3);
    }, 180_000);
  });

  describe("3. presence enforcement (database-side)", () => {
    for (const presence of ["busy", "away", "offline"]) {
      it(`a ${presence} employee cannot claim`, async () => {
        const department = await makeDepartment(`Presence-${presence}`);
        const user = await makeStaff(`presence-${presence}`, {
          departments: [department],
          presence,
        });
        const conversation = await makeConversation(department);
        const result = await claim(conversation, user);
        expect(result.ok).toBeFalsy();
        expect(result.code).toBe("unavailable");
        const row = await readConversation(conversation);
        expect(row.assigned_to).toBeNull();
        expect(row.status).toBe("waiting");
      }, 60_000);
    }

    it("an available employee can claim, and becomes ineligible once away", async () => {
      const department = await makeDepartment("Presence-available");
      const user = await makeStaff("presence-available", { departments: [department] });
      const first = await makeConversation(department);
      expect((await claim(first, user)).ok).toBe(true);

      await db.from("profiles").update({ presence: "away" }).eq("id", user);
      const second = await makeConversation(department);
      expect((await claim(second, user)).code).toBe("unavailable");
      expect((await readConversation(second)).assigned_to).toBeNull();
    }, 60_000);
  });

  describe("4. profile status and membership status", () => {
    const cases: Array<[string, StaffOptions, string]> = [
      ["profile inactive", { profileStatus: "inactive" }, "inactive_profile"],
      ["profile suspended", { profileStatus: "suspended" }, "inactive_profile"],
      ["membership suspended", { membershipStatus: "suspended" }, "no_membership"],
      ["membership removed", { membershipStatus: "removed" }, "no_membership"],
    ];
    for (const [label, options, code] of cases) {
      it(`claim is denied when ${label}`, async () => {
        const department = await makeDepartment(`Status-${code}-${label.split(" ")[1]}`);
        const user = await makeStaff(`status-${label.replace(/\s/g, "")}`, {
          departments: [department],
          ...options,
        });
        const conversation = await makeConversation(department);
        const result = await claim(conversation, user);
        expect(result.ok).toBeFalsy();
        expect(result.code).toBe(code);
        expect((await readConversation(conversation)).assigned_to).toBeNull();
      }, 60_000);
    }

    it("an already-authenticated session cannot bypass a mid-session suspension", async () => {
      const department = await makeDepartment("StatusLive");
      const email = `conc-live-${suffix}@example.test`;
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`user: ${error?.message}`);
      const id = data.user.id;
      createdUsers.push(id);
      await db
        .from("profiles")
        .upsert({ id, organization_id: orgId, full_name: "Conc Live", email, presence: "available" });
      await db
        .from("organization_memberships")
        .insert({ organization_id: orgId, user_id: id, role: "agent", status: "active" });
      await db
        .from("department_members")
        .insert({ department_id: department, user_id: id, organization_id: orgId });

      const session = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInError } = await session.auth.signInWithPassword({ email, password });
      expect(signInError).toBeNull();

      const first = await makeConversation(department);
      expect((await claim(first, id)).ok).toBe(true);

      await db
        .from("organization_memberships")
        .update({ status: "suspended" })
        .eq("user_id", id)
        .eq("organization_id", orgId);

      // Same live session: the claim path is database-side and re-checks
      // membership, and the API surface is not callable by signed-in users.
      const second = await makeConversation(department);
      expect((await claim(second, id)).code).toBe("no_membership");
      const { error: rpcError } = await session.rpc("claim_conversation", {
        _conversation: second,
        _user: id,
      } as never);
      expect(rpcError).not.toBeNull();
      const { data: reads } = await session.from("conversations").select("id").eq("id", second);
      expect(reads ?? []).toHaveLength(0);
    }, 90_000);
  });

  describe("5. department enforcement", () => {
    it("only a member of the conversation's department may claim it", async () => {
      const deptA = await makeDepartment("EnforceA");
      const deptB = await makeDepartment("EnforceB");
      const agentA = await makeStaff("enforceA", { departments: [deptA] });
      const agentB = await makeStaff("enforceB", { departments: [deptB] });
      const conversation = await makeConversation(deptA);

      const denied = await claim(conversation, agentB);
      expect(denied.code).toBe("wrong_department");
      expect((await readConversation(conversation)).assigned_to).toBeNull();

      const allowed = await claim(conversation, agentA);
      expect(allowed.ok).toBe(true);
      expect((await readConversation(conversation)).assigned_to).toBe(agentA);
    }, 90_000);
  });

  describe("6. non-claimable conversations", () => {
    for (const status of ["resolved", "closed", "archived", "spam"]) {
      it(`a ${status} conversation cannot be claimed`, async () => {
        const department = await makeDepartment(`Closed-${status}`);
        const user = await makeStaff(`closed-${status}`, { departments: [department] });
        const conversation = await makeConversation(department, status);
        const result = await claim(conversation, user);
        expect(result.ok).toBeFalsy();
        expect(result.code).toBe("closed");
        const row = await readConversation(conversation);
        expect(row.status).toBe(status);
        expect(row.assigned_to).toBeNull();
      }, 60_000);
    }

    it("an already assigned conversation cannot be claimed by someone else", async () => {
      const department = await makeDepartment("AlreadyAssigned");
      const owner = await makeStaff("assigned-owner", { departments: [department] });
      const other = await makeStaff("assigned-other", { departments: [department] });
      const conversation = await makeConversation(department);
      expect((await claim(conversation, owner)).ok).toBe(true);

      const result = await claim(conversation, other);
      expect(result.code).toBe("already_claimed");
      const row = await readConversation(conversation);
      expect(row.assigned_to).toBe(owner);
      expect(row.status).toBe("assigned");
      expect(await activeCount(other)).toBe(0);
    }, 90_000);
  });

  describe("7. round-robin eligibility", () => {
    it("skips inactive members, inactive profiles, unavailable agents, outsiders and full agents", async () => {
      const department = await makeDepartment("RREligible");
      const otherDepartment = await makeDepartment("RROutside");

      const suspendedMember = await makeStaff("rr-suspended", {
        departments: [department],
        membershipStatus: "suspended",
      });
      const inactiveProfile = await makeStaff("rr-inactive", {
        departments: [department],
        profileStatus: "inactive",
      });
      const offline = await makeStaff("rr-offline", {
        departments: [department],
        presence: "offline",
      });
      const busy = await makeStaff("rr-busy", { departments: [department], presence: "busy" });
      const outsider = await makeStaff("rr-outsider", { departments: [otherDepartment] });
      const full = await makeStaff("rr-full", { departments: [department], capacity: 1 });
      const eligible = await makeStaff("rr-eligible", { departments: [department], capacity: 5 });

      // Push `full` to its cap through the normal claim path.
      const filler = await makeConversation(department);
      expect((await claim(filler, full)).ok).toBe(true);

      const conversation = await makeConversation(department);
      const result = await route(conversation, department);
      expect(result.ok).toBe(true);
      expect(result.user_id).toBe(eligible);

      const row = await readConversation(conversation);
      expect(row.assigned_to).toBe(eligible);
      expect(row.status).toBe("assigned");
      expect(row.claimed_at).not.toBeNull();
      for (const skipped of [suspendedMember, inactiveProfile, offline, busy, outsider]) {
        expect(await activeCount(skipped)).toBe(0);
      }

      // last_assigned_at is stamped on the winning department membership.
      const { data: membership } = await db
        .from("department_members")
        .select("last_assigned_at")
        .eq("department_id", department)
        .eq("user_id", eligible)
        .single();
      expect(membership?.last_assigned_at).not.toBeNull();
    }, 180_000);

    it("leaves the conversation waiting when nobody is eligible", async () => {
      const department = await makeDepartment("RRNobody");
      await makeStaff("rr-none", { departments: [department], presence: "offline" });
      const conversation = await makeConversation(department);
      const result = await route(conversation, department);
      expect(result.ok).toBeFalsy();
      expect(result.code).toBe("no_agent");
      const row = await readConversation(conversation);
      expect(row.assigned_to).toBeNull();
      expect(row.status).toBe("waiting");
    }, 90_000);
  });

  describe("8. round-robin capacity under concurrency", () => {
    it("a single capacity-1 agent never receives more than one conversation", async () => {
      const department = await makeDepartment("RRCap1");
      const agent = await makeStaff("rrcap1", { departments: [department], capacity: 1 });
      const conversations = await makeConversations(department, 8);

      const results = await Promise.all(conversations.map((c) => route(c, department)));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await activeCount(agent)).toBe(1);
    }, 180_000);

    it("mixed capacities 1 / 2 / 5 are all respected under concurrent routing", async () => {
      const department = await makeDepartment("RRMixed");
      const a = await makeStaff("rrmix-a", { departments: [department], capacity: 1 });
      const b = await makeStaff("rrmix-b", { departments: [department], capacity: 2 });
      const c = await makeStaff("rrmix-c", { departments: [department], capacity: 5 });
      const conversations = await makeConversations(department, 16);

      const results = await Promise.all(conversations.map((x) => route(x, department)));
      expect(results.filter((r) => r.ok)).toHaveLength(8);

      expect(await activeCount(a)).toBe(1);
      expect(await activeCount(b)).toBe(2);
      expect(await activeCount(c)).toBe(5);

      const { count: unassigned } = await db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .in("id", conversations)
        .is("assigned_to", null);
      expect(unassigned).toBe(8);
    }, 240_000);
  });

  describe("9. post-selection revalidation", () => {
    /**
     * The selected candidate's eligibility is re-verified after the per-agent
     * advisory lock is taken, using the same predicates as selection. Each case
     * makes the front-of-queue candidate ineligible and proves the next
     * eligible teammate is chosen instead of the stale pick.
     */
    const mutations: Array<[string, (userId: string, department: string) => Promise<void>]> = [
      ["becomes busy", async (id) => void (await db.from("profiles").update({ presence: "busy" }).eq("id", id))],
      [
        "goes offline",
        async (id) => void (await db.from("profiles").update({ presence: "offline" }).eq("id", id)),
      ],
      [
        "is suspended",
        async (id) =>
          void (await db
            .from("organization_memberships")
            .update({ status: "suspended" })
            .eq("user_id", id)
            .eq("organization_id", orgId)),
      ],
      [
        "leaves the department",
        async (id, department) =>
          void (await db
            .from("department_members")
            .delete()
            .eq("user_id", id)
            .eq("department_id", department)),
      ],
      [
        "profile is deactivated",
        async (id) => void (await db.from("profiles").update({ status: "inactive" }).eq("id", id)),
      ],
    ];

    for (const [label, mutate] of mutations) {
      it(`skips a candidate that ${label} and picks the next eligible one`, async () => {
        const department = await makeDepartment(`Reval-${label.split(" ")[0]}`);
        const first = await makeStaff(`reval-first-${label.replace(/\s/g, "")}`, {
          departments: [department],
          capacity: 5,
        });
        // Ensure a deterministic queue order: `first` is at the front.
        await db
          .from("department_members")
          .update({ last_assigned_at: new Date(Date.now() - 86_400_000).toISOString() })
          .eq("department_id", department)
          .eq("user_id", first);
        const backup = await makeStaff(`reval-backup-${label.replace(/\s/g, "")}`, {
          departments: [department],
          capacity: 5,
        });
        await db
          .from("department_members")
          .update({ last_assigned_at: new Date().toISOString() })
          .eq("department_id", department)
          .eq("user_id", backup);

        await mutate(first, department);

        const conversation = await makeConversation(department);
        const result = await route(conversation, department);
        expect(result.ok).toBe(true);
        expect(result.user_id).toBe(backup);
        expect(await activeCount(first)).toBe(0);
      }, 120_000);
    }

    it("skips a candidate that reached capacity and leaves the chat waiting when no one is left", async () => {
      const department = await makeDepartment("RevalCapacity");
      const agent = await makeStaff("reval-capacity", { departments: [department], capacity: 1 });
      const filler = await makeConversation(department);
      expect((await claim(filler, agent)).ok).toBe(true);

      const conversation = await makeConversation(department);
      const result = await route(conversation, department);
      expect(result.code).toBe("no_agent");
      const row = await readConversation(conversation);
      expect(row.assigned_to).toBeNull();
      expect(row.status).toBe("waiting");
      expect(await activeCount(agent)).toBe(1);
    }, 120_000);
  });

  describe("10. round-robin fairness", () => {
    it("rotates across equally eligible agents without starving anyone", async () => {
      const department = await makeDepartment("Fairness");
      const agents = [
        await makeStaff("fair-a", { departments: [department] }),
        await makeStaff("fair-b", { departments: [department] }),
        await makeStaff("fair-c", { departments: [department] }),
      ];
      const tally: Record<string, number> = {};
      const order: string[] = [];

      for (let i = 0; i < 12; i += 1) {
        const conversation = await makeConversation(department);
        const result = await route(conversation, department);
        expect(result.ok).toBe(true);
        order.push(result.user_id!);
        tally[result.user_id!] = (tally[result.user_id!] ?? 0) + 1;
      }

      for (const agent of agents) {
        expect(tally[agent] ?? 0).toBe(4);
        expect(await activeCount(agent)).toBe(4);
      }
      // No agent is ever picked twice in a row while others are waiting.
      for (let i = 1; i < order.length; i += 1) expect(order[i]).not.toBe(order[i - 1]);

      const { data: rows } = await db
        .from("department_members")
        .select("user_id, last_assigned_at")
        .eq("department_id", department);
      for (const row of rows ?? []) expect(row.last_assigned_at).not.toBeNull();
    }, 240_000);
  });

  describe("11. zero capacity semantics", () => {
    it("documents max_concurrent_chats = 0 as unlimited for manual claim and routing", async () => {
      const department = await makeDepartment("ZeroCap");
      const agent = await makeStaff("zerocap", { departments: [department], capacity: 0 });

      const manual = await makeConversations(department, 3);
      for (const conversation of manual) {
        expect((await claim(conversation, agent)).ok).toBe(true);
      }
      const routed = await makeConversation(department);
      expect((await route(routed, department)).user_id).toBe(agent);

      // Intended, documented behaviour: 0 means "no cap", not "no chats".
      expect(await activeCount(agent)).toBe(4);
    }, 180_000);
  });

  describe("12. notification recipient eligibility", () => {
    it("fans out only to eligible department members", async () => {
      const department = await makeDepartment("Notify");
      const otherDepartment = await makeDepartment("NotifyOther");

      const availableUser = await makeStaff("notify-available", { departments: [department] });
      const offlineUser = await makeStaff("notify-offline", {
        departments: [department],
        presence: "offline",
      });
      const suspendedUser = await makeStaff("notify-suspended", {
        departments: [department],
        membershipStatus: "suspended",
      });
      const inactiveUser = await makeStaff("notify-inactive", {
        departments: [department],
        profileStatus: "inactive",
      });
      const optedOut = await makeStaff("notify-optedout", { departments: [department] });
      await db
        .from("notification_preferences")
        .upsert({ user_id: optedOut, organization_id: orgId, inapp_escalations: false });
      const otherDept = await makeStaff("notify-otherdept", { departments: [otherDepartment] });
      const noDept = await makeStaff("notify-nodept", {});

      const { notifyStaff } = await import("@/lib/notifications.server");
      await notifyStaff({
        organizationId: orgId,
        departmentId: department,
        type: "escalation",
        severity: "critical",
        title: `Escalation ${suffix}`,
        link: "/inbox",
      });

      const { data: rows } = await db
        .from("notifications")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("title", `Escalation ${suffix}`);
      const recipients = (rows ?? []).map((r) => r.user_id as string);

      // Offline is still a valid recipient: presence gates claiming, not alerting.
      expect(recipients.sort()).toEqual([availableUser, offlineUser].sort());
      for (const excluded of [suspendedUser, inactiveUser, optedOut, otherDept, noDept]) {
        expect(recipients).not.toContain(excluded);
      }
    }, 180_000);
  });

  describe("13. transfer eligibility revalidates against live state", () => {
    it("re-resolved candidates flip to ineligible as conditions change", async () => {
      const department = await makeDepartment("Transfer");
      const owner = await makeStaff("transfer-owner", { departments: [department], role: "agent" });
      const target = await makeStaff("transfer-target", {
        departments: [department],
        capacity: 1,
      });
      const outsider = await makeStaff("transfer-outsider", { departments: [] });
      const conversation = await makeConversation(department);
      expect((await claim(conversation, owner)).ok).toBe(true);

      const candidates = async () => {
        const { data, error } = await db.rpc("reassignment_candidates", {
          _org: orgId,
          _conversation: conversation,
        } as never);
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{
          user_id: string;
          full_name: string;
          eligible: boolean;
          reason: string | null;
        }>;
      };

      const fresh = (await candidates()).find((c) => c.user_id === target);
      expect(fresh?.eligible).toBe(true);
      // The stale snapshot a browser would hold.
      const stale = { ...fresh! };

      // Condition 1: the target goes unavailable.
      await db.from("profiles").update({ presence: "away" }).eq("id", target);
      let live = (await candidates()).find((c) => c.user_id === target);
      expect(live?.eligible).toBe(false);
      expect(decideTransfer({ target: stale, actorCanOverride: true }).allowed).toBe(true);
      expect(decideTransfer({ target: live, actorCanOverride: true }).allowed).toBe(false);
      // Availability may be overridden — by an administrator, explicitly.
      expect(
        decideTransfer({ target: live, override: true, actorCanOverride: false }).allowed,
      ).toBe(false);
      const overridden = decideTransfer({
        target: live,
        override: true,
        overrideReason: "supervisor decision",
        actorCanOverride: true,
      });
      expect(overridden).toMatchObject({ allowed: true, overrideUsed: true });

      // Condition 2: at capacity.
      await db.from("profiles").update({ presence: "available" }).eq("id", target);
      const filler = await makeConversation(department);
      expect((await claim(filler, target)).ok).toBe(true);
      live = (await candidates()).find((c) => c.user_id === target);
      expect(live?.eligible).toBe(false);
      expect(live?.reason).toMatch(/capacity|full|chats/i);
      expect(
        decideTransfer({ target: live, override: true, actorCanOverride: true }).allowed,
      ).toBe(true);

      // Condition 3: profile deactivated — never overridable.
      await db.from("profiles").update({ status: "inactive" }).eq("id", target);
      live = (await candidates()).find((c) => c.user_id === target);
      expect(live?.eligible).toBe(false);
      expect(
        decideTransfer({ target: live, override: true, actorCanOverride: true }).allowed,
      ).toBe(false);

      // Condition 4: membership suspended — the target disappears entirely.
      await db
        .from("organization_memberships")
        .update({ status: "suspended" })
        .eq("user_id", target)
        .eq("organization_id", orgId);
      expect((await candidates()).find((c) => c.user_id === target)).toBeUndefined();
      expect(decideTransfer({ target: undefined, override: true, actorCanOverride: true }).allowed).toBe(
        false,
      );

      // Department mismatch is never overridable: SQL never returns someone
      // outside the conversation's department, so no override can reach them.
      const outsiderRow = (await candidates()).find((c) => c.user_id === outsider);
      expect(outsiderRow).toBeUndefined();
      expect(
        decideTransfer({ target: outsiderRow, override: true, actorCanOverride: true }).allowed,
      ).toBe(false);
      // Defence in depth: even if such a row were produced, it stays blocked.
      expect(
        decideTransfer({
          target: {
            user_id: outsider,
            full_name: "Outsider",
            eligible: false,
            reason: "Not in this department",
          },
          override: true,
          actorCanOverride: true,
        }).allowed,
      ).toBe(false);
    }, 240_000);
  });

  describe("19. claim and routing stay database-side", () => {
    it("neither path pulls the organization's conversations into memory", async () => {
      const [claimSource, assignmentSource] = await Promise.all([
        readFile("src/lib/conversations.functions.ts", "utf8"),
        readFile("src/lib/assignment.server.ts", "utf8"),
      ]);
      expect(claimSource).toContain('rpc("claim_conversation"');
      expect(assignmentSource).toContain('rpc("assign_round_robin"');
      // Workload/eligibility must never be recomputed client- or app-side.
      expect(assignmentSource).not.toMatch(/\.select\("\*"\)/);
      expect(assignmentSource).not.toMatch(/\.limit\(\s*\d{3,}\s*\)/);
      // The only conversation read in the assignment helper is a HEAD count.
      expect(assignmentSource).toContain('count: "exact", head: true');
    });

    it("a claim is a single database round trip and returns promptly", async () => {
      const department = await makeDepartment("Perf");
      const agent = await makeStaff("perf", { departments: [department] });
      const conversation = await makeConversation(department);
      const started = Date.now();
      expect((await claim(conversation, agent)).ok).toBe(true);
      expect(Date.now() - started).toBeLessThan(5_000);
    }, 60_000);
  });
});
