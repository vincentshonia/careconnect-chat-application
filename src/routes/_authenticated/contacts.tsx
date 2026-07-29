import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
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

function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const listQuery = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .order("last_contact_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const contacts = listQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.full_name, c.email, c.phone, c.county, c.health_plan, c.service_interest]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [contacts, search]);

  const active = contacts.find((c) => c.id === activeId) ?? null;

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
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
          .limit(20),
        supabase
          .from("intake_requests")
          .select("id, reference, request_type, stage, created_at")
          .eq("contact_id", activeId!)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      return { conversations: conv.data ?? [], intakes: intakes.data ?? [] };
    },
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv("contacts", filtered as unknown as Record<string, unknown>[])}
          >
            Export CSV
          </Button>
        </>
      }

    >
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="max-h-[72vh] overflow-y-auto rounded-xl border border-border">
          {listQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No contacts match.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((c) => (
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
