import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reporting & Analytics — Pacific Health Group Support Console" },
      {
        name: "description",
        content:
          "Conversation volume, AI deflection, escalation rates, and intake conversion for the support team.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPage,
});

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function ReportsPage() {
  const [days, setDays] = useState(30);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const stats = useQuery({
    queryKey: ["reports", days],
    queryFn: async () => {
      const [conversations, aiResponses, intakes] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, status, escalation_requested, is_ai_only, created_at, first_response_at, closed_at")
          .gte("created_at", since)
          .limit(2000),
        supabase
          .from("ai_responses")
          .select("id, confidence, escalated, visitor_feedback, created_at")
          .gte("created_at", since)
          .limit(2000),
        supabase
          .from("intake_requests")
          .select("id, request_type, stage, created_at")
          .gte("created_at", since)
          .limit(2000),
      ]);
      if (conversations.error) throw conversations.error;
      if (aiResponses.error) throw aiResponses.error;
      if (intakes.error) throw intakes.error;
      return {
        conversations: conversations.data ?? [],
        ai: aiResponses.data ?? [],
        intakes: intakes.data ?? [],
      };
    },
  });

  const convs = stats.data?.conversations ?? [];
  const ai = stats.data?.ai ?? [];
  const intakes = stats.data?.intakes ?? [];

  const escalated = convs.filter((c) => c.escalation_requested).length;
  const deflected = convs.length ? Math.round(((convs.length - escalated) / convs.length) * 100) : 0;
  const helpful = ai.filter((a) => a.visitor_feedback === "helpful").length;
  const rated = ai.filter((a) => a.visitor_feedback).length;
  const avgConfidence = ai.length
    ? Math.round((ai.reduce((s, a) => s + Number(a.confidence ?? 0), 0) / ai.length) * 100)
    : 0;
  const responded = convs.filter((c) => c.first_response_at);
  const avgFirstResponse = responded.length
    ? Math.round(
        responded.reduce(
          (s, c) =>
            s + (new Date(c.first_response_at!).getTime() - new Date(c.created_at).getTime()) / 60000,
          0,
        ) / responded.length,
      )
    : 0;
  const approved = intakes.filter((i) => i.stage === "approved").length;
  const conversion = intakes.length ? Math.round((approved / intakes.length) * 100) : 0;

  const byDay = groupByDay(convs, days);
  const peak = Math.max(1, ...byDay.map((d) => d.count));

  return (
    <AdminShell
      title="Reporting"
      description="Volume, AI performance, response speed, and intake conversion at a glance."
      actions={
        <div className="flex flex-wrap items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                days === r.days
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            className="ml-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            onClick={() =>
              downloadCsv("support-report", [
                { metric: "Conversations", value: convs.length, window_days: days },
                { metric: "AI deflection %", value: deflected, window_days: days },
                { metric: "Escalated", value: escalated, window_days: days },
                { metric: "Avg answer confidence %", value: avgConfidence, window_days: days },
                { metric: "Avg first response (min)", value: avgFirstResponse, window_days: days },
                { metric: "Intakes received", value: intakes.length, window_days: days },
                { metric: "Intake approval %", value: conversion, window_days: days },
                { metric: "Helpful ratings", value: rated ? Math.round((helpful / rated) * 100) : 0, window_days: days },
              ])
            }
          >
            Export CSV
          </button>
        </div>
      }

    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Conversations" value={convs.length} hint={`Last ${days} days`} />
        <Stat label="AI deflection" value={`${deflected}%`} hint={`${escalated} escalated to an agent`} />
        <Stat
          label="Answer confidence"
          value={`${avgConfidence}%`}
          hint={`${ai.length} AI answers generated`}
        />
        <Stat
          label="Avg. first response"
          value={avgFirstResponse ? `${avgFirstResponse} min` : "—"}
          hint={`${responded.length} answered by an agent`}
        />
        <Stat label="Intakes received" value={intakes.length} hint="Referrals, enrollments, callbacks" />
        <Stat label="Intake approval rate" value={`${conversion}%`} hint={`${approved} approved`} />
        <Stat
          label="Helpful ratings"
          value={rated ? `${Math.round((helpful / rated) * 100)}%` : "—"}
          hint={`${rated} visitors rated an answer`}
        />
        <Stat
          label="Open conversations"
          value={convs.filter((c) => !["resolved", "closed", "archived"].includes(c.status)).length}
          hint="Needing attention"
        />
      </div>

      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Conversations per day</h2>
        <div className="mt-4 flex h-40 items-end gap-1">
          {byDay.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
              <div
                className="w-full rounded-t bg-primary/80"
                style={{ height: `${(d.count / peak) * 100}%`, minHeight: d.count ? 4 : 1 }}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {byDay[0]?.day} → {byDay[byDay.length - 1]?.day}
        </p>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="Conversations by status"
          rows={countBy(convs.map((c) => c.status))}
          total={convs.length}
        />
        <Breakdown
          title="Intakes by stage"
          rows={countBy(intakes.map((i) => i.stage))}
          total={intakes.length}
        />
      </section>
    </AdminShell>
  );
}

function groupByDay(rows: { created_at: string }[], days: number) {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(d, 0);
  }
  for (const r of rows) {
    const key = r.created_at.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([day, count]) => ({ day, count }));
}

function countBy(values: string[]) {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
}: {
  title: string;
  rows: [string, number][];
  total: number;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {rows.map(([key, count]) => (
          <li key={key} className="flex items-center gap-3 text-sm">
            <Badge variant="outline" className="capitalize">
              {key.replace(/_/g, " ")}
            </Badge>
            <div className="h-2 flex-1 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${total ? (count / total) * 100 : 0}%` }}
              />
            </div>
            <span className="w-8 text-right text-muted-foreground">{count}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="text-sm text-muted-foreground">No data yet.</li> : null}
      </ul>
    </div>
  );
}
