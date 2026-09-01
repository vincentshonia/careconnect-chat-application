import { describe, expect, it } from "vitest";
import {
  canRunSection,
  dashboardScopeFor,
  reportScopeFor,
  scopeDashboardMetrics,
  SECTIONS_BY_LEVEL,
} from "@/lib/report-scope";

const actor = (permissions: string[], departmentIds: string[] = ["dept-1"]) => ({
  userId: "user-1",
  organizationId: "org-1",
  departmentIds,
  permissions: new Set(permissions),
});

describe("reporting scope", () => {
  it("gives organization-wide callers an unrestricted scope", () => {
    const scope = reportScopeFor(actor(["reports.organization"]));
    expect(scope.level).toBe("organization");
    expect(scope.departmentIds).toBeNull();
    expect(scope.staffIds).toBeNull();
  });

  it("confines a team lead to their own departments but not to themselves", () => {
    const scope = reportScopeFor(actor(["reports.team"], ["dept-1", "dept-2"]));
    expect(scope.level).toBe("team");
    expect(scope.departmentIds).toEqual(["dept-1", "dept-2"]);
    expect(scope.staffIds).toBeNull();
  });

  it("confines an agent to their own rows and departments", () => {
    const scope = reportScopeFor(actor(["reports.self"]));
    expect(scope.level).toBe("self");
    expect(scope.staffIds).toEqual(["user-1"]);
    expect(scope.departmentIds).toEqual(["dept-1"]);
  });

  it("never widens an empty department scope to the whole tenant", () => {
    const scope = reportScopeFor(actor(["reports.team"], []));
    expect(scope.departmentIds).toEqual([]);
  });

  it("blocks org-wide sections for self-level callers", () => {
    const self = reportScopeFor(actor(["reports.self"]));
    for (const section of ["backlog", "workload", "transfers", "ai", "departments"]) {
      expect(canRunSection(self, section), `${section} must be denied at self level`).toBe(false);
    }
    expect(canRunSection(self, "overview")).toBe(true);
  });

  it("allows every section at team level and above", () => {
    for (const level of ["team", "organization", "platform"] as const) {
      expect(SECTIONS_BY_LEVEL[level].length).toBeGreaterThan(SECTIONS_BY_LEVEL.self.length);
    }
  });
});

describe("dashboard scope", () => {
  it("maps permissions to levels", () => {
    expect(dashboardScopeFor(actor(["reports.organization"]))).toBe("organization");
    expect(dashboardScopeFor(actor(["reports.team"]))).toBe("team");
    expect(dashboardScopeFor(actor(["reports.self"]))).toBe("self");
    expect(dashboardScopeFor(actor([]))).toBeNull();
  });

  const raw = {
    current: { org_open: 40, dept_open: 9, my_open: 3 },
    departments: [{ id: "dept-1" }],
    staff: [{ id: "user-1" }],
    queue: [{ id: "conv-1" }],
  };

  it("keeps everything for organization scope", () => {
    expect(scopeDashboardMetrics(raw, "organization")).toEqual(raw);
  });

  it("strips organization counters for a team dashboard", () => {
    const out = scopeDashboardMetrics(raw, "team");
    const current = out["current"] as Record<string, unknown>;
    expect(current["org_open"]).toBeUndefined();
    expect(current["dept_open"]).toBe(9);
    expect(out["departments"]).toBeDefined();
  });

  it("strips organization and department data for a self dashboard", () => {
    const out = scopeDashboardMetrics(raw, "self");
    const current = out["current"] as Record<string, unknown>;
    expect(current["org_open"]).toBeUndefined();
    expect(current["dept_open"]).toBeUndefined();
    expect(current["my_open"]).toBe(3);
    expect(out["departments"]).toBeUndefined();
    expect(out["staff"]).toBeUndefined();
    expect(out["queue"]).toBeUndefined();
  });
});
