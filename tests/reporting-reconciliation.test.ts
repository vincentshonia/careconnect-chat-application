import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { reportScopeFor, canRunSection, NO_DEPARTMENT } from "@/lib/report-scope";
import {
  captureProtectedBaseline,
  purgeSyntheticOrganizations,
  purgeSyntheticUsers,
  readProtectedBaseline,
  requireTestBackend,
  syntheticEmail,
  syntheticName,
  type ProtectedBaseline,
} from "./helpers/required-env";


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
const { url, serviceKey } = requireTestBackend();
const configured = true;

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as SupabaseClient;

const suffix = Math.random().toString(36).slice(2, 8);

/**
 * The live tenant is read once before anything is created and re-read at the
 * end: these suites write into the same backend, so the proof that they were
 * harmless is that its row counts never moved.
 */
let baseline: ProtectedBaseline | null = null;

beforeAll(async () => {
  baseline = await captureProtectedBaseline(db);
  expect(baseline.organizationId).toBeTruthy();
}, 120_000);

afterAll(async () => {
  if (!baseline) return;
  const after = await readProtectedBaseline(db, baseline);
  expect(after.conversations).toBe(baseline.conversations);
  expect(after.contacts).toBe(baseline.contacts);
  expect(after.memberships).toBe(baseline.memberships);
}, 120_000);

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

/**
 * The test database is a shared, modestly sized instance: a burst of bulk
 * writes can momentarily exhaust its connection pool. Those failures are
 * transient infrastructure noise rather than product defects, so every call
 * retries with backoff before it is allowed to fail the suite.
 */
// "Could not query the database for the schema cache" is PostgREST reporting
// that it momentarily lost its own connection to Postgres under bulk-write
// load — the same transient class as a pool timeout, not a product defect.
const TRANSIENT =
  /connection pool|timeout|timed out|fetch failed|socket|schema cache|502|503|504/i;

async function attempt<T>(label: string, run: () => Promise<{ data: unknown; error: { message: string } | null }>) {
  let last = "";
  for (let tries = 0; tries < 8; tries += 1) {
    const { data, error } = await run();
    if (!error) return data as T;
    last = error.message;
    if (!TRANSIENT.test(last)) break;
    // Exponential backoff: the shared pool needs real time to drain, and a
    // tight retry loop only deepens the contention that caused the timeout.
    await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 500 * 2 ** tries)));
  }
  throw new Error(`${label}: ${last}`);
}

async function rpc<T>(fn: string, args: Rpc): Promise<T> {
  return attempt<T>(fn, () => db.rpc(fn, args as never));
}

async function insertBatched(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    // Rows carry client-generated ids and are upserted, so a retry after a
    // timed-out-but-applied write can never duplicate a fixture row.
    await attempt(`${table} insert`, () =>
      db.from(table).upsert(slice as never, { onConflict: "id", ignoreDuplicates: true }));
    // A short pause between batches keeps the shared pool from saturating.
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}


async function makeOrg(name: string) {
  const orgName = syntheticName(name, suffix);
  const { data, error } = await db
    .from("organizations")
    .insert({ name: orgName, slug: orgName.toLowerCase() })
    .select("id")
    .single();
  if (error) throw new Error(`org: ${error.message}`);
  return data.id as string;
}

async function makeWebsite(org: string, name: string) {
  const { data, error } = await db
    .from("websites")
    .insert({
      organization_id: org,
      name: syntheticName(name, suffix),
      domain: `${name.toLowerCase()}-${suffix}.test`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`website: ${error.message}`);
  return data.id as string;
}

async function makeDepartment(org: string, name: string) {
  const { data, error } = await db
    .from("departments")
    .insert({ organization_id: org, name: syntheticName(name, suffix) })
    .select("id")
    .single();
  if (error) throw new Error(`department: ${error.message}`);
  return data.id as string;
}

/**
 * An owner for the rows that are being worked on. The database now insists a
 * live conversation has somebody's name on it, so the fixtures say who.
 */
async function makeOwner(org: string, key: string) {
  const email = syntheticEmail(`owner_${key}`, suffix);
  const fullName = syntheticName(`owner_${key}`, suffix);
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `Cc!${suffix}Aa1${key}`,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`owner ${key}: ${error?.message}`);
  const id = data.user.id;
  await db.from("profiles").upsert({
    id,
    organization_id: org,
    full_name: fullName,
    email,
    presence: "available",
  } as never);
  await db
    .from("organization_memberships")
    .insert({ organization_id: org, user_id: id, role: "agent", status: "active" } as never);
  return id;
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

describe("reporting at volume", () => {
  beforeAll(async () => {
    try {
      orgA = await makeOrg("ScaleA");
      orgB = await makeOrg("ScaleB");
      siteA = await makeWebsite(orgA, "scalea");
      siteB = await makeWebsite(orgB, "scaleb");
      deptOne = await makeDepartment(orgA, "Enrollment");
      deptTwo = await makeDepartment(orgA, "Referrals");
      const owner = await makeOwner(orgA, "bulk");

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
          id: randomUUID(),
          organization_id: orgA,
          website_id: siteA,
          department_id: i % 2 === 0 ? deptOne : deptTwo,
          reference: `SC-${suffix}-${String(i).padStart(5, "0")}`,
          status,
          // A conversation being worked on must name its owner.
          assigned_to: status === "active" ? owner : null,
          claimed_at: status === "active" ? created : null,

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
          id: randomUUID(),
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

      // A bulk load leaves the planner's statistics stale, which makes the
      // reporting queries pick pathological plans until autovacuum catches up.
      await db.rpc("refresh_report_statistics" as never);
    } catch (error) {
      // A half-built fixture is exactly what gets left behind otherwise.
      await purgeSyntheticOrganizations(db, [orgA, orgB]);
      throw error;
    }
  }, 900_000);

  afterAll(async () => {
    if (!configured) return;
    await purgeSyntheticOrganizations(db, [orgA, orgB]);
  }, 240_000);

  it("reports the exact total for the tenant", async () => {
    const page = await tickets();
    expect(page.total).toBe(VOLUME);
    expect(page.rows).toHaveLength(50);
  }, 240_000);


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
    // Walking the entire 2,000-row tenant in 500-row pages is the slowest read
    // in the suite; the sandbox needs a wider wall-clock budget than the other
    // volume tests. The assertions — every row seen once, none skipped — stand.
  }, 600_000);

  it("orders deterministically across repeated reads", async () => {
    const a = await tickets({ _limit: 100, _offset: 300, _sort: "status", _dir: "asc" });
    const b = await tickets({ _limit: 100, _offset: 300, _sort: "status", _dir: "asc" });
    expect(a.rows.map((r) => r['id'])).toEqual(b.rows.map((r) => r['id']));
    // Same sandbox allowance as the other volume reads in this suite; the
    // assertions are unchanged — only the wall-clock budget matches its peers.
  }, 240_000);


  it("combines a filter with pagination without losing rows", async () => {
    const expected = VOLUME / STATUS_CYCLE.length; // one status in five
    const first = await tickets({ _statuses: ["resolved"], _limit: 100, _offset: 0 });
    expect(first.total).toBe(expected);

    const seen = new Set<string>();
    for (let offset = 0; offset < expected; offset += 100) {
      const page = await tickets({ _statuses: ["resolved"], _limit: 100, _offset: offset });
      for (const row of page.rows) {
        expect(row['status']).toBe("resolved");
        seen.add(String(row['id']));
      }
    }
    expect(seen.size).toBe(expected);
  }, 240_000);

  it("returns an empty page — never a wrapped one — past the last page", async () => {
    const page = await tickets({ _limit: 50, _offset: VOLUME + 500 });
    expect(page.total).toBe(VOLUME);
    expect(page.rows).toHaveLength(0);
  });

  it("never returns another tenant's conversations", async () => {
    const page = await tickets({ _limit: 100 });
    expect(page.rows.every((r) => String(r['reference']).startsWith(`SC-${suffix}`))).toBe(true);
    const other = await tickets({ _org: orgB, _limit: 5 });
    expect(other.total).toBe(OTHER_VOLUME);
  }, 240_000);


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

describe("AI-only completion", () => {
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
    try {
      aiOrg = await makeOrg("ScaleAI");
      aiSite = await makeWebsite(aiOrg, "scaleai");
      aiDeptOne = await makeDepartment(aiOrg, "AI One");
      aiDeptTwo = await makeDepartment(aiOrg, "AI Two");
      aiFrom = new Date(Date.UTC(2025, 4, 1)).toISOString();
      aiTo = new Date(Date.UTC(2025, 6, 1)).toISOString();

      const done = new Date(Date.UTC(2025, 5, 10, 12, 30, 0)).toISOString();
      const aiOwner = await makeOwner(aiOrg, "ai");

      await conversation("completed", { status: "resolved", resolved_at: done });
      await conversation("unresolved", { status: "active", assigned_to: aiOwner, claimed_at: done });

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
    } catch (error) {
      // A half-built fixture is exactly what gets left behind otherwise.
      await purgeSyntheticOrganizations(db, [aiOrg]);
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    if (!configured || !aiOrg) return;
    await purgeSyntheticOrganizations(db, [aiOrg]);
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

/* ----------------------- calendar days follow the org clock ---------------- */

describe("report days follow the organization timezone", () => {
  let tzOrg = "";
  let tzSite = "";

  // 2025-06-10 23:30 Pacific is already 2025-06-11 in UTC. The report must
  // count it on the Pacific day the visitor actually wrote on.
  const created = new Date(Date.UTC(2025, 5, 11, 6, 30, 0)).toISOString();

  beforeAll(async () => {
    try {
      tzOrg = await makeOrg("ScaleTZ");
      tzSite = await makeWebsite(tzOrg, "scaletz");
      const { error } = await db.from("conversations").insert({
        organization_id: tzOrg,
        website_id: tzSite,
        reference: `TZ-${suffix}-1`,
        created_at: created,
        last_message_at: created,
        status: "resolved",
      } as never);
      if (error) throw new Error(`tz conversation: ${error.message}`);
    } catch (error) {
      // A half-built fixture is exactly what gets left behind otherwise.
      await purgeSyntheticOrganizations(db, [tzOrg]);
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    if (!configured || !tzOrg) return;
    await purgeSyntheticOrganizations(db, [tzOrg]);
  }, 120_000);

  async function volume(tz: string) {
    return rpc<Record<string, unknown>>("report_volume", {
      _org: tzOrg,
      _from: new Date(Date.UTC(2025, 5, 1)).toISOString(),
      _to: new Date(Date.UTC(2025, 6, 1)).toISOString(),
      _dept: null,
      _staff: null,
      _statuses: null,
      _website: null,
      _type: null,
      _transfer: null,
      _priority: null,
      _tz: tz,
    });
  }

  it("counts a 23:30 Pacific conversation on the Pacific day", async () => {
    const d = await volume("America/Los_Angeles");
    const days = d['by_day'] as { day: string; conversations: number }[];
    expect(days.map((r) => r.day)).toEqual(["2025-06-10"]);
    expect(Number(days[0]!.conversations)).toBe(1);
    expect(d['peak_day']).toBe("2025-06-10");
  });

  it("buckets the hour on the Pacific clock too", async () => {
    const d = await volume("America/Los_Angeles");
    const hours = d['by_hour'] as { hour: number }[];
    expect(hours.map((h) => Number(h.hour))).toEqual([23]);
  });

  it("still reports the UTC day when asked for UTC", async () => {
    const d = await volume("UTC");
    const days = d['by_day'] as { day: string }[];
    expect(days.map((r) => r.day)).toEqual(["2025-06-11"]);
  });
});

/**
 * Staff figures must follow the person who actually did the work. Reassigning
 * a conversation moves the current owner — it must never move the credit for a
 * reply that somebody else already sent.
 */
describe("staff credit survives a reassignment", () => {
  let org = "";
  let site = "";
  let dept = "";
  let responder = { id: "", email: "" };
  let inheritor = { id: "", email: "" };
  let windowFrom = "";
  let windowTo = "";

  async function makeStaff(key: string) {
    const email = syntheticEmail(`credit_${key}`, suffix);
    const fullName = syntheticName(`credit_${key}`, suffix);
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: `Cc!${suffix}Aa1${key}`,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw new Error(`staff ${key}: ${error?.message}`);
    const id = data.user.id;
    await db.from("profiles").upsert({
      id,
      organization_id: org,
      full_name: fullName,
      email,
      presence: "available",
    } as never);
    const { error: memberError } = await db
      .from("organization_memberships")
      .insert({ organization_id: org, user_id: id, role: "agent", status: "active" } as never);
    if (memberError) throw new Error(`membership ${key}: ${memberError.message}`);
    await db
      .from("department_members")
      .insert({ department_id: dept, user_id: id, organization_id: org } as never);
    return { id, email };
  }

  beforeAll(async () => {
    try {
      org = await makeOrg("ScaleCredit");
      site = await makeWebsite(org, "scalecredit");
      dept = await makeDepartment(org, "Credit");
      responder = await makeStaff("responder");
      inheritor = await makeStaff("inheritor");

      const queued = new Date(Date.UTC(2025, 2, 4, 10, 0, 0));
      const claimed = new Date(Date.UTC(2025, 2, 4, 10, 2, 0));
      const replied = new Date(Date.UTC(2025, 2, 4, 10, 5, 0));
      const done = new Date(Date.UTC(2025, 2, 4, 10, 40, 0));
      windowFrom = new Date(Date.UTC(2025, 1, 1)).toISOString();
      windowTo = new Date(Date.UTC(2025, 3, 1)).toISOString();

      // The chat was queued, claimed and answered by the responder, then handed
      // to a second agent who now owns it and has never written a word.
      const { data, error } = await db
        .from("conversations")
        .insert({
          organization_id: org,
          website_id: site,
          department_id: dept,
          reference: `CR-${suffix}-1`,
          status: "resolved",
          escalation_requested: true,
          created_at: queued.toISOString(),
          last_message_at: done.toISOString(),
          first_human_requested_at: queued.toISOString(),
          claimed_at: claimed.toISOString(),
          first_agent_response_at: replied.toISOString(),
          resolved_at: done.toISOString(),
          resolved_by: responder.id,
          assigned_to: inheritor.id,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(`credit conversation: ${error.message}`);
      const conversationId = (data as { id: string }).id;

      const { error: messageError } = await db.from("messages").insert({
        organization_id: org,
        website_id: site,
        conversation_id: conversationId,
        sender_type: "agent",
        sender_user_id: responder.id,
        body: "Happy to help with that.",
        created_at: replied.toISOString(),
      } as never);
      if (messageError) throw new Error(`credit message: ${messageError.message}`);

      const { error: eventError } = await db.from("conversation_events").insert([
        {
          organization_id: org,
          conversation_id: conversationId,
          actor_id: responder.id,
          event_type: "claimed",
          created_at: claimed.toISOString(),
        },
        {
          organization_id: org,
          conversation_id: conversationId,
          actor_id: inheritor.id,
          event_type: "reassigned",
          created_at: done.toISOString(),
        },
      ] as never);
      if (eventError) throw new Error(`credit events: ${eventError.message}`);
    } catch (error) {
      // A half-built fixture is exactly what gets left behind otherwise.
      await purgeSyntheticUsers(db, [responder, inheritor].filter((u) => u?.id));
      await purgeSyntheticOrganizations(db, [org]);
      throw error;
    }
  }, 180_000);

  afterAll(async () => {
    if (!configured) return;
    await purgeSyntheticUsers(db, [responder, inheritor].filter((u) => u.id));
    await purgeSyntheticOrganizations(db, [org]);
  }, 180_000);

  async function staffRows() {
    return rpc<Record<string, unknown>[]>("report_staff", {
      _org: org,
      _from: windowFrom,
      _to: windowTo,
      _dept: null,
      _staff: null,
      _statuses: null,
      _website: null,
      _type: "all",
      _transfer: "all",
      _priority: null,
      _sla: 15,
    });
  }

  it("keeps the first-response and reply-target credit with the original responder", async () => {
    const rows = await staffRows();
    const original = rows.find((r) => r['user_id'] === responder.id);
    const now = rows.find((r) => r['user_id'] === inheritor.id);
    expect(original).toBeTruthy();
    expect(now).toBeTruthy();
    expect(Number(original!['avg_response'])).toBe(5);
    expect(Number(original!['avg_claim'])).toBe(2);
    expect(Number(original!['sla_pct'])).toBe(100);
    // The current owner never replied, so nothing is credited to them.
    expect(now!['avg_response']).toBeNull();
    expect(now!['sla_pct']).toBeNull();
  });

  it("credits handling time to whoever resolved the conversation", async () => {
    const rows = await staffRows();
    const original = rows.find((r) => r['user_id'] === responder.id);
    const now = rows.find((r) => r['user_id'] === inheritor.id);
    expect(Number(original!['avg_handle'])).toBe(38);
    expect(now!['avg_handle']).toBeNull();
    // Current workload still belongs to the person who holds the chat today.
    expect(Number(now!['assigned_count'])).toBe(1);
  });

  it("self-scope report credits the original responder after reassignment", async () => {
    // Filtering to the responder alone must still surface the chat they worked
    // on, even though someone else owns it now.
    const rows = await rpc<Record<string, unknown>[]>("report_staff", {
      _org: org,
      _from: windowFrom,
      _to: windowTo,
      _dept: null,
      _staff: [responder.id],
      _statuses: null,
      _website: null,
      _type: "all",
      _transfer: "all",
      _priority: null,
      _sla: 15,
    });
    const original = rows.find((r) => r['user_id'] === responder.id);
    expect(original).toBeTruthy();
    expect(Number(original!['avg_response'])).toBe(5);
    expect(Number(original!['sla_pct'])).toBe(100);
    expect(Number(original!['avg_handle'])).toBe(38);
  });
});
