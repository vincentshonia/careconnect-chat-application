import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { saveCsv } from "@/lib/csv";
import { exportCsvFn } from "@/lib/exports.functions";
import { useDebounced } from "@/hooks/use-debounced";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager } from "@/components/admin/Pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts — Pacific Health Group Support Console" },
      { name: "description", content: "Directory of visitors, leads and referral contacts captured by chat." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContactsPage,
});

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

const LEAD_STATUSES = ["new", "working", "qualified", "converted", "closed"];
const PAGE_SIZE = 25;

/** Strip characters that would break a PostgREST `or=` expression. */
const sanitize = (term: string) => term.trim().replace(/[%,()*]/g, "").slice(0, 80);

function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const debouncedSearch = useDebounced(search, 300);

  // Any filter change restarts paging, so a page number can never outlive
  // the result set it belonged to.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, status]);

  /**
   * One page at a time, filtered and counted by the database. RLS decides
   * which contacts are visible, so the list matches the caller's scope.
   */
  const listQuery = useQuery({
    queryKey: ["contacts", debouncedSearch, status, page],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from("contacts").select("*", { count: "exact" });
      const term = sanitize(debouncedSearch);
      if (term) {
        q = q.or(
          `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,county.ilike.%${term}%,health_plan.ilike.%${term}%,service_interest.ilike.%${term}%`,
        );
      }
      if (status !== "all") q = q.eq("lead_status", status);

      const { data, error, count } = await q
        // `id` breaks ties so a row never repeats or disappears between pages.
        .order("last_contact_at", { ascending: false })
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Contact[], total: count ?? 0 };
    },
  });

  const contacts = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;

  // The open record is fetched by id so it survives paging and filtering.
  const activeQuery = useQuery({
    queryKey: ["contact-record", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", activeId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Contact | null;
    },
  });
  const active = activeQuery.data ?? null;

  const update = useMutation({
    mutationFn: async (patch: Database["public"]["Tables"]["contacts"]["Update"]) => {
      if (!active) return;
      const { error } = await supabase.from("contacts").update(patch).eq("id", active.id);
      if (error) throw error;
      await logAudit({
        action: "contact.updated",
        recordType: "contacts",
        recordId: active.id,
        previousValue: { lead_status: active.lead_status, owner_id: active.owner_id },
        newValue: patch as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-record", activeId] });
    },
  });

  const history = useQuery({
    queryKey: ["contact-history", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const [conv, intakes] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, reference, subject, status, last_message_at")
          .eq("contact_id", activeId!)
          .order("last_message_at", { ascending: false })
          .range(0, 19),
        supabase
          .from("intake_requests")
          .select("id, reference, request_type, stage, created_at")
          .eq("contact_id", activeId!)
          .order("created_at", { ascending: false })
          .range(0, 19),
      ]);
      return { conversations: conv.data ?? [], intakes: intakes.data ?? [] };
    },
  });

  // Exports are built server-side under the same filters and the same RLS.
  const runExport = useServerFn(exportCsvFn);
  const exportCsv = useMutation({
    mutationFn: async () =>
      runExport({ data: { dataset: "contacts", search: debouncedSearch, status: status === "all" ? null : status } }),
    onSuccess: (result) => {
      if (!result.rows) {
        toast.info("Nothing to export with these filters.");
        return;
      }
      saveCsv("contacts", result.csv);
      toast.success(
        `Exported ${result.rows.toLocaleString()} contacts${result.truncated ? " (capped — narrow the filters for the rest)" : ""}`,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not build that export"),
  });

  return (
    <AdminShell
      title="Contacts"
      description="People captured through chat, referrals and enrollment forms."
      actions={
        <>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, county…"
            className="w-72"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Lead status"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm capitalize"
          >
            <option value="all">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
            {exportCsv.isPending ? "Preparing…" : "Export CSV"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border">
          <div className="max-h-[64vh] overflow-y-auto">
            {listQuery.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : contacts.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No contacts match.</p>
            ) : (
              <ul className="divide-y divide-border">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(c.id);
                        setNotes(c.notes ?? "");
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-accent ${c.id === activeId ? "bg-accent" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.full_name}</span>
                        <Badge variant="outline">{c.lead_status}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {[c.email, c.phone, c.county].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border px-3 pb-3">
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={setPage}
              noun="contacts"
              busy={listQuery.isFetching}
            />
          </div>
        </aside>

        <section className="rounded-xl border border-border p-4">
          {!active ? (
            <p className="text-sm text-muted-foreground">Select a contact to view their record.</p>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">{active.full_name}</h2>
                <p className="text-sm text-muted-foreground">
                  First contact {new Date(active.first_contact_at).toLocaleDateString()} · Last activity{" "}
                  {new Date(active.last_contact_at).toLocaleDateString()}
                </p>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["Email", active.email],
                    ["Phone", active.phone],
                    ["County", active.county],
                    ["ZIP", active.zip_code],
                    ["Health plan", active.health_plan],
                    ["Service interest", active.service_interest],
                    ["Language", active.preferred_language],
                    ["Preferred contact", active.preferred_contact_method],
                    ["Visitor type", active.visitor_type],
                    ["Consent", active.consent_given ? "Given" : "Not recorded"],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                      <dd className="text-sm">{String(v)}</dd>
                    </div>
                  ))}
              </dl>

              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lead status</Label>
                {LEAD_STATUSES.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={active.lead_status === s ? "default" : "outline"}
                    onClick={() => update.mutate({ lead_status: s })}
                  >
                    {s}
                  </Button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-notes">Staff notes</Label>
                <Textarea
                  id="contact-notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes about this contact (never shown to the visitor)."
                />
                <Button size="sm" onClick={() => update.mutate({ notes: notes || null })}>
                  Save notes
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <h3 className="text-sm font-semibold">Conversations</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {(history.data?.conversations ?? []).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{c.subject ?? c.reference}</span>
                        <Badge variant="outline">{c.status}</Badge>
                      </li>
                    ))}
                    {(history.data?.conversations ?? []).length === 0 ? (
                      <li className="text-muted-foreground">None yet.</li>
                    ) : null}
                  </ul>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <h3 className="text-sm font-semibold">Intake requests</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {(history.data?.intakes ?? []).map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {i.reference} · {i.request_type}
                        </span>
                        <Badge variant="outline">{i.stage}</Badge>
                      </li>
                    ))}
                    {(history.data?.intakes ?? []).length === 0 ? (
                      <li className="text-muted-foreground">None yet.</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
