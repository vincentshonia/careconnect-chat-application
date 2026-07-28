import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Pacific Health Group Support Console" },
      { name: "description", content: "Today's chat volume, queue health, and intake workload." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

const OPEN_STATUSES = [
  "new",
  "waiting",
  "assigned",
  "active",
  "escalated",
  "pending_visitor",
] as const satisfies ReadonlyArray<
  import("@/integrations/supabase/types").Database["public"]["Enums"]["conversation_status"]
>;


function DashboardPage() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [open, unassigned, escalated, today, intakes, aiToday] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).in("status", OPEN_STATUSES),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .is("assigned_to", null)
          .in("status", OPEN_STATUSES),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("escalation_requested", true)
          .in("status", OPEN_STATUSES),
        supabase.from("conversations").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase
          .from("intake_requests")
          .select("id", { count: "exact", head: true })
          .not("stage", "in", "(approved,denied,withdrawn)"),
        supabase.from("ai_responses").select("escalated").gte("created_at", since),
      ]);

      const ai = aiToday.data ?? [];
      const deflection = ai.length
        ? Math.round((ai.filter((r) => !r.escalated).length / ai.length) * 100)
        : null;

      return {
        open: open.count ?? 0,
        unassigned: unassigned.count ?? 0,
        escalated: escalated.count ?? 0,
        today: today.count ?? 0,
        intakes: intakes.count ?? 0,
        deflection,
      };
    },
  });

  const queue = useQuery({
    queryKey: ["dashboard-queue"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, reference, subject, status, priority, escalation_requested, last_message_at")
        .in("status", OPEN_STATUSES)
        .order("last_message_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const s = stats.data;

  return (
    <AdminShell title="Dashboard" description="Live snapshot of conversations, AI performance, and intake work.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Open conversations" value={s?.open} />
        <Metric label="Unassigned" value={s?.unassigned} tone={s && s.unassigned > 0 ? "warn" : undefined} />
        <Metric label="Agent requested" value={s?.escalated} tone={s && s.escalated > 0 ? "warn" : undefined} />
        <Metric label="New in last 24h" value={s?.today} />
        <Metric label="Open intake requests" value={s?.intakes} />
        <Metric
          label="AI deflection (24h)"
          value={s?.deflection === null ? undefined : s?.deflection}
          suffix="%"
        />
      </div>

      <section className="mt-6 rounded-xl border border-border">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          <Link to="/inbox" className="text-sm text-primary underline-offset-4 hover:underline">
            Open inbox
          </Link>
        </header>
        {queue.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : (queue.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">The queue is clear.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(queue.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium">{c.subject ?? "Website chat"}</span>
                <Badge variant="outline">{c.status}</Badge>
                {c.escalation_requested ? <Badge>Agent requested</Badge> : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {c.reference} · {new Date(c.last_message_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

function Metric({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value?: number;
  suffix?: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${tone === "warn" ? "text-destructive" : ""}`}>
        {value === undefined ? "—" : `${value}${suffix ?? ""}`}
      </p>
    </div>
  );
}
