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
import { toCsv } from "@/lib/csv";
import {
  NO_DEPARTMENT,
  REPORT_SECTIONS as SHARED_SECTIONS,
  SECTIONS_BY_LEVEL,
  canRunSection,
  reportScopeFor,
  type Scope,
} from "@/lib/report-scope";

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

export const REPORT_SECTIONS = SHARED_SECTIONS;

const inputSchema = z.object({
  section: z.enum(REPORT_SECTIONS),
  filters: filterSchema,
  options: optionsSchema,
});

export type ReportFilters = z.infer<typeof filterSchema>;
type ReportOptions = NonNullable<z.infer<typeof optionsSchema>>;

/** Resolve what this caller is permitted to report on. Never trusts input. */
function reportScope(actor: Actor): Scope {
  const organizationId = requireOrganization(actor);
  const scope = reportScopeFor({
    userId: actor.userId,
    organizationId,
    departmentIds: actor.departmentIds,
    permissions: actor.permissions,
  });
  if (
    !actor.permissions.has("reports.platform") &&
    !actor.permissions.has("reports.organization") &&
    !actor.permissions.has("reports.team") &&
    !actor.permissions.has("reports.self")
  ) {
    throw new ForbiddenError("You don't have access to reporting");
  }
  return scope;
}

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

/**
 * Translate a requested section into the RPC to call. All scope clamping
 * happens here, so both the interactive report and the CSV export are
 * guaranteed to run exactly the same authorized query.
 */
function buildCall(scope: Scope, section: string, filters: ReportFilters, options: ReportOptions) {
  const { from, to } = parseRange(filters);
  const dept = clampDepartments(scope, filters.departmentId ?? null);
  const staff = clampStaff(scope, filters.staffId ?? null);
  const sla = filters.sla ?? 15;
  const statuses = filters.statuses?.length ? filters.statuses : null;
  const website = filters.websiteId ?? null;
  const type = filters.type ?? "all";
  const transfer = filters.transfer ?? "all";
  const priority = filters.priority ?? null;
  const opts = options;

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

  switch (section) {
    case "overview":
      return { fn: "report_overview", args: { ...common, _sla: sla } };
    case "departments":
      return { fn: "report_departments", args: { ...common, _sla: sla } };
    case "backlog":
      return { fn: "report_department_backlog", args: { _org: scope.organizationId, _dept: dept, _sla: sla } };
    case "staff":
      return { fn: "report_staff", args: { ...common, _sla: sla } };
    case "workload":
      return { fn: "report_staff_workload", args: { _org: scope.organizationId, _dept: dept } };
    case "tickets":
      return {
        fn: "report_tickets",
        args: {
          ...common,
          _sla: sla,
          _flag: opts.flag ?? "all",
          _sort: opts.sort ?? "created_at",
          _dir: opts.dir ?? "desc",
          _limit: opts.limit ?? 50,
          _offset: opts.offset ?? 0,
        },
      };
    case "transfers":
      return {
        fn: "report_transfers",
        args: {
          _org: scope.organizationId,
          _from: from,
          _to: to,
          _dept: dept,
          _limit: opts.limit ?? 50,
          _offset: opts.offset ?? 0,
        },
      };
    case "sla":
      return { fn: "report_sla", args: { ...common, _sla: sla } };
    case "volume":
      return { fn: "report_volume", args: common };
    case "ai":
      return {
        fn: "report_ai",
        args: { _org: scope.organizationId, _from: from, _to: to, _dept: dept, _website: website },
      };
    case "intake":
      return {
        fn: "report_intake",
        args: {
          _org: scope.organizationId,
          _from: from,
          _to: to,
          _dept: dept,
          _staff: staff,
          _limit: opts.limit ?? 50,
          _offset: opts.offset ?? 0,
        },
      };
    case "staff_detail": {
      const target = opts.staffId;
      if (!target) throw new ForbiddenError("Choose a staff member");
      const allowed = clampStaff(scope, target);
      if (allowed && !allowed.includes(target)) {
        throw new ForbiddenError("That teammate is outside your reporting scope");
      }
      return { fn: "report_staff", args: { ...common, _staff: [target], _sla: sla } };
    }
    default:
      throw new ForbiddenError("Unknown report");
  }
}

type Rpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function callRpc(fn: string, args: Record<string, unknown>) {
  const { admin } = await import("@/lib/public-chat.server");
  const db = admin() as unknown as Rpc;
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    console.error("[reports] rpc failed", fn, error.message);
    throw new Error("Could not build that report");
  }
  return data;
}

/** Run a report. Scope is enforced here; the SQL layer is service-role only. */
export const runReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const scope = reportScope(actor);
    if (!canRunSection(scope, data.section)) {
      throw new ForbiddenError("That report is outside your reporting scope");
    }
    const { fn, args } = buildCall(scope, data.section, data.filters, data.options ?? {});
    const result = await callRpc(fn, args);
    // Serialized as JSON: report payloads are dynamic jsonb, which the RPC
    // boundary's structural serializer cannot type.
    return {
      section: data.section as string,
      scope: scope.level as string,
      json: JSON.stringify(result ?? null),
    };
  });

/* ------------------------------- CSV exports ------------------------------- */

/** Rows fetched per round trip, and the hard ceiling for one report export. */
const EXPORT_PAGE = 500;
export const REPORT_EXPORT_ROW_CAP = 25_000;

/**
 * What each downloadable dataset is: the report it runs, where the rows live
 * inside that report's payload, and whether the underlying RPC pages.
 */
const DATASETS = {
  tickets: { section: "tickets", path: "rows", paged: true, file: "tickets" },
  transfers: { section: "transfers", path: "rows", paged: true, file: "transfer-log" },
  transfer_matrix: { section: "transfers", path: "matrix", paged: false, file: "transfer-matrix" },
  intake: { section: "intake", path: "rows", paged: true, file: "requests" },
  intake_by_type: { section: "intake", path: "by_type", paged: false, file: "requests-by-type" },
  staff: { section: "staff", path: "", paged: false, file: "staff-performance" },
  departments: { section: "departments", path: "", paged: false, file: "department-performance" },
  backlog: { section: "backlog", path: "", paged: false, file: "department-backlog" },
  sla_departments: { section: "sla", path: "by_department", paged: false, file: "sla-departments" },
  sla_staff: { section: "sla", path: "by_staff", paged: false, file: "sla-staff" },
  ai_questions: { section: "ai", path: "top_questions", paged: false, file: "ai-top-questions" },
  ai_low_confidence: { section: "ai", path: "low_confidence_questions", paged: false, file: "ai-knowledge-gaps" },
} as const;

export const REPORT_EXPORTS = Object.keys(DATASETS) as (keyof typeof DATASETS)[];
export type ReportExport = keyof typeof DATASETS;

const exportSchema = z.object({
  dataset: z.enum(REPORT_EXPORTS as [ReportExport, ...ReportExport[]]),
  filters: filterSchema,
  options: optionsSchema,
});

function pluck(payload: unknown, path: string): Record<string, unknown>[] {
  const value = path ? (payload as Record<string, unknown> | null)?.[path] : payload;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/**
 * Export a report as CSV.
 *
 * The export runs the *same* authorized query as the report on screen — same
 * organization, RBAC scope, departments, staff, dates, status, priority,
 * website, conversation type and transfer state — and walks it page by page
 * server-side, so the file contains the whole authorized result rather than
 * whichever page the browser happens to be showing.
 */
export const exportReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => exportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const scope = reportScope(actor);
    const spec = DATASETS[data.dataset];
    if (!canRunSection(scope, spec.section)) {
      throw new ForbiddenError("That report is outside your reporting scope");
    }

    const baseOptions = data.options ?? {};
    const rows: Record<string, unknown>[] = [];
    let truncated = false;

    if (!spec.paged) {
      const { fn, args } = buildCall(scope, spec.section, data.filters, baseOptions);
      rows.push(...pluck(await callRpc(fn, args), spec.path));
    } else {
      for (let offset = 0; offset < REPORT_EXPORT_ROW_CAP; offset += EXPORT_PAGE) {
        const { fn, args } = buildCall(scope, spec.section, data.filters, {
          ...baseOptions,
          limit: EXPORT_PAGE,
          offset,
        });
        const batch = pluck(await callRpc(fn, args), spec.path);
        rows.push(...batch);
        if (batch.length < EXPORT_PAGE) break;
        if (rows.length >= REPORT_EXPORT_ROW_CAP) {
          truncated = true;
          break;
        }
      }
    }

    // The audit trail records *what was exported and under which filters* —
    // never the exported rows, which can contain personal health information.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      organization_id: scope.organizationId,
      actor_id: actor.userId,
      actor_name: actor.fullName,
      action: "report.exported",
      record_type: data.dataset,
      new_value: {
        rows: rows.length,
        truncated,
        scope: scope.level,
        from: data.filters.from,
        to: data.filters.to,
        department_id: data.filters.departmentId ?? null,
        staff_id: data.filters.staffId ?? null,
        website_id: data.filters.websiteId ?? null,
        statuses: data.filters.statuses ?? null,
        priority: data.filters.priority ?? null,
        type: data.filters.type ?? "all",
        transfer: data.filters.transfer ?? "all",
        flag: baseOptions.flag ?? null,
      },
    });

    return {
      dataset: data.dataset as string,
      filename: spec.file as string,
      rows: rows.length,
      truncated,
      cap: REPORT_EXPORT_ROW_CAP,
      csv: toCsv(rows),
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
