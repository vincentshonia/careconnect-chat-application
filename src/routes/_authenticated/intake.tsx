import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useDebounced } from "@/hooks/use-debounced";
import { Pager } from "@/components/admin/Pager";
import { exportCsvFn } from "@/lib/exports.functions";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { saveCsv } from "@/lib/csv";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useSessionContext } from "@/hooks/use-session-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/intake")({
  head: () => ({
    meta: [
      { title: "Referral & Enrollment Pipeline — Pacific Health Group" },
      {
        name: "description",
        content:
          "Track referrals and enrollments from first contact through eligibility review to approval.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntakePage,
});

type Intake = Database["public"]["Tables"]["intake_requests"]["Row"];
type Stage = Database["public"]["Enums"]["intake_stage"];
type IntakeType = Database["public"]["Enums"]["intake_type"];

const STAGES: Stage[] = [
  "new",
  "in_review",
  "contacted",
  "eligibility_check",
  "submitted",
  "approved",
  "denied",
  "withdrawn",
];
const OPEN_STAGES = STAGES.slice(0, 5);
const TYPES: IntakeType[] = ["referral", "enrollment", "general", "callback"];

const label = (s: string) => s.replace(/_/g, " ");

const PAGE_SIZE = 25;

/** Strip characters that would break a PostgREST `or=` expression. */
const sanitize = (term: string) => term.trim().replace(/[%,()*]/g, "").slice(0, 80);

function IntakePage() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const organizationId = session.data?.organizationId ?? null;
  const [typeFilter, setTypeFilter] = useState<"all" | IntakeType>("all");
  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const debouncedSearch = useDebounced(search, 300);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, typeFilter, stageFilter]);

  /**
   * Pipeline totals come from a single SQL aggregate, so the board headline
   * numbers stay correct no matter how many requests exist.
   */
  const countsQuery = useQuery({
    queryKey: ["intake-counts", organizationId, typeFilter, debouncedSearch],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("intake_stage_counts", {
        _org: organizationId!,
        _type: typeFilter,
        _search: debouncedSearch.trim() || undefined,
      });
      if (error) throw error;
      return (data ?? { total: 0, by_stage: {}, by_type: {} }) as {
        total: number;
        by_stage: Record<string, number>;
        by_type: Record<string, number>;
      };
    },
  });
  const counts = countsQuery.data;
  const byStage = counts?.by_stage ?? {};
  const byType = counts?.by_type ?? {};

  /** One page of requests, filtered and ordered by the database. */
  const listQuery = useQuery({
    queryKey: ["intakes", typeFilter, stageFilter, debouncedSearch, page],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from("intake_requests").select("*", { count: "exact" });
      if (typeFilter !== "all") q = q.eq("request_type", typeFilter);
      if (stageFilter !== "all") q = q.eq("stage", stageFilter);
      const term = sanitize(debouncedSearch);
      if (term) {
        q = q.or(`full_name.ilike.%${term}%,reference.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Intake[], total: count ?? 0 };
    },
  });

  const items = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;

  const staffQuery = useQuery({
    queryKey: ["staff-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name")
        .range(0, 199);
      if (error) throw error;
      return data ?? [];
    },
  });

  // The open request is fetched by id, so it survives paging and filtering.
  const activeQuery = useQuery({
    queryKey: ["intake-record", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const { data, error } = await supabase.from("intake_requests").select("*").eq("id", activeId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Intake | null;
    },
  });
  const active = activeQuery.data ?? null;

  const eventsQuery = useQuery({
    queryKey: ["intake-events", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intake_events")
        .select("*")
        .eq("intake_id", activeId!)
        .order("created_at", { ascending: false })
        .range(0, 49);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ["intakes"] });
    queryClient.invalidateQueries({ queryKey: ["intake-counts"] });
    queryClient.invalidateQueries({ queryKey: ["intake-record", activeId] });
    queryClient.invalidateQueries({ queryKey: ["intake-events"] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
      event,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["intake_requests"]["Update"];
      event?: { type: string; detail?: string; previous?: string; next?: string };
    }) => {
      const target = active?.id === id ? active : items.find((i) => i.id === id) ?? null;
      const { error } = await supabase.from("intake_requests").update(patch).eq("id", id);
      if (error) throw error;
      await logAudit({
        action: "intake_request.updated",
        recordType: "intake_requests",
        recordId: id,
        previousValue: target ? { stage: target.stage, assigned_to: target.assigned_to } : null,
        newValue: patch as Record<string, unknown>,
      });
      if (event && target) {
        await supabase.from("intake_events").insert({
          intake_id: id,
          organization_id: target.organization_id,
          actor_id: session.data?.userId ?? null,
          event_type: event.type,
          detail: event.detail ?? null,
          previous_value: event.previous ?? null,
          new_value: event.next ?? null,
        });
      }
    },
    onSuccess: invalidateLists,
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!active || !note.trim()) return;
      const { error } = await supabase.from("intake_events").insert({
        intake_id: active.id,
        organization_id: active.organization_id,
        actor_id: session.data?.userId ?? null,
        event_type: "note",
        detail: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["intake-events"] });
    },
  });

  // Exports are generated server-side with the same filters and permissions.
  const runExport = useServerFn(exportCsvFn);
  const exportCsv = useMutation({
    mutationFn: async () =>
      runExport({
        data: {
          dataset: "intake",
          search: debouncedSearch,
          status: stageFilter === "all" ? null : stageFilter,
          type: typeFilter === "all" ? null : typeFilter,
        },
      }),
    onSuccess: (result) => {
      if (!result.rows) {
        toast.info("Nothing to export with these filters.");
        return;
      }
      saveCsv("intake-requests", result.csv);
      toast.success(
        `Exported ${result.rows.toLocaleString()} requests${result.truncated ? " (capped — narrow the filters for the rest)" : ""}`,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not build that export"),
  });

  return (
    <AdminShell
      title="Referrals & enrollments"
      description="Every intake from the widget, tracked from first contact to a final decision."
      actions={
        <>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, reference, email…"
            className="w-72"
          />
          <Button variant="outline" size="sm" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
            {exportCsv.isPending ? "Preparing…" : "Export CSV"}
          </Button>
        </>
      }
    >

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
          All ({(counts?.total ?? 0).toLocaleString()})
        </FilterChip>
        {TYPES.map((t) => (
          <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
            {label(t)} ({(byType[t] ?? 0).toLocaleString()})
          </FilterChip>
        ))}
      </div>

      {/* Stage tiles are SQL aggregates, not counted rows in the browser. */}
      <div className="mb-6 grid gap-3 overflow-x-auto md:grid-cols-5">
        {OPEN_STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            onClick={() => setStageFilter(stageFilter === stage ? "all" : stage)}
            className={`min-w-[160px] rounded-xl border p-3 text-left transition ${
              stageFilter === stage ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent"
            }`}
          >
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label(stage)}
            </span>
            <span className="mt-1 block text-2xl font-semibold">{(byStage[stage] ?? 0).toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => setActiveId(i.id)}
                  className={`cursor-pointer hover:bg-accent ${i.id === activeId ? "bg-accent" : ""}`}
                >
                  <td className="px-4 py-2 font-mono text-xs">{i.reference}</td>
                  <td className="px-4 py-2">{i.full_name}</td>
                  <td className="px-4 py-2">{label(i.request_type)}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline">{label(i.stage)}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(i.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {items.length === 0 && !listQuery.isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                    No requests match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="px-4 pb-3">
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={setPage}
              noun="requests"
              busy={listQuery.isFetching}
            />
          </div>
        </section>

        <aside className="h-fit rounded-xl border border-border p-4">
          {!active ? (
            <p className="text-sm text-muted-foreground">Select an intake to review it.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">{active.full_name}</h2>
                <p className="font-mono text-xs text-muted-foreground">{active.reference}</p>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Detail term="Email" value={active.email} />
                <Detail term="Phone" value={active.phone} />
                <Detail term="County" value={active.county} />
                <Detail term="Health plan" value={active.health_plan} />
                <Detail term="Interest" value={active.service_interest} />
                <Detail term="Language" value={active.preferred_language} />
              </dl>

              <div className="space-y-2">
                <Label>Stage</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={active.stage}
                  onChange={(e) =>
                    update.mutate({
                      id: active.id,
                      patch: { stage: e.target.value as Stage },
                      event: {
                        type: "stage_change",
                        previous: active.stage,
                        next: e.target.value,
                      },
                    })
                  }
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Assigned to</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={active.assigned_to ?? ""}
                  onChange={(e) =>
                    update.mutate({
                      id: active.id,
                      patch: { assigned_to: e.target.value || null },
                      event: { type: "assignment", next: e.target.value || "unassigned" },
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {(staffQuery.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || "Staff member"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={active.due_date ?? ""}
                  onChange={(e) =>
                    update.mutate({
                      id: active.id,
                      patch: { due_date: e.target.value || null },
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Add note</Label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                  Save note
                </Button>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Activity</h3>
                <ul className="mt-2 space-y-2">
                  {(eventsQuery.data ?? []).map((e) => (
                    <li key={e.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <span className="font-medium">{label(e.event_type)}</span>
                      {e.previous_value || e.new_value ? (
                        <span className="text-muted-foreground">
                          {" "}
                          {label(e.previous_value ?? "—")} → {label(e.new_value ?? "—")}
                        </span>
                      ) : null}
                      {e.detail ? <p className="mt-1 text-muted-foreground">{e.detail}</p> : null}
                      <p className="mt-1 text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}

function Detail({ term, value }: { term: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{term}</dt>
      <dd className="truncate">{value || "—"}</dd>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs capitalize ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
