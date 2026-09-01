import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { runReportFn, reportFilterOptionsFn } from "@/lib/reports.functions";
import { BarList, ColumnChart, DataTable, Panel, Stat, fmtDate, fmtMin, fmtNum } from "@/components/reports/primitives";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reporting & Analytics — Pacific Health Group Support Console" },
      {
        name: "description",
        content:
          "Operational reporting for conversations, departments, staff performance, transfers, SLA, AI deflection, and intake requests.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsRoute,
});

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

const RANGES = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

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

function ReportsRoute() {
  return (
    <RequirePermission permission="reports.self" title="Reports">
      <ReportsPage />
    </RequirePermission>
  );
}

function ReportsPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [websiteId, setWebsiteId] = useState("");
  const [type, setType] = useState("all");
  const [transfer, setTransfer] = useState("all");
  const [priority, setPriority] = useState("");
  const [sla, setSla] = useState(15);

  const optionsFn = useServerFn(reportFilterOptionsFn);
  const options = useQuery({ queryKey: ["report-options"], queryFn: () => optionsFn({}) });

  const range = useMemo(() => {
    if (customFrom && customTo) {
      return {
        from: new Date(`${customFrom}T00:00:00`).toISOString(),
        to: new Date(`${customTo}T23:59:59`).toISOString(),
      };
    }
    return { from: new Date(Date.now() - days * 86_400_000).toISOString(), to: new Date().toISOString() };
  }, [customFrom, customTo, days]);

  const filters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      departmentId: departmentId || null,
      staffId: staffId || null,
      websiteId: websiteId || null,
      type: type as "all",
      transfer: transfer as "all",
      priority: (priority || null) as null,
      sla,
    }),
    [range, departmentId, staffId, websiteId, type, transfer, priority, sla],
  );

  const filterSummary = `${new Date(range.from).toLocaleDateString()} – ${new Date(range.to).toLocaleDateString()}`;

  const resetFilters = () => {
    setDepartmentId("");
    setStaffId("");
    setWebsiteId("");
    setType("all");
    setTransfer("all");
    setPriority("");
    setCustomFrom("");
    setCustomTo("");
    setDays(30);
  };

  return (
    <AdminShell
      title="Reporting & analytics"
      description="Operational performance across conversations, departments, people, transfers, response times, AI, and requests."
      actions={
        <Badge variant="outline" className="text-[11px]">
          Scope: {options.data?.scope ?? "…"}
        </Badge>
      }
    >
      {/* Global filter bar — every tab reads the same filters. */}
      <div className="sticky top-0 z-10 -mx-1 mb-4 rounded-xl border border-border bg-card/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => {
                setDays(r.days);
                setCustomFrom("");
                setCustomTo("");
              }}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                !customFrom && days === r.days
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            aria-label="To date"
          />

          <Select value={departmentId} onChange={setDepartmentId} label="All departments">
            {(options.data?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={staffId} onChange={setStaffId} label="All staff">
            {(options.data?.staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={websiteId} onChange={setWebsiteId} label="All websites">
            {(options.data?.websites ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={setType} label="All conversations" hideBlank>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select value={transfer} onChange={setTransfer} label="Any transfers" hideBlank>
            {TRANSFERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select value={priority} onChange={setPriority} label="Any priority">
            {["low", "normal", "high", "urgent"].map((p) => (
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
              value={sla}
              onChange={(e) => setSla(Math.max(1, Number(e.target.value) || 15))}
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
        {TABS.filter((t) => !options.data?.sections || options.data.sections.includes(t.id)).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>


      {tab === "overview" ? <OverviewTab filters={filters} /> : null}
      {tab === "departments" ? <DepartmentsTab filters={filters} /> : null}
      {tab === "staff" ? <StaffTab filters={filters} /> : null}
      {tab === "tickets" ? <TicketsTab filters={filters} /> : null}
      {tab === "transfers" ? <TransfersTab filters={filters} /> : null}
      {tab === "sla" ? <SlaTab filters={filters} /> : null}
      {tab === "ai" ? <AiTab filters={filters} /> : null}
      {tab === "intake" ? <IntakeTab filters={filters} /> : null}
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

type Filters = ReturnType<typeof useFiltersType>;
function useFiltersType() {
  return {} as {
    from: string;
    to: string;
    departmentId: string | null;
    staffId: string | null;
    websiteId: string | null;
    type: "all";
    transfer: "all";
    priority: null;
    sla: number;
  };
}

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

function exportBtn(name: string, rows: Row[]) {
  return (
    <Button variant="outline" size="sm" className="text-xs" onClick={() => downloadCsv(name, rows)}>
      Export CSV
    </Button>
  );
}

/* --------------------------------- tabs ----------------------------------- */

function OverviewTab({ filters }: { filters: Filters }) {
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
        <Stat label="AI handled end-to-end" value={pct(f['ai_handled'])} hint={`${fmtNum(f['ai_handled'])} never reached an agent`} />
        <Stat
          label="Avg. first response"
          value={fmtMin(k['avg_first_response'])}
          hint={`${fmtNum(k['sla_met'])}/${fmtNum(k['sla_eligible'])} within SLA`}
          tone={Number(k['sla_eligible'] ?? 0) && !Number(k['sla_met'] ?? 0) ? "warn" : "default"}
        />
        <Stat label="Avg. resolution" value={fmtMin(k['avg_resolution'])} hint={`${fmtNum(k['completed'])} completed`} />
        <Stat label="Open now" value={fmtNum(s['open_now'])} hint={`${fmtNum(s['unassigned_now'])} unassigned`} />
        <Stat
          label="Waiting for a human"
          value={fmtNum(s['waiting_now'])}
          tone={Number(s['waiting_now'] ?? 0) > 0 ? "warn" : "good"}
          hint={s['oldest_waiting'] ? `Oldest since ${fmtDate(s['oldest_waiting'])}` : "Queue is clear"}
        />
        <Stat label="Breaching SLA now" value={fmtNum(s['breaching_now'])} tone={Number(s['breaching_now'] ?? 0) > 0 ? "warn" : "good"} />
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
              { label: "Handled by AI only", value: Number(f['ai_handled'] ?? 0) },
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
        <Panel title="Workload health">
          <BarList
            rows={[
              { label: "Abandoned (no agent reply)", value: Number(k['abandoned'] ?? 0) },
              { label: "Unanswered escalations", value: Number(k['unanswered'] ?? 0) },
              { label: "Reopened", value: Number(k['reopened'] ?? 0) },
              { label: "Transferred", value: Number(k['transferred'] ?? 0) },
              { label: "Transferred 2+ times", value: Number(k['multi_transferred'] ?? 0) },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

function DepartmentsTab({ filters }: { filters: Filters }) {
  const q = useReport<Row[]>("departments", filters);
  const backlog = useReport<Row[]>("backlog", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Department performance"
        description="Volume, speed, and outcomes per department for the selected period."
        actions={exportBtn("department-performance", rows)}
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
        actions={exportBtn("department-backlog", backlog.data ?? [])}
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

function StaffTab({ filters }: { filters: Filters }) {
  const q = useReport<Row[]>("staff", filters);
  const workload = useReport<Row[]>("workload", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Agent performance"
        description="Credited by who claimed, replied, and resolved — not merely who is assigned now."
        actions={exportBtn("staff-performance", rows)}
      >
        <DataTable
          rows={rows}
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

const TICKET_FLAGS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting" },
  { value: "unassigned", label: "Unassigned" },
  { value: "breach", label: "SLA breach" },
  { value: "no_response", label: "No agent reply" },
  { value: "stale", label: "Stale 4h+" },
  { value: "aged", label: "Aged 24h+" },
  { value: "multi_transfer", label: "Transferred 2+" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

function TicketsTab({ filters }: { filters: Filters }) {
  const navigate = useNavigate();
  const [flag, setFlag] = useState("all");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(0);
  const limit = 50;

  const q = useReport<{ total: number; rows: Row[] }>("tickets", filters, {
    flag,
    sort: sort.key,
    dir: sort.dir,
    limit,
    offset: page * limit,
  });
  const busy = q.isLoading || Boolean(q.error);
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  return (
    <Panel
      title="Ticket explorer"
      description="Every conversation in scope, with the timings behind the aggregates. Click a row to open it in the inbox."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={flag}
            onChange={(e) => {
              setFlag(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            aria-label="Ticket filter"
          >
            {TICKET_FLAGS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          {exportBtn("tickets", rows)}
        </div>
      }
    >
      {busy ? (
        <Loading query={q} />
      ) : (
        <>
          <DataTable
            rows={rows}
            sort={sort}
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
                    {String(r['status']).replace(/_/g, " ")}
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
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {total ? `${page * limit + 1}–${Math.min((page + 1) * limit, total)} of ${total}` : "No tickets"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * limit >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function TransfersTab({ filters }: { filters: Filters }) {
  const q = useReport<{ overview: Row; matrix: Row[]; rows: Row[]; repeat_conversations: Row[] }>("transfers", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const o = q.data?.overview ?? {};

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Transfer events" value={fmtNum(o['transfer_events'])} />
        <Stat label="Conversations transferred" value={fmtNum(o['transferred_conversations'])} hint={`${fmtNum(o['transfer_rate'], "%")} of volume`} />
        <Stat
          label="Transferred more than once"
          value={fmtNum(o['multi_transfer_conversations'])}
          hint={`${fmtNum(o['multi_transfer_rate'], "%")} of transferred`}
          tone={Number(o['multi_transfer_rate'] ?? 0) > 25 ? "warn" : "default"}
        />
        <Stat label="Avg transfers per ticket" value={fmtNum(o['avg_transfers_per_conversation'])} />
      </div>

      <Panel title="Routing matrix" description="Where work moves from and to." actions={exportBtn("transfer-matrix", q.data?.matrix ?? [])}>
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

      <Panel title="Transfer log" actions={exportBtn("transfer-log", q.data?.rows ?? [])}>
        <DataTable
          rows={q.data?.rows ?? []}
          columns={[
            { key: "transferred_at", label: "When", render: (r) => fmtDate(r['transferred_at']) },
            { key: "reference", label: "Ticket", render: (r) => String(r['reference']) },
            { key: "from_department", label: "From", render: (r) => String(r['from_department']) },
            { key: "to_department", label: "To", render: (r) => String(r['to_department']) },
            { key: "transferred_by", label: "By", render: (r) => String(r['transferred_by'] ?? "System") },
            { key: "status_after", label: "Now", render: (r) => String(r['status_after']).replace(/_/g, " ") },
          ]}
        />
      </Panel>
    </div>
  );
}

function SlaTab({ filters }: { filters: Filters }) {
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
        />
        <Stat label="Breaches" value={fmtNum(m['breaches'])} tone={Number(m['breaches'] ?? 0) > 0 ? "warn" : "good"} />
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
        <Panel title="By department" actions={exportBtn("sla-departments", q.data?.by_department ?? [])}>
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
        <Panel title="By agent" actions={exportBtn("sla-staff", q.data?.by_staff ?? [])}>
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

function AiTab({ filters }: { filters: Filters }) {
  const q = useReport<Row>("ai", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const d = q.data ?? {};

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="AI answers" value={fmtNum(d['ai_answers'])} hint={`${fmtNum(d['conversations'])} conversations`} />
        <Stat label="Deflection" value={fmtNum(d['deflection_rate'], "%")} hint={`${fmtNum(d['deflected'])} resolved without an agent`} />
        <Stat label="Escalation rate" value={fmtNum(d['escalation_rate'], "%")} hint={`${fmtNum(d['escalated'])} escalated`} />
        <Stat
          label="Avg confidence"
          value={fmtNum(Number(d['avg_confidence'] ?? 0) * 100, "%")}
          hint={`${fmtNum(d['low_confidence'])} low-confidence answers`}
          tone={Number(d['avg_confidence'] ?? 0) < 0.5 ? "warn" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top questions" description="What visitors ask most.">
          <BarList
            rows={((d['top_questions'] as Row[]) ?? []).map((r) => ({
              label: String(r['question']),
              value: Number(r['n'] ?? 0),
            }))}
          />
        </Panel>
        <Panel title="Knowledge gaps" description="Low-confidence answers — good candidates for new knowledge articles.">
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

function IntakeTab({ filters }: { filters: Filters }) {
  const q = useReport<Row>("intake", filters);
  if (q.isLoading || q.error) return <Loading query={q} />;
  const d = q.data ?? {};
  const byType = (d['by_type'] as Row[]) ?? [];

  return (
    <div className="space-y-4">
      <Panel title="Requests by type" description="Referrals, enrollments, callbacks, and general requests." actions={exportBtn("requests-by-type", byType)}>
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

      <Panel title="Recent requests" actions={exportBtn("requests", (d['rows'] as Row[]) ?? [])}>
        <DataTable
          rows={((d['rows'] as Row[]) ?? []).slice(0, 50)}
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
      </Panel>
    </div>
  );
}
