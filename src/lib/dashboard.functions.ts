/**
 * Role-aware dashboard aggregation.
 *
 * The browser asks for "my dashboard" and nothing else: the organization, the
 * department scope and the level of detail are all resolved server-side from
 * the authoritative membership record. Every number is calculated in Postgres
 * by `dashboard_metrics`, so the client never pulls raw conversations.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, requireOrganization, ForbiddenError } from "@/lib/authz.server";
import {
  dashboardScopeFor,
  scopeDashboardMetrics,
  type DashboardScope,
} from "@/lib/report-scope";

export const DASHBOARD_PERIODS = ["today", "week", "last7", "month", "last30"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

const inputSchema = z.object({
  period: z.enum(DASHBOARD_PERIODS).default("today"),
});

/** Current and comparison window for a named period, in UTC. */
function windows(period: DashboardPeriod) {
  const now = new Date();
  const start = new Date(now);
  switch (period) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "week": {
      start.setHours(0, 0, 0, 0);
      const dow = (start.getDay() + 6) % 7; // Monday-based
      start.setDate(start.getDate() - dow);
      break;
    }
    case "last7":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setHours(0, 0, 0, 0);
      start.setDate(1);
      break;
    case "last30":
      start.setDate(start.getDate() - 30);
      break;
  }
  const span = now.getTime() - start.getTime();
  const prevTo = new Date(start.getTime());
  const prevFrom = new Date(start.getTime() - span);
  return {
    from: start.toISOString(),
    to: now.toISOString(),
    prevFrom: prevFrom.toISOString(),
    prevTo: prevTo.toISOString(),
  };
}

export const getDashboardMetricsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const organizationId = requireOrganization(actor);

    // Scope is derived from permissions, never from the request.
    const scope: DashboardScope =
      dashboardScopeFor({
        userId: actor.userId,
        organizationId,
        departmentIds: actor.departmentIds,
        permissions: actor.permissions,
      }) ??
      (() => {
        throw new ForbiddenError("You don't have access to the dashboard");
      })();

    const NO_DEPARTMENT = "00000000-0000-0000-0000-000000000000";
    const deptScope = actor.departmentIds.length ? actor.departmentIds : [NO_DEPARTMENT];

    const { from, to, prevFrom, prevTo } = windows(data.period);
    const { admin } = await import("@/lib/public-chat.server");
    const db = admin() as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { data: result, error } = await db.rpc("dashboard_metrics", {
      _org: organizationId,
      _user: actor.userId,
      // An empty department scope must mean "nothing", never "everything".
      _dept: scope === "organization" ? null : deptScope,
      _scope: scope,
      _from: from,
      _to: to,
      _prev_from: prevFrom,
      _prev_to: prevTo,
      _sla: 15,
    });
    if (error) {
      console.error("[dashboard] rpc failed", error.message);
      throw new Error("Could not load your dashboard");
    }

    return {
      scope: scope as string,
      role: (actor.role ?? "agent") as string,
      period: data.period as string,
      canTransfer: actor.permissions.has("conversation.transfer"),
      canViewStaff: actor.permissions.has("staff.view"),
      slaMinutes: 15,
      // Dynamic jsonb: serialized so the RPC boundary keeps a stable type.
      json: JSON.stringify(scopeDashboardMetrics(result, scope)),
    };
  });

/** Update the caller's own presence from the dashboard header. */
export const setMyPresenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ presence: z.enum(["available", "busy", "away", "offline"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ presence: data.presence, last_active_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error("Could not update your presence");
    return { presence: data.presence };
  });
