import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveCsv } from "@/lib/csv";
import { runReportFn, reportFilterOptionsFn, exportReportFn, type ReportExport } from "@/lib/reports.functions";
import { BarList, ColumnChart, DataTable, Panel, Stat, fmtDate, fmtMin, fmtNum } from "@/components/reports/primitives";
import { Pager } from "@/components/admin/Pager";
import { useSessionContext } from "@/hooks/use-session-context";
import { CONVERSATION_STATUSES, statusLabel } from "@/lib/conversation-status";
import {
  DATE_PRESETS,
  dateRangeInZone,
  formatInZone,
  isDatePreset,
  presetRange,
  safeTimeZone,
  zonedParts,
  type DatePreset,
} from "@/lib/org-time";

type Row = Record<string, unknown>;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "departments", label: "Departments" },
  { id: "staff", label: "Staff" },
  { id: "tickets", label: "Tickets" },
  { id: "transfers", label: "Transfers" },
  { id: "sla", label: "Response & SLA" },
  { id: "ai", label: "AI assistant" },
  { id: "intake", label: "Requests" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TYPES = [
  { value: "all", label: "All conversations" },
  { value: "ai_only", label: "AI only" },
  { value: "human", label: "Human handled" },
  { value: "escalated", label: "Escalated" },
];

const TRANSFERS = [
  { value: "all", label: "Any transfers" },
  { value: "never", label: "Never transferred" },
  { value: "once", label: "Transferred once" },
  { value: "multi", label: "Transferred 2+" },
];

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const TICKET_FLAGS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting" },
  { value: "unassigned", label: "Unassigned" },
  { value: "breach", label: "SLA breach" },
  { value: "no_response", label: "No agent reply" },
  { value: "stale", label: "Stale 4h+" },
  { value: "aged", label: "Aged 24h+" },
  { value: "transferred", label: "Transferred" },
  { value: "multi_transfer", label: "Transferred 2+" },
  { value: "reopened", label: "Reopened" },
  { value: "escalated", label: "Escalated" },
  { value: "completed", label: "Completed" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "ai_only_completed", label: "AI-only completed" },
  { value: "ai_unresolved", label: "AI unresolved" },
];

/**
 * Report state lives in the URL so a configuration can be bookmarked, shared
 * with a colleague, or reopened after a refresh. Only identifiers and
 * vocabulary values are stored — never a visitor name, message, email, phone
 * number or any other personal detail. Identifiers are not trusted either: the
 * server clamps every one of them to the caller's own reporting scope.
 */
type Search = {
  tab: TabId;
  preset: DatePreset;
  from?: string;
  to?: string;
  dept?: string;
  staff?: string;
  website?: string;
  type: string;
  transfer: string;
  priority?: string;
  status?: string;
  sla: number;
  flag: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
};

const DEFAULTS: Search = {
  tab: "overview",
  preset: "last30",
  type: "all",
  transfer: "all",
  sla: 15,
  flag: "all",
  sort: "created_at",
  dir: "desc",
  page: 0,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function uuidOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    tab: oneOf(raw['tab'], TABS.map((t) => t.id), DEFAULTS.tab)!,
    preset: isDatePreset(raw['preset']) ? raw['preset'] : DEFAULTS.preset,
    from: typeof raw['from'] === "string" && DATE.test(raw['from']) ? raw['from'] : undefined,
    to: typeof raw['to'] === "string" && DATE.test(raw['to']) ? raw['to'] : undefined,
    dept: uuidOrUndefined(raw['dept']),
    staff: uuidOrUndefined(raw['staff']),
    website: uuidOrUndefined(raw['website']),
    type: oneOf(raw['type'], TYPES.map((t) => t.value), DEFAULTS.type)!,
    transfer: oneOf(raw['transfer'], TRANSFERS.map((t) => t.value), DEFAULTS.transfer)!,
    priority: oneOf(raw['priority'], PRIORITIES),
    status: oneOf(raw['status'], CONVERSATION_STATUSES),
    sla: Math.min(1440, Math.max(1, Number(raw['sla']) || DEFAULTS.sla)),
    flag: oneOf(raw['flag'], TICKET_FLAGS.map((f) => f.value), DEFAULTS.flag)!,
    sort: typeof raw['sort'] === "string" ? raw['sort'].slice(0, 30) : DEFAULTS.sort,
    dir: raw['dir'] === "asc" ? "asc" : "desc",
    page: Math.max(0, Math.min(2000, Number(raw['page']) || 0)),
  }),
  head: () => ({
    meta: [
      { title: "Reporting & Analytics — Pacific Health Group Support Console" },
      {
        name: "description",
        content:
          "Operational reporting for conversations, departments, staff performance, transfers, SLA, AI assistant outcomes, and intake requests.",
      },

      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsRoute,
});

function ReportsRoute() {
  return (
    <RequirePermission permission="reports.self" title="Reports">
      <ReportsPage />
    </RequirePermission>
  );
}

function ReportsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const session = useSessionContext();
  const optionsFn = useServerFn(reportFilterOptionsFn);
  const options = useQuery({ queryKey: ["report-options"], queryFn: () => optionsFn({}) });

  /**
   * Any change to a global filter resets paging. Without this a manager on
   * page 6 who narrows to a department with two pages of data would sit on an
   * empty page and read it as "no results".
   */
  const update = (patch: Partial<Search>, keepPage = false) =>
    navigate({
      search: (prev: Search) => ({ ...prev, ...patch, ...(keepPage ? {} : { page: 0 }) }),
      replace: true,
    });

  // Reporting days start and end in the organization's own timezone, so a
  // report reads the same for a viewer in another zone, DST included.
  const timeZone = safeTimeZone(session.data?.timezone);
  const range = useMemo(() => {
    if (search.preset === "custom" && search.from && search.to) {
      return dateRangeInZone(search.from, search.to, timeZone);
    }
    return presetRange(search.preset, timeZone);
  }, [search.preset, search.from, search.to, timeZone]);

  const filters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      departmentId: search.dept ?? null,
      staffId: search.staff ?? null,
      websiteId: search.website ?? null,
      statuses: search.status ? [search.status] : null,
      type: search.type as "all",
      transfer: search.transfer as "all",
      priority: (search.priority ?? null) as null,
      sla: search.sla,
    }),
    [range, search.dept, search.staff, search.website, search.status, search.type, search.transfer, search.priority, search.sla],
  );

  // An identifier that is not in the caller's own option lists is dropped
  // rather than sent: a hand-edited URL can never widen the reporting scope.
  const opts = options.data;
  useEffect(() => {
    if (!opts) return;
    const patch: Partial<Search> = {};
    if (search.dept && !opts.departments.some((d) => d.id === search.dept)) patch.dept = undefined;
    if (search.staff && !opts.staff.some((s) => s.id === search.staff)) patch.staff = undefined;
    if (search.website && !opts.websites.some((w) => w.id === search.website)) patch.website = undefined;
    if (search.tab !== "overview" && opts.sections && !opts.sections.includes(search.tab)) patch.tab = "overview";
    if (Object.keys(patch).length) update(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, search.dept, search.staff, search.website, search.tab]);

  const filterSummary = `${formatInZone(range.from, timeZone)} – ${formatInZone(range.to, timeZone)} · Times shown in ${timeZone}`;

  const sections = opts?.sections as readonly string[] | undefined;
  const allowed = (id: TabId) => search.tab === id && (!sections || sections.includes(id));

  /** Open the exact rows behind a period KPI, keeping every current filter. */
  const drill = (flag: string) => update({ tab: "tickets", flag });

  /**
   * Live snapshot tiles ("open now", "waiting now") count everything on the
   * floor regardless of when it started, so their drill-down widens the date
   * range and clears the conversation-shape filters the snapshot ignores.
   * Department and staff scope are kept, because the snapshot honours those.
   */
  const drillLive = (flag: string) => {
    const p = zonedParts(new Date(), timeZone);
    update({
      tab: "tickets",
      flag,
      preset: "custom",
      from: "2000-01-01",
      to: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
      status: undefined,
      website: undefined,
      priority: undefined,
      type: "all",
      transfer: "all",
    });
  };

  const resetFilters = () =>
    navigate({ search: { ...DEFAULTS, tab: search.tab }, replace: true });

  const tabProps = { filters, search, update, drill, drillLive };

  return (
    <AdminShell
      title="Reporting & analytics"
      description="Operational performance across conversations, departments, people, transfers, response times, AI, and requests."
      actions={
        <Badge variant="outline" className="text-[11px]">
          Scope: {opts?.scope ?? "…"}
        </Badge>
      }
    >
      {/* Global filter bar — every tab reads the same filters. */}
      <div className="sticky top-0 z-10 -mx-1 mb-4 rounded-xl border border-border bg-card/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={search.preset}
            onChange={(e) => update({ preset: e.target.value as DatePreset })}
            aria-label="Date range"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {search.preset === "custom" ? (
            <>
              <input
                type="date"
                value={search.from ?? ""}
                onChange={(e) => update({ from: e.target.value || undefined })}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date"
                value={search.to ?? ""}
                onChange={(e) => update({ to: e.target.value || undefined })}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                aria-label="To date"
              />
            </>
          ) : null}

          <Select value={search.dept ?? ""} onChange={(v) => update({ dept: v || undefined })} label="All departments">
            {(opts?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={search.staff ?? ""} onChange={(v) => update({ staff: v || undefined })} label="All staff">
            {(opts?.staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value={search.website ?? ""}
            onChange={(v) => update({ website: v || undefined })}
            label="All websites"
          >
            {(opts?.websites ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <Select value={search.type} onChange={(v) => update({ type: v })} label="All conversations" hideBlank>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select value={search.transfer} onChange={(v) => update({ transfer: v })} label="Any transfers" hideBlank>
            {TRANSFERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select value={search.status ?? ""} onChange={(v) => update({ status: v || undefined })} label="Any status">
            {CONVERSATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
          <Select
            value={search.priority ?? ""}
            onChange={(v) => update({ priority: v || undefined })}
            label="Any priority"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            SLA
            <input
              type="number"
              min={1}
              max={1440}
              value={search.sla}
              onChange={(e) => update({ sla: Math.max(1, Number(e.target.value) || 15) })}
              className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
            min
          </label>
          <Button variant="ghost" size="sm" className="text-xs" onClick={resetFilters}>
            Reset
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{filterSummary}</p>
      </div>

      <nav className="mb-4 flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.filter((t) => !sections || sections.includes(t.id)).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => update({ tab: t.id })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              search.tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* A tab outside the caller's scope is never rendered. */}
      {allowed("overview") ? <OverviewTab {...tabProps} /> : null}
      {allowed("departments") ? <DepartmentsTab {...tabProps} /> : null}
      {allowed("staff") ? <StaffTab {...tabProps} /> : null}
      {allowed("tickets") ? <TicketsTab {...tabProps} /> : null}
      {allowed("transfers") ? <TransfersTab {...tabProps} /> : null}
      {allowed("sla") ? <SlaTab {...tabProps} /> : null}
      {allowed("ai") ? <AiTab {...tabProps} /> : null}
      {allowed("intake") ? <IntakeTab {...tabProps} /> : null}
    </AdminShell>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
  hideBlank,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
  hideBlank?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-md border border-border bg-background px-2 py-1.5 text-xs capitalize"
    >
      {hideBlank ? null : <option value="">{label}</option>}
      {children}
    </select>
  );
}

/* ------------------------------- data hook -------------------------------- */

type Filters = {
  from: string;
  to: string;
  departmentId: string | null;
  staffId: string | null;
  websiteId: string | null;
  statuses: string[] | null;
  type: "all";
  transfer: "all";
  priority: null;
  sla: number;
};

type TabProps = {
  filters: Filters;
  search: Search;
  update: (patch: Partial<Search>, keepPage?: boolean) => void;
  drill: (flag: string) => void;
  drillLive: (flag: string) => void;
};

function useReport<T>(section: string, filters: Filters, options?: Record<string, unknown>) {
  const run = useServerFn(runReportFn);
  return useQuery({
    queryKey: ["report", section, filters, options],
    queryFn: async () => {
      const res = (await run({ data: { section: section as "overview", filters, options } })) as {
        json: string;
      };
      return JSON.parse(res.json) as T;
    },
  });
}

function Loading({ query }: { query: { isLoading: boolean; error: unknown } }) {
  if (query.isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Building report…</p>;
  if (query.error)
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {(query.error as Error).message || "Could not build that report."}
      </p>
    );
  return null;
}

/**
 * Exports run on the server against the same authorized, filtered query as the
 * report on screen — the file holds the whole result, not the page in view.
 */
function ExportButton({
  dataset,
  filters,
  options,
}: {
  dataset: ReportExport;
  filters: Filters;
  options?: Record<string, unknown>;
}) {
  const run = useServerFn(exportReportFn);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = (await run({ data: { dataset, filters, options } })) as {
            filename: string;
            csv: string;
            rows: number;
            truncated: boolean;
            cap: number;
          };
          if (!res.rows) {
            toast.info("Nothing to export for these filters.");
            return;
          }
          saveCsv(res.filename, res.csv);
          toast.success(
            res.truncated
              ? `Exported the first ${res.cap.toLocaleString()} rows — narrow the filters for the rest.`
              : `Exported ${res.rows.toLocaleString()} rows.`,
          );
        } catch (error) {
          toast.error((error as Error).message || "Could not build that export.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Exporting…" : "Export CSV"}
    </Button>
  );
}

/* --------------------------------- tabs ----------------------------------- */

function OverviewTab({ filters, drill, drillLive }: TabProps) {
  const q = useReport<{
    kpis: Row;
    funnel: Row;
    snapshot: Row;
    csat: number | null;
    csat_responses: number;
    transfer_events: number;
  }>("overview", filters);
  const volume = useReport<{ by_day: Row[]; by_hour: Row[]; by_weekday: Row[]; peak_day: string | null; peak_day_count: number }>(
    "volume",
    filters,
  );
  if (q.isLoading || q.error) return <Loading query={q} />;
  const k = q.data?.kpis ?? {};
  const f = q.data?.funnel ?? {};
  const s = q.data?.snapshot ?? {};
  const total = Number(f['created'] ?? 0);
  const pct = (v: unknown) => (total ? `${Math.round((Number(v ?? 0) / total) * 100)}%` : "—");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Conversations" value={fmtNum(k['total'])} hint={`${fmtNum(k['escalated'])} asked for a human`} />
        {/*
          Deliberately *not* called "AI handled end-to-end": this only says a
          human was never requested. The defensible completion measure lives on
          the AI assistant tab, where the outcome is also checked.
        */}
        <Stat
          label="Never asked for a human"
          value={pct(f['ai_handled'])}
          hint={`${fmtNum(f['ai_handled'])} of ${fmtNum(total)} conversations`}
        />
        <Stat
          label="Avg. first response"
          value={fmtMin(k['avg_first_response'])}
          hint={`${fmtNum(k['sla_met'])}/${fmtNum(k['sla_eligible'])} within SLA`}
          tone={Number(k['sla_eligible'] ?? 0) && !Number(k['sla_met'] ?? 0) ? "warn" : "default"}
          onDrill={() => drill("breach")}
          drillLabel="SLA breaches"
        />
        <Stat
          label="Avg. resolution"
          value={fmtMin(k['avg_resolution'])}
          hint={`${fmtNum(k['completed'])} completed`}
          onDrill={() => drill("completed")}
          drillLabel="completed tickets"
        />
        <Stat
          label="Open now"
          value={fmtNum(s['open_now'])}
          hint={`${fmtNum(s['unassigned_now'])} unassigned`}
          onDrill={() => drillLive("open")}
          drillLabel="open tickets"
        />
        <Stat
          label="Waiting for a human"
          value={fmtNum(s['waiting_now'])}
          tone={Number(s['waiting_now'] ?? 0) > 0 ? "warn" : "good"}
          hint={s['oldest_waiting'] ? `Oldest since ${fmtDate(s['oldest_waiting'])}` : "Queue is clear"}
          onDrill={() => drillLive("waiting")}
          drillLabel="waiting tickets"
        />
        <Stat
          label="Breaching SLA now"
          value={fmtNum(s['breaching_now'])}
          tone={Number(s['breaching_now'] ?? 0) > 0 ? "warn" : "good"}
          onDrill={() => drillLive("breach")}
          drillLabel="breaching tickets"
        />
        <Stat
          label="CSAT"
          value={q.data?.csat ? `${q.data.csat}/5` : "—"}
          hint={`${fmtNum(q.data?.csat_responses)} ratings`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Operational funnel" description="Where conversations end up after they start.">
          <BarList
            rows={[
              { label: "Created", value: Number(f['created'] ?? 0) },
              { label: "Never asked for a human", value: Number(f['ai_handled'] ?? 0) },
              { label: "Asked for a human", value: Number(f['human_requested'] ?? 0) },
              { label: "Claimed by an agent", value: Number(f['claimed'] ?? 0) },
              { label: "Agent responded", value: Number(f['responded'] ?? 0) },
              { label: "Resolved", value: Number(f['resolved'] ?? 0) },
              { label: "Closed", value: Number(f['closed'] ?? 0) },
              { label: "Still waiting", value: Number(f['waiting'] ?? 0) },
            ]}
          />
        </Panel>
        <Panel title="Volume by day">
          {volume.data ? <ColumnChart data={volume.data.by_day} labelKey="day" valueKey="conversations" /> : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Peak day {volume.data?.peak_day ?? "—"} ({fmtNum(volume.data?.peak_day_count)} conversations)
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Busiest hours" description="Conversations started, by hour of day.">
          {volume.data ? <ColumnChart data={volume.data.by_hour} labelKey="hour" valueKey="conversations" height={120} /> : null}
        </Panel>
        <Panel title="Workload health" description="Click a row's number on the Tickets tab to see the conversations.">
          <BarList
            rows={[
              { label: "Abandoned (no agent reply)", value: Number(k['abandoned'] ?? 0) },
              { label: "Unanswered escalations", value: Number(k['unanswered'] ?? 0) },
              { label: "Reopened", value: Number(k['reopened'] ?? 0) },
              { label: "Transferred", value: Number(k['transferred'] ?? 0) },
              { label: "Transferred 2+ times", value: Number(k['multi_transferred'] ?? 0) },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => drill("no_response")}>
              No agent reply
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => drill("reopened")}>
              Reopened
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => drill("transferred")}>
              Transferred
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => drill("multi_transfer")}>
              Transferred 2+
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DepartmentsTab({ filters }: TabProps) {
  const q = useReport<Row[]>("departments", filters);
  const backlog = useReport<Row[]>("backlog", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Department performance"
        description="Volume, speed, and outcomes per department for the selected period."
        actions={<ExportButton dataset="departments" filters={filters} />}
      >
        <DataTable
          rows={rows}
          columns={[
            { key: "department_name", label: "Department", render: (r) => String(r['department_name'] ?? "—") },
            { key: "total", label: "Total", align: "right" },
            { key: "escalated", label: "To human", align: "right" },
            { key: "open_count", label: "Open", align: "right" },
            { key: "completed", label: "Completed", align: "right" },
            { key: "avg_claim", label: "Avg claim", align: "right", render: (r) => fmtMin(r['avg_claim']) },
            { key: "avg_first_response", label: "Avg response", align: "right", render: (r) => fmtMin(r['avg_first_response']) },
            { key: "avg_resolution", label: "Avg resolution", align: "right", render: (r) => fmtMin(r['avg_resolution']) },
            { key: "sla_pct", label: "SLA %", align: "right", render: (r) => fmtNum(r['sla_pct'], "%") },
            { key: "transfers_in", label: "In", align: "right" },
            { key: "transfers_out", label: "Out", align: "right" },
            { key: "csat", label: "CSAT", align: "right", render: (r) => fmtNum(r['csat']) },
          ]}
        />
      </Panel>

      <Panel
        title="Live backlog"
        description="Current state, ignoring the date filter — this is what is on the floor right now."
        actions={<ExportButton dataset="backlog" filters={filters} />}
      >
        <DataTable
          rows={backlog.data ?? []}
          empty="Nothing open."
          columns={[
            { key: "department_name", label: "Department", render: (r) => String(r['department_name'] ?? "—") },
            { key: "open", label: "Open", align: "right" },
            { key: "waiting", label: "Waiting", align: "right" },
            { key: "assigned", label: "Assigned", align: "right" },
            { key: "active", label: "Active", align: "right" },
            { key: "breaching", label: "Breaching", align: "right" },
            { key: "aged_24h", label: ">24h", align: "right" },
            { key: "oldest_open_at", label: "Oldest", render: (r) => fmtDate(r['oldest_open_at']) },
          ]}
        />
      </Panel>
    </div>
  );
}

function StaffTab({ filters, update }: TabProps) {
  const q = useReport<Row[]>("staff", filters);
  const workload = useReport<Row[]>("workload", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Agent performance"
        description="Credited by who claimed, replied, and resolved — not merely who is assigned now. Click a row to see that person's tickets."
        actions={<ExportButton dataset="staff" filters={filters} />}
      >
        <DataTable
          rows={rows}
          onRowClick={(r) =>
            r['user_id'] ? update({ tab: "tickets", staff: String(r['user_id']), flag: "all" }) : undefined
          }
          columns={[
            { key: "full_name", label: "Agent", render: (r) => String(r['full_name'] ?? "—") },
            { key: "departments", label: "Departments", render: (r) => String(r['departments'] ?? "—") },
            { key: "claimed", label: "Claimed", align: "right" },
            { key: "messages_sent", label: "Replies", align: "right" },
            { key: "resolved", label: "Resolved", align: "right" },
            { key: "closed", label: "Closed", align: "right" },
            { key: "avg_claim", label: "Avg claim", align: "right", render: (r) => fmtMin(r['avg_claim']) },
            { key: "avg_response", label: "Avg response", align: "right", render: (r) => fmtMin(r['avg_response']) },
            { key: "avg_handle", label: "Avg handle", align: "right", render: (r) => fmtMin(r['avg_handle']) },
            { key: "sla_pct", label: "SLA %", align: "right", render: (r) => fmtNum(r['sla_pct'], "%") },
            { key: "transfers_initiated", label: "Transfers", align: "right" },
            { key: "csat", label: "CSAT", align: "right", render: (r) => fmtNum(r['csat']) },
          ]}
        />
      </Panel>

      <Panel title="Live workload" description="Open chats against each agent's capacity right now.">
        <BarList
          rows={(workload.data ?? []).map((w) => ({
            label: `${String(w['full_name'])} · ${String(w['presence'])}`,
            value: Number(w['utilisation'] ?? 0),
            hint: `${fmtNum(w['open_chats'])}/${fmtNum(w['max_chats'])}`,
          }))}
          emptyLabel="No staff in scope."
        />
      </Panel>
    </div>
  );
}

function TicketsTab({ filters, search, update }: TabProps) {
  const navigate = useNavigate();
  const limit = 50;
  const options = {
    flag: search.flag,
    sort: search.sort,
    dir: search.dir,
    limit,
    offset: search.page * limit,
  };

  const q = useReport<{ total: number; rows: Row[] }>("tickets", filters, options);
  const busy = q.isLoading || Boolean(q.error);
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  const toggleSort = (key: string) =>
    update({ sort: key, dir: search.sort === key && search.dir === "desc" ? "asc" : "desc" });

  return (
    <Panel
      title="Ticket explorer"
      description="Every conversation in scope, with the timings behind the aggregates. Click a row to open it in the inbox."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={search.flag}
            onChange={(e) => update({ flag: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            aria-label="Ticket filter"
          >
            {TICKET_FLAGS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <ExportButton dataset="tickets" filters={filters} options={{ flag: search.flag, sort: search.sort, dir: search.dir }} />
        </div>
      }
    >
      {busy ? (
        <Loading query={q} />
      ) : (
        <>
          <DataTable
            rows={rows}
            sort={{ key: search.sort, dir: search.dir }}
            onSort={toggleSort}
            onRowClick={(r) => navigate({ to: "/inbox", search: { c: String(r['id']) } })}
            columns={[
              { key: "reference", label: "Reference", sortable: true, render: (r) => String(r['reference'] ?? "—") },
              { key: "created_at", label: "Started", sortable: true, render: (r) => fmtDate(r['created_at']) },
              { key: "contact_name", label: "Visitor", render: (r) => String(r['contact_name'] ?? "Anonymous") },
              { key: "department", label: "Department", sortable: true, render: (r) => String(r['department_name'] ?? "—") },
              { key: "assigned", label: "Agent", sortable: true, render: (r) => String(r['assigned_name'] ?? "Unassigned") },
              {
                key: "status",
                label: "Status",
                sortable: true,
                render: (r) => (
                  <Badge variant={r['sla_breached'] ? "destructive" : "outline"} className="capitalize">
                    {statusLabel(String(r['status']))}
                  </Badge>
                ),
              },
              { key: "transfer_count", label: "Transfers", align: "right", sortable: true },
              { key: "claim_min", label: "Claim", align: "right", sortable: true, render: (r) => fmtMin(r['claim_min']) },
              { key: "resp_min", label: "Response", align: "right", sortable: true, render: (r) => fmtMin(r['resp_min']) },
              { key: "res_min", label: "Resolution", align: "right", sortable: true, render: (r) => fmtMin(r['res_min']) },
              { key: "csat", label: "CSAT", align: "right", sortable: true, render: (r) => fmtNum(r['csat']) },
            ]}
          />
          <Pager
            page={search.page}
            pageSize={limit}
            total={total}
            onPage={(p) => update({ page: p }, true)}
            noun="tickets"
            busy={q.isFetching}
          />
        </>
      )}
    </Panel>
  );
}

function TransfersTab({ filters, search, update }: TabProps) {
  // The transfer log is paged in SQL — the browser only ever holds one page.
  const limit = 50;
  const q = useReport<{
    overview: Row;
    matrix: Row[];
    rows: Row[];
    rows_total: number;
    repeat_conversations: Row[];
  }>("transfers", filters, { limit, offset: search.page * limit });
  if (q.isLoading || q.error) return <Loading query={q} />;
  const o = q.data?.overview ?? {};

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Transfer events" value={fmtNum(o['transfer_events'])} hint="Individual hand-offs, not tickets" />
        <Stat
          label="Conversations transferred"
          value={fmtNum(o['transferred_conversations'])}
          hint={`${fmtNum(o['transfer_rate'], "%")} of volume`}
          onDrill={() => update({ tab: "tickets", flag: "transferred" })}
          drillLabel="transferred tickets"
        />
        <Stat
          label="Transferred more than once"
          value={fmtNum(o['multi_transfer_conversations'])}
          hint={`${fmtNum(o['multi_transfer_rate'], "%")} of transferred`}
          tone={Number(o['multi_transfer_rate'] ?? 0) > 25 ? "warn" : "default"}
          onDrill={() => update({ tab: "tickets", flag: "multi_transfer" })}
          drillLabel="tickets transferred 2+ times"
        />
        <Stat label="Avg transfers per ticket" value={fmtNum(o['avg_transfers_per_conversation'])} />
      </div>

      <Panel
        title="Routing matrix"
        description="Where work moves from and to."
        actions={<ExportButton dataset="transfer_matrix" filters={filters} />}
      >
        <DataTable
          rows={q.data?.matrix ?? []}
          columns={[
            { key: "from_department", label: "From", render: (r) => String(r['from_department']) },
            { key: "to_department", label: "To", render: (r) => String(r['to_department']) },
            { key: "n", label: "Transfers", align: "right" },
          ]}
        />
      </Panel>

      <Panel title="Repeatedly transferred" description="Tickets bounced between teams — usually a routing or knowledge gap.">
        <DataTable
          rows={q.data?.repeat_conversations ?? []}
          empty="No ticket was transferred more than once."
          columns={[
            { key: "reference", label: "Reference", render: (r) => String(r['reference']) },
            { key: "transfers", label: "Transfers", align: "right" },
            { key: "last_transfer_at", label: "Last transfer", render: (r) => fmtDate(r['last_transfer_at']) },
          ]}
        />
      </Panel>

      <Panel title="Transfer log" actions={<ExportButton dataset="transfers" filters={filters} />}>
        <DataTable
          rows={q.data?.rows ?? []}
          columns={[
            { key: "transferred_at", label: "When", render: (r) => fmtDate(r['transferred_at']) },
            { key: "reference", label: "Ticket", render: (r) => String(r['reference']) },
            { key: "from_department", label: "From", render: (r) => String(r['from_department']) },
            { key: "to_department", label: "To", render: (r) => String(r['to_department']) },
            { key: "transferred_by", label: "By", render: (r) => String(r['transferred_by'] ?? "System") },
            { key: "status_after", label: "Now", render: (r) => statusLabel(String(r['status_after'])) },
          ]}
        />
        <Pager
          page={search.page}
          pageSize={limit}
          total={Number(q.data?.rows_total ?? 0)}
          onPage={(p) => update({ page: p }, true)}
          noun="transfers"
          busy={q.isFetching}
        />
      </Panel>
    </div>
  );
}

function SlaTab({ filters, drill }: TabProps) {
  const q = useReport<{
    metrics: Row;
    by_department: Row[];
    by_staff: Row[];
    by_day: Row[];
    oldest_waiting_at: string | null;
    oldest_active_at: string | null;
  }>("sla", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const m = q.data?.metrics ?? {};
  const eligible = Number(m['sla_eligible'] ?? 0);
  const met = Number(m['sla_met'] ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`Within ${filters.sla} min`}
          value={eligible ? `${Math.round((met / eligible) * 100)}%` : "—"}
          hint={`${met} of ${eligible} escalations`}
          tone={eligible && met / eligible < 0.8 ? "warn" : "good"}
          onDrill={() => drill("escalated")}
          drillLabel="escalations"
        />
        <Stat
          label="Breaches"
          value={fmtNum(m['breaches'])}
          tone={Number(m['breaches'] ?? 0) > 0 ? "warn" : "good"}
          onDrill={() => drill("breach")}
          drillLabel="breached tickets"
        />
        <Stat label="Median response" value={fmtMin(m['median_response'])} hint={`Avg ${fmtMin(m['avg_response'])}`} />
        <Stat label="p90 / p95" value={`${fmtMin(m['p90'])} / ${fmtMin(m['p95'])}`} hint={`${fmtNum(m['sample'])} samples`} />
        <Stat label="Median claim time" value={fmtMin(m['median_claim'])} hint={`Avg ${fmtMin(m['avg_claim'])}`} />
        <Stat label="Avg handle time" value={fmtMin(m['avg_handle'])} />
        <Stat label="Avg resolution" value={fmtMin(m['avg_resolution'])} />
        <Stat label="Oldest waiting" value={fmtDate(q.data?.oldest_waiting_at)} />
      </div>

      <Panel title="Response time by day">
        <ColumnChart data={q.data?.by_day ?? []} labelKey="day" valueKey="breaches" />
        <p className="mt-2 text-xs text-muted-foreground">Bars show SLA breaches per day.</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By department" actions={<ExportButton dataset="sla_departments" filters={filters} />}>
          <DataTable
            rows={q.data?.by_department ?? []}
            columns={[
              { key: "department", label: "Department", render: (r) => String(r['department']) },
              { key: "conversations", label: "Tickets", align: "right" },
              { key: "avg_response", label: "Avg", align: "right", render: (r) => fmtMin(r['avg_response']) },
              { key: "p90_response", label: "p90", align: "right", render: (r) => fmtMin(r['p90_response']) },
              { key: "breaches", label: "Breaches", align: "right" },
            ]}
          />
        </Panel>
        <Panel title="By agent" actions={<ExportButton dataset="sla_staff" filters={filters} />}>
          <DataTable
            rows={q.data?.by_staff ?? []}
            columns={[
              { key: "staff", label: "Agent", render: (r) => String(r['staff']) },
              { key: "conversations", label: "Tickets", align: "right" },
              { key: "avg_response", label: "Avg", align: "right", render: (r) => fmtMin(r['avg_response']) },
              { key: "p90_response", label: "p90", align: "right", render: (r) => fmtMin(r['p90_response']) },
              { key: "breaches", label: "Breaches", align: "right" },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

function AiTab({ filters, drill }: TabProps) {
  const q = useReport<Row>("ai", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const d = q.data ?? {};
  const eligible = Number(d['eligible'] ?? 0);

  return (
    <div className="space-y-4">
      {/*
        "AI-only completion" is deliberately strict. A conversation counts only
        when the assistant answered it, it reached a resolved or closed outcome,
        and no human was ever involved anywhere in its history — no agent reply,
        claim, assignment, transfer, escalation or request for a person. Spam
        and archived traffic is excluded entirely. Anything the assistant
        answered but never finished is reported separately as unresolved, never
        as a success.
      */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="AI answers"
          value={fmtNum(d['ai_answers'])}
          hint={`${fmtNum(d['answered_conversations'])} of ${fmtNum(d['conversations'])} conversations answered`}
        />
        <Stat
          label="Eligible AI conversations"
          value={fmtNum(eligible)}
          hint={`Answered by the assistant, excluding ${fmtNum(d['excluded'])} spam/archived`}
        />
        <Stat
          label="AI-only completion rate"
          value={d['ai_only_completion_rate'] == null ? "—" : fmtNum(d['ai_only_completion_rate'], "%")}
          hint={`${fmtNum(d['ai_only_completed'])} completed with no human involved`}
          tone={eligible === 0 ? "default" : Number(d['ai_only_completion_rate'] ?? 0) < 40 ? "warn" : "good"}
          onDrill={eligible ? () => drill("ai_only_completed") : undefined}
          drillLabel="AI-only completed tickets"
        />
        <Stat
          label="Escalated to a human"
          value={d['escalation_rate'] == null ? "—" : fmtNum(d['escalation_rate'], "%")}
          hint={`${fmtNum(d['escalated'])} involved a person`}
          tone={Number(d['escalation_rate'] ?? 0) > 50 ? "warn" : "default"}
          onDrill={eligible ? () => drill("escalated") : undefined}
          drillLabel="escalated tickets"
        />
        <Stat
          label="Unresolved / abandoned"
          value={fmtNum(d['ai_unresolved'])}
          hint="Answered by AI, never reached an outcome"
          tone={Number(d['ai_unresolved'] ?? 0) > 0 ? "warn" : "good"}
          onDrill={eligible ? () => drill("ai_unresolved") : undefined}
          drillLabel="unresolved AI tickets"
        />
        <Stat
          label="Helpful rate"
          value={d['helpful_rate'] == null ? "—" : fmtNum(d['helpful_rate'], "%")}
          hint={`${fmtNum(d['rated'])} answers rated by visitors`}
          tone={Number(d['rated'] ?? 0) > 0 && Number(d['helpful_rate'] ?? 0) < 60 ? "warn" : "default"}
        />
        <Stat
          label="Not helpful"
          value={d['unhelpful_rate'] == null ? "—" : fmtNum(d['unhelpful_rate'], "%")}
          hint={`${fmtNum(d['not_helpful'])} answers marked unhelpful`}
        />
        <Stat
          label="Avg confidence"
          value={d['avg_confidence'] == null ? "—" : fmtNum(Number(d['avg_confidence']) * 100, "%")}
          hint={`${fmtNum(d['low_confidence'])} low-confidence answers`}
          tone={Number(d['avg_confidence'] ?? 1) < 0.5 ? "warn" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Top questions"
          description="What visitors ask most."
          actions={<ExportButton dataset="ai_questions" filters={filters} />}
        >
          <BarList
            rows={((d['top_questions'] as Row[]) ?? []).map((r) => ({
              label: String(r['question']),
              value: Number(r['n'] ?? 0),
            }))}
          />
        </Panel>
        <Panel
          title="Knowledge gaps"
          description="Low-confidence answers — good candidates for new knowledge articles."
          actions={<ExportButton dataset="ai_low_confidence" filters={filters} />}
        >
          <BarList
            rows={((d['low_confidence_questions'] as Row[]) ?? []).map((r) => ({
              label: String(r['question']),
              value: Number(r['n'] ?? 0),
            }))}
            emptyLabel="No low-confidence answers."
          />
        </Panel>
      </div>

      <Panel title="Escalations by department">
        <BarList
          rows={((d['escalations_by_department'] as Row[]) ?? []).map((r) => ({
            label: String(r['department']),
            value: Number(r['n'] ?? 0),
          }))}
        />
      </Panel>
    </div>
  );
}


function IntakeTab({ filters, search, update }: TabProps) {
  // The request list is paged in SQL; the tiles above it are SQL aggregates.
  const limit = 50;
  const q = useReport<Row>("intake", filters, { limit, offset: search.page * limit });
  if (q.isLoading || q.error) return <Loading query={q} />;
  const d = q.data ?? {};
  const byType = (d['by_type'] as Row[]) ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Requests by type"
        description="Referrals, enrollments, callbacks, and general requests."
        actions={<ExportButton dataset="intake_by_type" filters={filters} />}
      >
        <DataTable
          rows={byType}
          columns={[
            { key: "request_type", label: "Type", render: (r) => String(r['request_type']).replace(/_/g, " ") },
            { key: "total", label: "Total", align: "right" },
            { key: "open", label: "Open", align: "right" },
            { key: "approved", label: "Approved", align: "right" },
            { key: "denied", label: "Denied", align: "right" },
            { key: "conversion", label: "Conversion", align: "right", render: (r) => fmtNum(r['conversion'], "%") },
          ]}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By stage">
          <BarList rows={((d['by_stage'] as Row[]) ?? []).map((r) => ({ label: String(r['stage']).replace(/_/g, " "), value: Number(r['n'] ?? 0) }))} />
        </Panel>
        <Panel title="By service interest">
          <BarList rows={((d['by_service'] as Row[]) ?? []).map((r) => ({ label: String(r['service']), value: Number(r['n'] ?? 0) }))} />
        </Panel>
        <Panel title="By county">
          <BarList rows={((d['by_county'] as Row[]) ?? []).map((r) => ({ label: String(r['county']), value: Number(r['n'] ?? 0) }))} />
        </Panel>
        <Panel title="By health plan">
          <BarList rows={((d['by_health_plan'] as Row[]) ?? []).map((r) => ({ label: String(r['health_plan']), value: Number(r['n'] ?? 0) }))} />
        </Panel>
      </div>

      <Panel title="Recent requests" actions={<ExportButton dataset="intake" filters={filters} />}>
        <DataTable
          rows={(d['rows'] as Row[]) ?? []}
          columns={[
            { key: "reference", label: "Reference", render: (r) => String(r['reference']) },
            { key: "created_at", label: "Received", render: (r) => fmtDate(r['created_at']) },
            { key: "full_name", label: "Name", render: (r) => String(r['full_name']) },
            { key: "request_type", label: "Type", render: (r) => String(r['request_type']) },
            { key: "service_interest", label: "Service", render: (r) => String(r['service_interest'] ?? "—") },
            { key: "county", label: "County", render: (r) => String(r['county'] ?? "—") },
            { key: "stage", label: "Stage", render: (r) => String(r['stage']).replace(/_/g, " ") },
            { key: "assigned_name", label: "Owner", render: (r) => String(r['assigned_name'] ?? "Unassigned") },
          ]}
        />
        <Pager
          page={search.page}
          pageSize={limit}
          total={Number(d['rows_total'] ?? 0)}
          onPage={(p) => update({ page: p }, true)}
          noun="requests"
          busy={q.isFetching}
        />
      </Panel>
    </div>
  );
}
