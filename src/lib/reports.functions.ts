/**
 * Reporting & Analytics V2 — server-side aggregation.
 *
 * Every report is calculated in Postgres and returned pre-aggregated. The
 * browser never receives raw conversation tables to sum up, and it never
 * decides what it is allowed to see: the caller's reporting scope is resolved
 * from the authoritative membership record and the requested filters are
 * clamped to that scope before any SQL runs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, ForbiddenError, requireOrganization, type Actor } from "@/lib/authz.server";

const filterSchema = z.object({
  from: z.string(),
  to: z.string(),
  departmentId: z.string().uuid().nullable().optional(),
  staffId: z.string().uuid().nullable().optional(),
  statuses: z.array(z.string()).nullable().optional(),
  websiteId: z.string().uuid().nullable().optional(),
  type: z.enum(["all", "ai_only", "human", "escalated"]).optional(),
  transfer: z.enum(["all", "never", "once", "multi"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).nullable().optional(),
  sla: z.number().int().min(1).max(1440).optional(),
});

const optionsSchema = z
  .object({
    flag: z.string().max(30).optional(),
    sort: z.string().max(30).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).max(100_000).optional(),
    staffId: z.string().uuid().optional(),
  })
  .optional();

export const REPORT_SECTIONS = [
  "overview",
  "departments",
  "backlog",
  "staff",
  "workload",
  "tickets",
  "transfers",
  "sla",
  "volume",
  "ai",
  "intake",
  "staff_detail",
] as const;

const inputSchema = z.object({
  section: z.enum(REPORT_SECTIONS),
  filters: filterSchema,
  options: optionsSchema,
});

export type ReportFilters = z.infer<typeof filterSchema>;

type Scope = {
  organizationId: string;
  /** null = every department, otherwise the only departments this caller may read. */
  departmentIds: string[] | null;
  /** null = every staff member, otherwise the only staff this caller may read. */
  staffIds: string[] | null;
  level: "self" | "team" | "organization" | "platform";
};

/**
 * Sections a given scope level may run.
 *
 * Organization-wide sections (backlog, workload, transfers, AI) have no staff
 * dimension in SQL, so a self-level caller can never run them: there is no way
 * to constrain them to that one person's data.
 */
const SECTIONS_BY_LEVEL: Record<Scope["level"], readonly string[]> = {
  platform: REPORT_SECTIONS,
  organization: REPORT_SECTIONS,
  team: REPORT_SECTIONS,
  self: ["overview", "staff", "tickets", "sla", "volume", "intake", "staff_detail"],
};

/** Resolve what this caller is permitted to report on. Never trusts input. */
function reportScope(actor: Actor): Scope {
  const organizationId = requireOrganization(actor);
  if (actor.permissions.has("reports.platform") || actor.permissions.has("reports.organization")) {
    return {
      organizationId,
      departmentIds: null,
      staffIds: null,
      level: actor.permissions.has("reports.platform") ? "platform" : "organization",
    };
  }
  if (actor.permissions.has("reports.team")) {
    return {
      organizationId,
      departmentIds: actor.departmentIds.length ? actor.departmentIds : [],
      staffIds: null,
      level: "team",
    };
  }
  if (actor.permissions.has("reports.self")) {
    return {
      organizationId,
      // A self-level caller is also confined to their own departments, so any
      // department-dimensioned report can never widen to the whole tenant.
      departmentIds: actor.departmentIds.length ? actor.departmentIds : [],
      staffIds: [actor.userId],
      level: "self",
    };
  }
  throw new ForbiddenError("You don't have access to reporting");
}

/** A department id that matches nothing, so an empty scope returns zero rows. */
const NO_DEPARTMENT = "00000000-0000-0000-0000-000000000000";

/** Intersect a requested filter with the caller's scope. */
function clampDepartments(scope: Scope, requested?: string | null): string[] | null {
  if (scope.departmentIds === null) return requested ? [requested] : null;
  if (!requested) return scope.departmentIds.length ? scope.departmentIds : [NO_DEPARTMENT];
  if (!scope.departmentIds.includes(requested)) {
    throw new ForbiddenError("That department is outside your reporting scope");
  }
  return [requested];
}

function clampStaff(scope: Scope, requested?: string | null): string[] | null {
  if (scope.staffIds === null) return requested ? [requested] : null;
  if (requested && !scope.staffIds.includes(requested)) {
    throw new ForbiddenError("That teammate is outside your reporting scope");
  }
  return scope.staffIds;
}


function parseRange(filters: ReportFilters) {
  const from = new Date(filters.from);
  const to = new Date(filters.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new ForbiddenError("Invalid reporting date range");
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Run a report. Scope is enforced here; the SQL layer is service-role only. */
export const runReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const scope = reportScope(actor);
    if (!SECTIONS_BY_LEVEL[scope.level].includes(data.section)) {
      throw new ForbiddenError("That report is outside your reporting scope");
    }
    const { from, to } = parseRange(data.filters);

    const dept = clampDepartments(scope, data.filters.departmentId ?? null);
    const staff = clampStaff(scope, data.filters.staffId ?? null);
    const sla = data.filters.sla ?? 15;
    const statuses = data.filters.statuses?.length ? data.filters.statuses : null;
    const website = data.filters.websiteId ?? null;
    const type = data.filters.type ?? "all";
    const transfer = data.filters.transfer ?? "all";
    const priority = data.filters.priority ?? null;
    const opts = data.options ?? {};

    const { admin } = await import("@/lib/public-chat.server");
    const db = admin() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const common = {
      _org: scope.organizationId,
      _from: from,
      _to: to,
      _dept: dept,
      _staff: staff,
      _statuses: statuses,
      _website: website,
      _type: type,
      _transfer: transfer,
      _priority: priority,
    };

    let fn: string;
    let args: Record<string, unknown>;

    switch (data.section) {
      case "overview":
        fn = "report_overview";
        args = { ...common, _sla: sla };
        break;
      case "departments":
        fn = "report_departments";
        args = { ...common, _sla: sla };
        break;
      case "backlog":
        fn = "report_department_backlog";
        args = { _org: scope.organizationId, _dept: dept, _sla: sla };
        break;
      case "staff":
        fn = "report_staff";
        args = { ...common, _sla: sla };
        break;
      case "workload":
        fn = "report_staff_workload";
        args = { _org: scope.organizationId, _dept: dept };
        break;
      case "tickets":
        fn = "report_tickets";
        args = {
          ...common,
          _sla: sla,
          _flag: opts.flag ?? "all",
          _sort: opts.sort ?? "created_at",
          _dir: opts.dir ?? "desc",
          _limit: opts.limit ?? 50,
          _offset: opts.offset ?? 0,
        };
        break;
      case "transfers":
        fn = "report_transfers";
        args = { _org: scope.organizationId, _from: from, _to: to, _dept: dept, _limit: opts.limit ?? 200 };
        break;
      case "sla":
        fn = "report_sla";
        args = { ...common, _sla: sla };
        break;
      case "volume":
        fn = "report_volume";
        args = common;
        break;
      case "ai":
        fn = "report_ai";
        args = { _org: scope.organizationId, _from: from, _to: to, _dept: dept, _website: website };
        break;
      case "intake":
        fn = "report_intake";
        args = { _org: scope.organizationId, _from: from, _to: to, _dept: dept, _staff: staff };
        break;
      case "staff_detail": {
        const target = opts.staffId;
        if (!target) throw new ForbiddenError("Choose a staff member");
        const allowed = clampStaff(scope, target);
        if (allowed && !allowed.includes(target)) {
          throw new ForbiddenError("That teammate is outside your reporting scope");
        }
        fn = "report_staff";
        args = { ...common, _staff: [target], _sla: sla };
        break;
      }
      default:
        throw new ForbiddenError("Unknown report");
    }

    const { data: result, error } = await db.rpc(fn, args);
    if (error) {
      console.error("[reports] rpc failed", fn, error.message);
      throw new Error("Could not build that report");
    }
    // Serialized as JSON: report payloads are dynamic jsonb, which the RPC
    // boundary's structural serializer cannot type.
    return {
      section: data.section as string,
      scope: scope.level as string,
      json: JSON.stringify(result ?? null),
    };
  });

/** Filter options (departments, staff, websites) limited to the caller's scope. */
export const reportFilterOptionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const scope = reportScope(actor);
    const { admin } = await import("@/lib/public-chat.server");
    const db = admin();

    const deptQuery = db
      .from("departments")
      .select("id, name")
      .eq("organization_id", scope.organizationId)
      .order("name");
    if (scope.departmentIds) deptQuery.in("id", scope.departmentIds.length ? scope.departmentIds : [""]);

    const [departments, websites, staff] = await Promise.all([
      deptQuery,
      db.from("websites").select("id, name").eq("organization_id", scope.organizationId).order("name"),
      db
        .from("organization_memberships")
        .select("user_id, profiles!inner(full_name)")
        .eq("organization_id", scope.organizationId)
        .eq("status", "active"),
    ]);

    let people = (staff.data ?? []).map((row) => ({
      id: row.user_id as string,
      name: ((row as { profiles?: { full_name?: string } }).profiles?.full_name ?? "Unnamed") as string,
    }));
    if (scope.staffIds) people = people.filter((p) => scope.staffIds!.includes(p.id));
    people.sort((a, b) => a.name.localeCompare(b.name));

    return {
      scope: scope.level,
      sections: SECTIONS_BY_LEVEL[scope.level] as readonly string[],

      selfId: actor.userId,
      departments: (departments.data ?? []).map((d) => ({ id: d.id as string, name: d.name as string })),
      websites: (websites.data ?? []).map((w) => ({ id: w.id as string, name: w.name as string })),
      staff: people,
      slaMinutes: 15,
    };
  });
