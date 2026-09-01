/**
 * Pure reporting/dashboard scope rules.
 *
 * Kept free of server-only imports so the same code that guards production
 * requests can be exercised directly by the test suite.
 */

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

export type ReportSection = (typeof REPORT_SECTIONS)[number];

export type ScopeLevel = "self" | "team" | "organization" | "platform";

export type Scope = {
  organizationId: string;
  /** null = every department, otherwise the only departments this caller may read. */
  departmentIds: string[] | null;
  /** null = every staff member, otherwise the only staff this caller may read. */
  staffIds: string[] | null;
  level: ScopeLevel;
};

/**
 * Sections a given scope level may run.
 *
 * Organization-wide sections (backlog, workload, transfers, AI) have no staff
 * dimension in SQL, so a self-level caller can never run them: there is no way
 * to constrain them to that one person's data.
 */
export const SECTIONS_BY_LEVEL: Record<ScopeLevel, readonly string[]> = {
  platform: REPORT_SECTIONS,
  organization: REPORT_SECTIONS,
  team: REPORT_SECTIONS,
  self: ["overview", "staff", "tickets", "sla", "volume", "intake", "staff_detail"],
};

/** A department id that matches nothing, so an empty scope returns zero rows. */
export const NO_DEPARTMENT = "00000000-0000-0000-0000-000000000000";

export type ScopeActor = {
  userId: string;
  organizationId: string;
  departmentIds: string[];
  permissions: Set<string> | ReadonlySet<string>;
};

/** Resolve what this caller is permitted to report on. Never trusts input. */
export function reportScopeFor(actor: ScopeActor): Scope {
  const organizationId = actor.organizationId;
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
  return { organizationId, departmentIds: [], staffIds: [], level: "self" };
}

export function canRunSection(scope: Scope, section: string) {
  return SECTIONS_BY_LEVEL[scope.level].includes(section);
}

export type DashboardScope = "self" | "team" | "organization";

export function dashboardScopeFor(actor: ScopeActor): DashboardScope | null {
  if (actor.permissions.has("reports.organization") || actor.permissions.has("reports.platform")) {
    return "organization";
  }
  if (actor.permissions.has("reports.team")) return "team";
  if (actor.permissions.has("reports.self")) return "self";
  return null;
}

/**
 * Strip figures the caller's scope does not cover. Organization-wide counters
 * never reach a team- or self-level dashboard, and a self-level agent sees
 * only their own numbers.
 */
export function scopeDashboardMetrics(
  raw: unknown,
  scope: DashboardScope,
): Record<string, unknown> {
  const payload = (raw ?? {}) as Record<string, unknown>;
  if (scope === "organization") return payload;
  const current = { ...((payload["current"] ?? {}) as Record<string, unknown>) };
  for (const key of Object.keys(current)) {
    if (key.startsWith("org_")) delete current[key];
    if (scope === "self" && key.startsWith("dept_")) delete current[key];
  }
  const out: Record<string, unknown> = { ...payload, current };
  if (scope === "self") {
    delete out["departments"];
    delete out["staff"];
    delete out["queue"];
  }
  return out;
}
