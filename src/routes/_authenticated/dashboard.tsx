import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/hooks/use-session-context";
import { ROLE_LABEL, type OrgRole } from "@/lib/permissions";
import { claimConversationFn } from "@/lib/conversations.functions";
import {
  DASHBOARD_PERIODS,
  getDashboardMetricsFn,
  setMyPresenceFn,
  type DashboardPeriod,
} from "@/lib/dashboard.functions";
import { BarList, ColumnChart, DataTable, Panel, fmtMin, fmtNum } from "@/components/reports/primitives";
import { Delta, Kpi, MetricRow, SkeletonGrid, age, maybe, num, type Json } from "@/components/dashboard/pieces";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Pacific Health Group Support Console" },
      {
        name: "description",
        content: "Your workload, performance and the conversations that need attention right now.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  today: "Today",
  week: "This week",
  last7: "Last 7 days",
  month: "This month",
  last30: "Last 30 days",
};

const STATUS_LABEL: Record<string, string> = {
  new: "AI handling",
  waiting: "Waiting for human",
  assigned: "Assigned",
  active: "Active",
  pending_visitor: "Waiting for visitor",
  pending_internal: "Internal follow-up",
  follow_up: "Follow-up",
  escalated: "Escalated",
};

const PRESENCE = ["available", "busy", "away", "offline"] as const;

const TIP = {
  firstResponse:
    "Average time between the human assistance request and the first staff reply on conversations you handled.",
  claim:
    "Average time a visitor waits in the human queue before you claim the conversation.",
  sla: "Percentage of applicable conversations answered within the configured SLA target.",
  handled:
    "Conversations you actually worked: claimed, replied to, resolved or closed during the period.",
  completion: "Completed conversations divided by conversations you handled in the period.",
  handle: "Average time from claim to resolution or closure.",
  capacity: "Active chats against the maximum your administrator configured.",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardPage() {
  const session = useSessionContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [trendMetric, setTrendMetric] = useState<"handled" | "completed" | "response">("handled");

  const fetchMetrics = useServerFn(getDashboardMetricsFn);
  const setPresence = useServerFn(setMyPresenceFn);
  const claim = useServerFn(claimConversationFn);

  const metrics = useQuery({
    queryKey: ["dashboard-metrics", period],
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetchMetrics({ data: { period } });
      return { ...res, data: JSON.parse(res.json) as Json };
    },
  });

  // Current-state numbers stay live without a page refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const presenceMutation = useMutation({
    mutationFn: (value: (typeof PRESENCE)[number]) => setPresence({ data: { presence: value } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-context"] });
      toast.success("Availability updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const claimMutation = useMutation({
    mutationFn: (conversationId: string) => claim({ data: { conversationId } }),
    onSuccess: async (_r, id) => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast.success("Conversation claimed");
      navigate({ to: "/inbox", search: { c: id, tab: "mine" } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = metrics.data?.data ?? {};
  const scope = metrics.data?.scope ?? "self";
  const canTransfer = metrics.data?.canTransfer ?? false;
  const current = (d['current'] ?? {}) as Json;
  const perf = (d['performance'] ?? {}) as Json;
  const prev = (d['previous'] ?? {}) as Json;
  const org = (d['organization'] ?? {}) as Json;
  const availability = (d['availability'] ?? {}) as Json;
  const requests = (d['requests'] ?? {}) as Json;
  const benchmark = (d['benchmark'] ?? {}) as Json;
  const workload = (d['workload'] ?? []) as Json[];
  const attention = (d['needs_attention'] ?? []) as Json[];
  const claimable = (d['available'] ?? []) as Json[];
  const trend = (d['trend'] ?? []) as Json[];
  const departments = (d['departments'] ?? []) as Json[];
  const staff = (d['staff'] ?? []) as Json[];
  const goals = ((d['goals'] ?? []) as Json[]).filter((g) =>
    Object.values(g).some((v) => v !== null && v !== undefined),
  );

  const profile = session.data?.profile as
    | { full_name?: string; display_name?: string | null; avatar_url?: string | null; presence?: string }
    | null
    | undefined;
  const firstName = (profile?.display_name || profile?.full_name || "there").split(" ")[0];
  const role = (session.data?.role ?? null) as OrgRole | null;
  const presence = profile?.presence ?? "available";
  const activeCount = num(current['my_active']);
  const capacityMax = num(current['capacity_max']);
  const loading = metrics.isLoading;

  const csatCount = num(perf['csat_count']);
  const handled = num(perf['handled']);

  const trendRows = useMemo(
    () =>
      trend.map((t) => ({
        bucket: String(t['bucket'] ?? ""),
        value: num(t[trendMetric]),
      })),
    [trend, trendMetric],
  );

  return (
    <AdminShell
      title="Dashboard"
      description="Your workload, performance and what needs attention right now."
    >
      {/* Personalised header ------------------------------------------------ */}
      <header className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
        <div className="h-14 w-14 overflow-hidden rounded-full bg-muted">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {firstName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-[220px] flex-1">
          <h1 className="text-xl font-semibold">
            {greeting()}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {role ? ROLE_LABEL[role] : "Staff"}
            {" · "}
            {activeCount} active conversation{activeCount === 1 ? "" : "s"}
            {" · "}Here's your workload and performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              presence === "available"
                ? "bg-primary"
                : presence === "busy"
                  ? "bg-destructive"
                  : presence === "away"
                    ? "bg-amber-500"
                    : "bg-muted-foreground"
            }`}
          />
          <select
            aria-label="Availability"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm capitalize"
            value={presence}
            onChange={(e) => presenceMutation.mutate(e.target.value as (typeof PRESENCE)[number])}
          >
            {PRESENCE.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Row 1 — right now -------------------------------------------------- */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Right now</h2>
        {loading ? (
          <SkeletonGrid count={6} />
        ) : scope === "organization" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Kpi label="Open" value={fmtNum(current['org_open'])} to="/inbox" search={{ tab: "all" }} />
            <Kpi label="Waiting" value={fmtNum(current['org_waiting'])} tone={num(current['org_waiting']) ? "warn" : "default"} to="/inbox" search={{ tab: "waiting" }} />
            <Kpi label="Unassigned" value={fmtNum(current['org_unassigned'])} to="/inbox" search={{ tab: "waiting" }} />
            <Kpi label="Active" value={fmtNum(current['org_active'])} to="/inbox" search={{ tab: "active" }} />
            <Kpi label="Agent requested" value={fmtNum(current['org_agent_requested'])} tone={num(current['org_agent_requested']) ? "warn" : "default"} to="/inbox" search={{ tab: "waiting" }} />
            <Kpi label="Completed today" value={fmtNum(current['org_completed_today'])} tone="good" to="/inbox" search={{ tab: "closed" }} />
            <Kpi label="SLA risk" value={fmtNum(current['org_sla_risk'])} tone={num(current['org_sla_risk']) ? "critical" : "default"} tooltip={TIP.sla} to="/inbox" search={{ tab: "waiting" }} />
            <Kpi label="Open intakes" value={fmtNum(current['org_open_intakes'])} to="/intake" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi label="My open" value={fmtNum(current['my_open'])} to="/inbox" search={{ tab: "mine" }} />
            <Kpi label="My active" value={fmtNum(current['my_active'])} to="/inbox" search={{ tab: "mine", status: "active" }} />
            <Kpi label="Waiting in my department" value={fmtNum(current['dept_waiting'])} tone={num(current['dept_waiting']) ? "warn" : "default"} to="/inbox" search={{ tab: "waiting" }} />
            <Kpi label="Completed today" value={fmtNum(current['my_completed_today'])} tone="good" to="/inbox" search={{ tab: "closed" }} />
            <Kpi
              label="SLA risk"
              value={fmtNum(current['my_sla_risk'])}
              tone={num(current['my_sla_risk']) ? "critical" : "default"}
              tooltip={TIP.sla}
              to="/inbox"
              search={{ tab: "mine" }}
            />
            <Kpi
              label="My capacity"
              value={`${activeCount} / ${capacityMax || "∞"}`}
              hint="Active chat capacity"
              tone={capacityMax > 0 && activeCount >= capacityMax ? "warn" : "default"}
              tooltip={TIP.capacity}
            />
          </div>
        )}
      </section>

      {/* Row 2 — attention + workload --------------------------------------- */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Panel
          title="Needs my attention"
          description="Ordered by urgency: visitors waiting, SLA risk, escalations, follow-ups."
          className="xl:col-span-2"
        >
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : attention.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing needs your attention. Claim a waiting conversation below to get started.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((a) => (
                <li key={String(a['id'])} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <div className="min-w-[200px] flex-1">
                    <p className="font-medium">
                      {String(a['contact_name'] ?? "Website visitor")} — {String(a['subject'])}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {String(a['reason'])} · {age(a['age_minutes'])} · {String(a['department'] ?? "No department")} ·{" "}
                      {String(a['reference'])}
                    </p>
                  </div>
                  <Badge variant="outline">{STATUS_LABEL[String(a['status'])] ?? String(a['status'])}</Badge>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/inbox" search={{ c: String(a['id']), tab: "mine" }}>
                      Open
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="My current work" description="Assigned conversations by status.">
          {workload.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              You have no conversations assigned right now.
            </p>
          ) : (
            <ul className="space-y-1">
              {workload.map((w) => (
                <li key={String(w['status'])}>
                  <Link
                    to="/inbox"
                    search={{ tab: "mine", status: String(w['status']) }}
                    className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-muted/60"
                  >
                    <span>{STATUS_LABEL[String(w['status'])] ?? String(w['status'])}</span>
                    <span className="font-semibold tabular-nums">{fmtNum(w['count'])}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Row 3 — my performance + trend ------------------------------------- */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Panel
          title="My performance"
          description={`Historical performance for ${PERIOD_LABEL[period].toLowerCase()}.`}
          className="xl:col-span-2"
          actions={
            <select
              aria-label="Performance period"
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={period}
              onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
            >
              {DASHBOARD_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          }
        >
          {handled === 0 && num(perf['claimed']) === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No completed conversations yet. Once you begin handling visitor conversations, your
              response and resolution metrics will appear here.
            </p>
          ) : (
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <MetricRow label="Conversations claimed" value={fmtNum(perf['claimed'])} delta={<Delta current={maybe(perf['claimed'])} previous={maybe(prev['claimed'])} />} />
                <MetricRow label="Conversations handled" value={fmtNum(perf['handled'])} tooltip={TIP.handled} delta={<Delta current={maybe(perf['handled'])} previous={maybe(prev['handled'])} />} />
                <MetricRow label="Resolved" value={fmtNum(perf['resolved'])} />
                <MetricRow label="Closed" value={fmtNum(perf['closed'])} />
                <MetricRow
                  label="Completion rate"
                  value={maybe(perf['completion_rate']) === null ? "—" : `${fmtNum(perf['completion_rate'])}%`}
                  tooltip={TIP.completion}
                  delta={<Delta current={maybe(perf['completion_rate'])} previous={maybe(prev['completion_rate'])} />}
                />
                {canTransfer ? (
                  <>
                    <MetricRow label="Transfers initiated" value={fmtNum(perf['transfers'])} />
                    <MetricRow label="Reassignments" value={fmtNum(perf['reassignments'])} />
                  </>
                ) : null}
              </div>
              <div>
                <MetricRow
                  label="Avg. first response"
                  value={fmtMin(perf['avg_first_response'])}
                  tooltip={TIP.firstResponse}
                  delta={<Delta current={maybe(perf['avg_first_response'])} previous={maybe(prev['avg_first_response'])} lowerIsBetter />}
                />
                <MetricRow label="Median first response" value={csatCount >= 0 && handled >= 5 ? fmtMin(perf['median_first_response']) : "Not enough volume"} />
                <MetricRow label="Avg. time to claim" value={fmtMin(perf['avg_claim_time'])} tooltip={TIP.claim} />
                <MetricRow label="Avg. handle time" value={fmtMin(perf['avg_handle_time'])} tooltip={TIP.handle} />
                <MetricRow
                  label="SLA compliance"
                  value={maybe(perf['sla_percent']) === null ? "—" : `${fmtNum(perf['sla_percent'])}%`}
                  tooltip={TIP.sla}
                  delta={<Delta current={maybe(perf['sla_percent'])} previous={maybe(prev['sla_percent'])} />}
                />
                <MetricRow
                  label="Visitor satisfaction"
                  value={csatCount > 0 ? `${fmtNum(perf['csat'])} / 5` : "No ratings yet"}
                />
                {maybe(benchmark['department_avg_first_response']) !== null ? (
                  <MetricRow
                    label="Department average response"
                    value={fmtMin(benchmark['department_avg_first_response'])}
                    tooltip="Privacy-safe benchmark: the department average, never individual coworkers."
                  />
                ) : null}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="My conversation activity"
          description={period === "today" ? "By hour" : "By day"}
          actions={
            <select
              aria-label="Trend metric"
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={trendMetric}
              onChange={(e) => setTrendMetric(e.target.value as typeof trendMetric)}
            >
              <option value="handled">Handled</option>
              <option value="completed">Completed</option>
              <option value="response">Response time</option>
            </select>
          }
        >
          <ColumnChart data={trendRows} labelKey="bucket" valueKey="value" />
        </Panel>
      </div>

      {/* Goals — only when an administrator configured them ------------------ */}
      {goals.length > 0 ? (
        <div className="mb-6">
          <Panel title="My goals" description="Targets configured by your administrator.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {goals.map((g, i) => (
                <div key={i} className="contents">
                  {maybe(g['first_response_minutes']) !== null ? (
                    <Kpi
                      label="First response goal"
                      value={fmtMin(perf['avg_first_response'])}
                      hint={`Target: under ${fmtMin(g['first_response_minutes'])}`}
                      tone={
                        maybe(perf['avg_first_response']) !== null &&
                        num(perf['avg_first_response']) <= num(g['first_response_minutes'])
                          ? "good"
                          : "warn"
                      }
                    />
                  ) : null}
                  {maybe(g['sla_percent']) !== null ? (
                    <Kpi
                      label="SLA goal"
                      value={`${fmtNum(perf['sla_percent'])}%`}
                      hint={`Target: ${fmtNum(g['sla_percent'])}%`}
                      tone={num(perf['sla_percent']) >= num(g['sla_percent']) ? "good" : "warn"}
                    />
                  ) : null}
                  {maybe(g['completion_percent']) !== null ? (
                    <Kpi
                      label="Completion goal"
                      value={`${fmtNum(perf['completion_rate'])}%`}
                      hint={`Target: ${fmtNum(g['completion_percent'])}%`}
                      tone={num(perf['completion_rate']) >= num(g['completion_percent']) ? "good" : "warn"}
                    />
                  ) : null}
                  {maybe(g['csat_target']) !== null ? (
                    <Kpi
                      label="Satisfaction goal"
                      value={csatCount > 0 ? `${fmtNum(perf['csat'])} / 5` : "No ratings yet"}
                      hint={`Target: ${fmtNum(g['csat_target'])} / 5`}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {/* Available conversations -------------------------------------------- */}
      <div className="mb-6">
        <Panel
          title="Available conversations"
          description="Waiting visitors you are eligible to claim."
          actions={
            <Link to="/inbox" search={{ tab: "waiting" }} className="text-sm text-primary hover:underline">
              Open queue
            </Link>
          }
        >
          {claimable.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">The queue is clear.</p>
          ) : (
            <ul className="divide-y divide-border">
              {claimable.map((c) => (
                <li key={String(c['id'])} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <div className="min-w-[200px] flex-1">
                    <p className="font-medium">
                      {String(c['contact_name'] ?? "Website visitor")} — {String(c['subject'])}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Waiting {age(c['waiting_minutes'])} · {String(c['department'] ?? "No department")} ·{" "}
                      {String(c['priority'])} priority
                    </p>
                  </div>
                  {c['escalation_requested'] ? <Badge>Agent requested</Badge> : null}
                  <Button
                    size="sm"
                    onClick={() => claimMutation.mutate(String(c['id']))}
                    disabled={claimMutation.isPending}
                  >
                    Claim
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/inbox" search={{ c: String(c['id']), tab: "waiting" }}>
                      Open
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Requests ------------------------------------------------------------ */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Panel
          title="Requests"
          description={scope === "self" ? "Referral and enrollment work assigned to you." : "Intake workload."}
          actions={
            <Link to="/intake" className="text-sm text-primary hover:underline">
              Open intake
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2 text-sm">
            <MetricRow label="Assigned to me" value={fmtNum(requests['mine'])} />
            <MetricRow label="Overdue" value={fmtNum(requests['overdue'])} />
            <MetricRow label="New referrals" value={fmtNum(requests['new_referrals'])} />
            <MetricRow label="Enrollment" value={fmtNum(requests['enrollment'])} />
            <MetricRow label="Callbacks" value={fmtNum(requests['callbacks'])} />
            <MetricRow label="Open total" value={fmtNum(requests['open_total'])} />
          </div>
        </Panel>

        {scope !== "self" ? (
          <Panel title="Staff availability" description="Live presence across your scope." className="xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label="Available" value={fmtNum(availability['available'])} tone="good" to="/staff" />
              <Kpi label="Busy" value={fmtNum(availability['busy'])} to="/staff" />
              <Kpi label="Away" value={fmtNum(availability['away'])} to="/staff" />
              <Kpi label="Offline" value={fmtNum(availability['offline'])} to="/staff" />
              <Kpi
                label="At capacity"
                value={fmtNum(availability['at_capacity'])}
                tone={num(availability['at_capacity']) ? "warn" : "default"}
                to="/staff"
              />
            </div>
          </Panel>
        ) : null}
      </div>

      {/* Team / manager scope ------------------------------------------------ */}
      {scope !== "self" ? (
        <>
          <div className="mb-6">
            <Panel
              title={scope === "organization" ? "Department performance" : "My departments"}
              description="Queue health and performance for the period. Click a row for full reports."
            >
              <DataTable
                columns={[
                  { key: "name", label: "Department", render: (r) => String(r['name'] ?? "—") },
                  { key: "open", label: "Open", align: "right" },
                  { key: "waiting", label: "Waiting", align: "right" },
                  { key: "active", label: "Active", align: "right" },
                  { key: "completed_today", label: "Completed today", align: "right" },
                  {
                    key: "oldest_waiting_minutes",
                    label: "Oldest waiting",
                    align: "right",
                    render: (r) => age(r['oldest_waiting_minutes']),
                  },
                  {
                    key: "sla_risk",
                    label: "SLA risk",
                    align: "right",
                    render: (r) => (
                      <span className={num(r['sla_risk']) ? "font-semibold text-destructive" : ""}>
                        {fmtNum(r['sla_risk'])}
                      </span>
                    ),
                  },
                  {
                    key: "avg_first_response",
                    label: "Avg response",
                    align: "right",
                    render: (r) => fmtMin(r['avg_first_response']),
                  },
                  {
                    key: "sla_percent",
                    label: "SLA %",
                    align: "right",
                    render: (r) => (maybe(r['sla_percent']) === null ? "—" : `${fmtNum(r['sla_percent'])}%`),
                  },
                  {
                    key: "csat",
                    label: "CSAT",
                    align: "right",
                    render: (r) => (maybe(r['csat']) === null ? "—" : `${fmtNum(r['csat'])}/5`),
                  },
                  { key: "available_staff", label: "Available staff", align: "right" },
                ]}
                rows={departments}
                empty="No departments in your scope yet."
                onRowClick={(r) => navigate({ to: "/reports", search: { department: String(r['id']) } as never })}
              />
            </Panel>
          </div>

          <div className="mb-6">
            <Panel
              title={scope === "organization" ? "Agent workload" : "My team today"}
              description="Presence, live workload and today's outcomes for staff in your scope."
            >
              <DataTable
                columns={[
                  { key: "full_name", label: "Staff", render: (r) => String(r['full_name'] ?? "—") },
                  { key: "department", label: "Department", render: (r) => String(r['department'] ?? "—") },
                  {
                    key: "presence",
                    label: "Presence",
                    render: (r) => <span className="capitalize">{String(r['presence'] ?? "offline")}</span>,
                  },
                  {
                    key: "active",
                    label: "Active / capacity",
                    align: "right",
                    render: (r) => `${fmtNum(r['active'])} / ${fmtNum(r['max_concurrent_chats'])}`,
                  },
                  { key: "waiting_reply", label: "Waiting reply", align: "right" },
                  { key: "completed_today", label: "Completed today", align: "right" },
                  {
                    key: "avg_first_response",
                    label: "Avg response",
                    align: "right",
                    render: (r) => fmtMin(r['avg_first_response']),
                  },
                  {
                    key: "sla_percent",
                    label: "SLA %",
                    align: "right",
                    render: (r) => (maybe(r['sla_percent']) === null ? "—" : `${fmtNum(r['sla_percent'])}%`),
                  },
                ]}
                rows={staff}
                empty="No staff in your scope yet."
                onRowClick={(r) => navigate({ to: "/reports", search: { staff: String(r['id']) } as never })}
              />
            </Panel>
          </div>
        </>
      ) : null}

      {/* Organization performance ------------------------------------------- */}
      {scope === "organization" ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel
            title={`${PERIOD_LABEL[period]}'s performance`}
            description="Historical organization performance for the selected period."
            className="xl:col-span-2"
          >
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <MetricRow label="Total conversations" value={fmtNum(org['total'])} />
                <MetricRow label="Human assistance requests" value={fmtNum(org['human_requests'])} />
                <MetricRow label="Claimed" value={fmtNum(org['claimed'])} />
                <MetricRow label="Completed" value={fmtNum(org['completed'])} />
                <MetricRow label="Resolved" value={fmtNum(org['resolved'])} />
                <MetricRow label="Closed without resolution" value={fmtNum(org['closed'])} />
                <MetricRow label="Reopened" value={fmtNum(org['reopened'])} />
              </div>
              <div>
                <MetricRow
                  label="Transfer rate"
                  value={maybe(org['transfer_rate']) === null ? "—" : `${fmtNum(org['transfer_rate'])}%`}
                />
                <MetricRow label="Avg. first response" value={fmtMin(org['avg_first_response'])} tooltip={TIP.firstResponse} />
                <MetricRow label="Avg. resolution" value={fmtMin(org['avg_resolution'])} />
                <MetricRow
                  label="SLA compliance"
                  value={maybe(org['sla_percent']) === null ? "—" : `${fmtNum(org['sla_percent'])}%`}
                  tooltip={TIP.sla}
                />
                <MetricRow
                  label="Visitor satisfaction"
                  value={num(org['csat_count']) > 0 ? `${fmtNum(org['csat'])} / 5` : "No ratings yet"}
                />
                <MetricRow label="Escalated" value={fmtNum(org['escalated'])} />
              </div>
            </div>
          </Panel>

          <Panel title="AI vs human assistance" description="How much the assistant deflects.">
            {num(org['ai_total']) === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No assistant activity in this period.</p>
            ) : (
              <BarList
                rows={[
                  {
                    label: "AI handled",
                    value: Math.round((num(org['ai_deflected']) / num(org['ai_total'])) * 100),
                    hint: `${Math.round((num(org['ai_deflected']) / num(org['ai_total'])) * 100)}%`,
                  },
                  {
                    label: "Human assisted",
                    value: Math.round(
                      ((num(org['ai_total']) - num(org['ai_deflected'])) / num(org['ai_total'])) * 100,
                    ),
                    hint: `${Math.round(
                      ((num(org['ai_total']) - num(org['ai_deflected'])) / num(org['ai_total'])) * 100,
                    )}%`,
                  },
                  {
                    label: "Escalation rate",
                    value:
                      num(org['total']) === 0
                        ? 0
                        : Math.round((num(org['escalated']) / num(org['total'])) * 100),
                    hint: `${
                      num(org['total']) === 0
                        ? 0
                        : Math.round((num(org['escalated']) / num(org['total'])) * 100)
                    }%`,
                  },
                ]}
              />
            )}
          </Panel>
        </div>
      ) : null}
    </AdminShell>
  );
}
