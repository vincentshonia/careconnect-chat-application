import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
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

function IntakePage() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const [typeFilter, setTypeFilter] = useState<"all" | IntakeType>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const listQuery = useQuery({
    queryKey: ["intakes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intake_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Intake[];
    },
  });

  const staffQuery = useQuery({
    queryKey: ["staff-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const all = listQuery.data ?? [];
  const items = typeFilter === "all" ? all : all.filter((i) => i.request_type === typeFilter);
  const active = all.find((i) => i.id === activeId) ?? null;

  const eventsQuery = useQuery({
    queryKey: ["intake-events", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intake_events")
        .select("*")
        .eq("intake_id", activeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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
      const target = all.find((i) => i.id === id);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intakes"] });
      queryClient.invalidateQueries({ queryKey: ["intake-events"] });
    },
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

  return (
    <AdminShell
      title="Referrals & enrollments"
      description="Every intake from the widget, tracked from first contact to a final decision."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv("intake-requests", all as unknown as Record<string, unknown>[])}
        >
          Export CSV
        </Button>
      }
    >

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
          All ({all.length})
        </FilterChip>
        {TYPES.map((t) => (
          <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
            {label(t)} ({all.filter((i) => i.request_type === t).length})
          </FilterChip>
        ))}
      </div>

      <div className="mb-6 grid gap-3 overflow-x-auto md:grid-cols-5">
        {OPEN_STAGES.map((stage) => {
          const stageItems = items.filter((i) => i.stage === stage);
          return (
            <div key={stage} className="min-w-[200px] rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label(stage)}
                </h2>
                <Badge variant="outline">{stageItems.length}</Badge>
              </div>
              <ul className="mt-3 space-y-2">
                {stageItems.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(i.id)}
                      className={`w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent ${
                        i.id === activeId ? "bg-accent" : ""
                      }`}
                    >
                      <span className="block truncate font-medium">{i.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {label(i.request_type)} · {i.county ?? "—"}
                      </span>
                    </button>
                  </li>
                ))}
                {stageItems.length === 0 ? (
                  <li className="text-xs text-muted-foreground">Empty</li>
                ) : null}
              </ul>
            </div>
          );
        })}
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
                    No intakes yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
