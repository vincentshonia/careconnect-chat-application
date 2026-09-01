import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { reportScopeFor, canRunSection, NO_DEPARTMENT } from "@/lib/report-scope";

/**
 * Phase 3 scale & reconciliation tests.
 *
 * These run against the real database with a high-volume ephemeral tenant
 * (2,000+ conversations) and prove three things that unit tests cannot:
 *
 *  1. Pagination is exact — the reported total matches reality, and walking
 *     every page yields every record exactly once, in a deterministic order.
 *  2. Every headline number reconciles with the drill-down behind it.
 *  3. The AI-only completion rate only credits conversations the assistant
 *     genuinely finished alone.
 *
 * All fixtures are ephemeral and removed in `afterAll`.
 */
const url = process.env['SUPABASE_URL'] ?? "";
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? "";
const configured = Boolean(url && serviceKey);

const db = configured
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : (null as unknown as SupabaseClient);

const suffix = Math.random().toString(36).slice(2, 8);

/** Total seeded conversations in the primary tenant. */
const VOLUME = 2_000;
/** Conversations seeded in a second tenant that must never appear. */
const OTHER_VOLUME = 60;

let orgA = "";
let orgB = "";
let siteA = "";
let siteB = "";
let deptOne = "";
let deptTwo = "";
let from = "";
let to = "";

type Rpc = Record<string, unknown>;

async function rpc<T>(fn: string, args: Rpc): Promise<T> {
  const { data, error } = await db.rpc(fn, args as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function insertBatched(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 500) as never);
    if (error) throw new Error(`${table} insert: ${error.message}`);
  }
}

async function makeOrg(name: string) {
  const { data, error } = await db
    .from("organizations")
    .insert({ name: `${name} ${suffix}`, slug: `${name.toLowerCase()}-${suffix}` })
    .select("id")
    .single();
  if (error) throw new Error(`org: ${error.message}`);
  return data.id as string;
}

async function makeWebsite(org: string, name: string) {
  const { data, error } = await db
    .from("websites")
    .insert({ organization_id: org, name: `${name} ${suffix}`, domain: `${name}-${suffix}.test` })
    .select("id")
    .single();
  if (error) throw new Error(`website: ${error.message}`);
  return data.id as string;
}

async function makeDepartment(org: string, name: string) {
  const { data, error } = await db
    .from("departments")
    .insert({ organization_id: org, name: `${name} ${suffix}` })
    .select("id")
    .single();
  if (error) throw new Error(`department: ${error.message}`);
  return data.id as string;
}

/** Deterministic shape for the bulk rows so every expectation is exact. */
const STATUS_CYCLE = ["new", "waiting", "active", "resolved", "closed"] as const;

function baseFilters() {
  return {
    _org: orgA,
    _from: from,
    _to: to,
    _dept: null as string[] | null,
    _staff: null as string[] | null,
    _statuses: null as string[] | null,
    _website: null as string | null,
    _type: "all",
    _transfer: "all",
    _priority: null as string | null,
  };
}

async function tickets(overrides: Rpc = {}) {
  return rpc<{ total: number; rows: Record<string, unknown>[] }>("report_tickets", {
    ...baseFilters(),
    _sla: 15,
    _flag: "all",
    _sort: "created_at",
    _dir: "desc",
    _limit: 50,
    _offset: 0,
    ...overrides,
  });
}

describe.runIf(configured)("reporting at volume", () => {
  beforeAll(async () => {
    orgA = await makeOrg("ScaleA");
    orgB = await makeOrg("ScaleB");
    siteA = await makeWebsite(orgA, "scalea");
    siteB = await makeWebsite(orgB, "scaleb");
    deptOne = await makeDepartment(orgA, "Enrollment");
    deptTwo = await makeDepartment(orgA, "Referrals");

    // Everything is seeded inside a fixed, closed window so the reporting
    // range can never drift while the suite runs.
    const anchor = Date.UTC(2025, 0, 15, 12, 0, 0);
    from = new Date(anchor - 60 * 86_400_000).toISOString();
    to = new Date(anchor + 60 * 86_400_000).toISOString();

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < VOLUME; i += 1) {
      const status = STATUS_CYCLE[i % STATUS_CYCLE.length]!;
      const created = new Date(anchor - i * 60_000).toISOString();
      const escalated = i % 4 === 0;
      const transfers = i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0;
      rows.push({
        organization_id: orgA,
        website_id: siteA,
        department_id: i % 2 === 0 ? deptOne : deptTwo,
        reference: `SC-${suffix}-${String(i).padStart(5, "0")}`,
        status,
        // Every bulk row shares one timestamp per minute; ties are what expose
        // an unstable sort, so they are deliberately present.
        created_at: created,
        last_message_at: created,
        escalation_requested: escalated,
        first_human_requested_at: escalated ? created : null,
        transfer_count: transfers,
        reopened_count: i % 20 === 0 ? 1 : 0,
        resolved_at: status === "resolved" ? created : null,
        closed_at: status === "closed" ? created : null,
      });
    }
    await insertBatched("conversations", rows);

    const others: Record<string, unknown>[] = [];
    for (let i = 0; i < OTHER_VOLUME; i += 1) {
      const created = new Date(anchor - i * 60_000).toISOString();
      others.push({
        organization_id: orgB,
        website_id: siteB,
        reference: `SB-${suffix}-${String(i).padStart(5, "0")}`,
        status: "resolved",
        created_at: created,
        last_message_at: created,
        resolved_at: created,
      });
    }
    await insertBatched("conversations", others);
  }, 180_000);

  afterAll(async () => {
    if (!configured) return;
    for (const org of [orgA, orgB].filter(Boolean)) {
      await db.from("ai_responses").delete().eq("organization_id", org);
      await db.from("messages").delete().eq("organization_id", org);
      await db.from("conversation_events").delete().eq("organization_id", org);
      await db.from("conversations").delete().eq("organization_id", org);
      await db.from("departments").delete().eq("organization_id", org);
      await db.from("websites").delete().eq("organization_id", org);
      await db.from("organizations").delete().eq("id", org);
    }
  }, 240_000);

  it("reports the exact total for the tenant", async () => {
    const page = await tickets();
    expect(page.total).toBe(VOLUME);
    expect(page.rows).toHaveLength(50);
  });

  it("pages through every record exactly once, with no duplicates or skips", async () => {
    const limit = 500;
    const seen: string[] = [];
    for (let offset = 0; offset < VOLUME; offset += limit) {
      const page = await tickets({ _limit: limit, _offset: offset });
      expect(page.total).toBe(VOLUME);
      expect(page.rows).toHaveLength(Math.min(limit, VOLUME - offset));
      for (const row of page.rows) seen.push(String(row['id']));
    }
    expect(seen).toHaveLength(VOLUME);
    expect(new Set(seen).size).toBe(VOLUME);
  }, 240_000);

  it("orders deterministically across repeated reads", async () => {
    const a = await tickets({ _limit: 100, _offset: 300, _sort: "status", _dir: "asc" });
    const b = await tickets({ _limit: 100, _offset: 300, _sort: "status", _dir: "asc" });
    expect(a.rows.map((r) => r['id'])).toEqual(b.rows.map((r) => r['id']));
  });

  it("combines a filter with pagination without losing rows", async () => {
    const expected = VOLUME / STATUS_CYCLE.length; // one status in five
    const first = await tickets({ _statuses: ["resolved"], _limit: 100, _offset: 0 });
    expect(first.total).toBe(expected);

    const seen = new Set<string>();
    for (let offset = 0; offset < expected; offset += 200) {
      const page = await tickets({ _statuses: ["resolved"], _limit: 200, _offset: offset });
      for (const row of page.rows) {
        expect(row['status']).toBe("resolved");
        seen.add(String(row['id']));
      }
    }
    expect(seen.size).toBe(expected);
  }, 120_000);

  it("returns an empty page — never a wrapped one — past the last page", async () => {
    const page = await tickets({ _limit: 50, _offset: VOLUME + 500 });
    expect(page.total).toBe(VOLUME);
    expect(page.rows).toHaveLength(0);
  });

  it("never returns another tenant's conversations", async () => {
    const page = await tickets({ _limit: 500 });
    expect(page.rows.every((r) => String(r['reference']).startsWith(`SC-${suffix}`))).toBe(true);
    const other = await tickets({ _org: orgB, _limit: 5 });
    expect(other.total).toBe(OTHER_VOLUME);
  });

  it("clamps a department filter to the requested department only", async () => {
    const one = await tickets({ _dept: [deptOne], _limit: 5 });
    const two = await tickets({ _dept: [deptTwo], _limit: 5 });
    expect(one.total + two.total).toBe(VOLUME);
    expect(one.total).toBe(VOLUME / 2);
  });

  it("returns nothing for a scope with no departments", async () => {
    const none = await tickets({ _dept: [NO_DEPARTMENT], _limit: 5 });
    expect(none.total).toBe(0);
  });

  /* ------------------------- KPI ↔ drill-down parity ------------------------ */

  it("overview counts reconcile exactly with the ticket drill-downs", async () => {
    const overview = await rpc<{ kpis: Record<string, unknown>; funnel: Record<string, unknown> }>(
      "report_overview",
      { ...baseFilters(), _sla: 15 },
    );
    const k = overview.kpis;

    for (const [kpi, flag] of [
      ["escalated", "escalated"],
      ["completed", "completed"],
      ["resolved", "resolved"],
      ["closed", "closed"],
      ["transferred", "transferred"],
      ["multi_transferred", "multi_transfer"],
      ["reopened", "reopened"],
    ] as const) {
      const drill = await tickets({ _flag: flag, _limit: 1 });
      expect(drill.total, `${kpi} must equal the ${flag} drill-down`).toBe(Number(k[kpi]));
    }
  }, 120_000);

  it("counts unique transferred conversations, not transfer events", async () => {
    const once = await tickets({ _transfer: "once", _limit: 1 });
    const multi = await tickets({ _transfer: "multi", _limit: 1 });
    const any = await tickets({ _flag: "transferred", _limit: 1 });
    // 1 in 10 rows carries two transfers and another 1 in 10 carries one, so
    // the event total is strictly larger than the conversation total.
    expect(any.total).toBe(once.total + multi.total);
    const events = once.total + multi.total * 2;
    expect(events).toBeGreaterThan(any.total);
  });

  it("separates resolved, closed and completed", async () => {
    const resolved = await tickets({ _flag: "resolved", _limit: 1 });
    const closed = await tickets({ _flag: "closed", _limit: 1 });
    const completed = await tickets({ _flag: "completed", _limit: 1 });
    expect(resolved.total).toBeGreaterThan(0);
    expect(closed.total).toBeGreaterThan(0);
    expect(completed.total).toBe(resolved.total + closed.total);
  });
});

/* ------------------------------ AI completion ------------------------------ */

describe.runIf(configured)("AI-only completion", () => {
  const cases: Record<string, string> = {};
  let aiOrg = "";
  let aiSite = "";
  let aiDeptOne = "";
  let aiDeptTwo = "";
  let aiFrom = "";
  let aiTo = "";

  async function conversation(key: string, patch: Record<string, unknown>, department = aiDeptOne) {
    const created = new Date(Date.UTC(2025, 5, 10, 12, 0, 0)).toISOString();
    const { data, error } = await db
      .from("conversations")
      .insert({
        organization_id: aiOrg,
        website_id: aiSite,
        department_id: department,
        reference: `AI-${suffix}-${key}`,
        created_at: created,
        last_message_at: created,
        ...patch,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(`ai conversation ${key}: ${error.message}`);
    const id = (data as { id: string }).id;
    cases[key] = id;
    const { error: answerError } = await db.from("ai_responses").insert({
      organization_id: aiOrg,
      website_id: aiSite,
      conversation_id: id,
      question: `Question ${key}`,
      answer: `Answer ${key}`,
    } as never);
    if (answerError) throw new Error(`ai answer ${key}: ${answerError.message}`);
    return id;
  }

  beforeAll(async () => {
    aiOrg = await makeOrg("ScaleAI");
    aiSite = await makeWebsite(aiOrg, "scaleai");
    aiDeptOne = await makeDepartment(aiOrg, "AI One");
    aiDeptTwo = await makeDepartment(aiOrg, "AI Two");
    aiFrom = new Date(Date.UTC(2025, 4, 1)).toISOString();
    aiTo = new Date(Date.UTC(2025, 6, 1)).toISOString();

    const done = new Date(Date.UTC(2025, 5, 10, 12, 30, 0)).toISOString();

    await conversation("completed", { status: "resolved", resolved_at: done });
    await conversation("unresolved", { status: "active" });
    await conversation("abandoned", { status: "waiting" });
    await conversation("spam", { status: "spam" });
    await conversation("agentmsg", { status: "resolved", resolved_at: done });
    await conversation("humanreq", { status: "resolved", resolved_at: done });
    await conversation("otherdept", { status: "resolved", resolved_at: done }, aiDeptTwo);

    const { error: messageError } = await db.from("messages").insert({
      organization_id: aiOrg,
      website_id: aiSite,
      conversation_id: cases['agentmsg'],
      sender_type: "agent",
      body: "Following up personally.",
    } as never);
    if (messageError) throw new Error(`agent message: ${messageError.message}`);

    const { error: eventError } = await db.from("conversation_events").insert({
      organization_id: aiOrg,
      conversation_id: cases['humanreq'],
      event_type: "human_requested",
      detail: "Visitor asked for a person",
    } as never);
    if (eventError) throw new Error(`human request event: ${eventError.message}`);
  }, 120_000);

  afterAll(async () => {
    if (!configured || !aiOrg) return;
    await db.from("ai_responses").delete().eq("organization_id", aiOrg);
    await db.from("messages").delete().eq("organization_id", aiOrg);
    await db.from("conversation_events").delete().eq("organization_id", aiOrg);
    await db.from("conversations").delete().eq("organization_id", aiOrg);
    await db.from("departments").delete().eq("organization_id", aiOrg);
    await db.from("websites").delete().eq("organization_id", aiOrg);
    await db.from("organizations").delete().eq("id", aiOrg);
  }, 120_000);

  async function ai(dept: string[] | null = null) {
    return rpc<Record<string, unknown>>("report_ai", {
      _org: aiOrg,
      _from: aiFrom,
      _to: aiTo,
      _dept: dept,
      _website: null,
    });
  }

  it("only credits a completed, human-free conversation", async () => {
    const d = await ai();
    // completed, unresolved, abandoned, agentmsg, humanreq, otherdept — spam excluded.
    expect(Number(d['eligible'])).toBe(6);
    expect(Number(d['ai_only_completed'])).toBe(2); // completed + otherdept
    expect(Number(d['excluded'])).toBe(1);
  });

  it("does not count an unresolved AI conversation as a completion", async () => {
    const d = await ai();
    expect(Number(d['ai_unresolved'])).toBe(2); // unresolved + abandoned
  });

  it("disqualifies a conversation with a historical agent message", async () => {
    const touched = await rpc<boolean>("conversation_human_touched", { _id: cases['agentmsg'] });
    expect(touched).toBe(true);
  });

  it("disqualifies a conversation with a human-request event", async () => {
    const touched = await rpc<boolean>("conversation_human_touched", { _id: cases['humanreq'] });
    expect(touched).toBe(true);
  });

  it("leaves a purely AI conversation untouched by humans", async () => {
    const touched = await rpc<boolean>("conversation_human_touched", { _id: cases['completed'] });
    expect(touched).toBe(false);
  });

  it("scopes to a department", async () => {
    const one = await ai([aiDeptOne]);
    const two = await ai([aiDeptTwo]);
    expect(Number(one['ai_only_completed'])).toBe(1);
    expect(Number(two['ai_only_completed'])).toBe(1);
    expect(Number(two['eligible'])).toBe(1);
  });

  it("returns no rate at all when there is nothing to measure", async () => {
    const empty = await rpc<Record<string, unknown>>("report_ai", {
      _org: aiOrg,
      _from: new Date(Date.UTC(2020, 0, 1)).toISOString(),
      _to: new Date(Date.UTC(2020, 1, 1)).toISOString(),
      _dept: null,
      _website: null,
    });
    expect(Number(empty['eligible'])).toBe(0);
    expect(empty['ai_only_completion_rate']).toBeNull();
    expect(empty['escalation_rate']).toBeNull();
  });
});

/* ---------------------------- scope reconciliation -------------------------- */

describe("reporting scope cannot be widened from the client", () => {
  const org = "11111111-1111-1111-1111-111111111111";
  const me = "22222222-2222-2222-2222-222222222222";
  const myDept = "33333333-3333-3333-3333-333333333333";

  it("confines a standard user to their own records", () => {
    const scope = reportScopeFor({
      userId: me,
      organizationId: org,
      departmentIds: [myDept],
      permissions: new Set(["reports.self"]),
    });
    expect(scope.level).toBe("self");
    expect(scope.staffIds).toEqual([me]);
    expect(scope.departmentIds).toEqual([myDept]);
    expect(canRunSection(scope, "transfers")).toBe(false);
  });

  it("confines a team lead to their departments but not to one person", () => {
    const scope = reportScopeFor({
      userId: me,
      organizationId: org,
      departmentIds: [myDept],
      permissions: new Set(["reports.team"]),
    });
    expect(scope.level).toBe("team");
    expect(scope.departmentIds).toEqual([myDept]);
    expect(scope.staffIds).toBeNull();
  });

  it("gives an administrator the whole organization and nothing beyond it", () => {
    const scope = reportScopeFor({
      userId: me,
      organizationId: org,
      departmentIds: [],
      permissions: new Set(["reports.organization"]),
    });
    expect(scope.level).toBe("organization");
    expect(scope.departmentIds).toBeNull();
    expect(scope.organizationId).toBe(org);
  });

  it("gives a caller with no reporting permission nothing", () => {
    const scope = reportScopeFor({
      userId: me,
      organizationId: org,
      departmentIds: [myDept],
      permissions: new Set<string>(),
    });
    expect(scope.staffIds).toEqual([]);
    expect(scope.departmentIds).toEqual([]);
  });
});
