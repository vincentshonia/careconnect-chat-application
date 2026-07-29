import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { transferConversationFn } from "@/lib/routing.functions";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";


export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Pacific Health Group Support Console" },
      { name: "description", content: "Live agent inbox for website chat conversations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InboxPage,
});

type Conversation = {
  id: string;
  reference: string;
  subject: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  department_id: string | null;

  escalation_requested: boolean;
  last_message_at: string;
  organization_id: string;
  website_id: string;
  visitor_type: string;
  contact_id: string | null;
};

const OPEN_STATUSES = [
  "new",
  "waiting",
  "assigned",
  "active",
  "escalated",
  "pending_visitor",
] as const;

function statusTone(status: string) {
  if (status === "closed" || status === "resolved") return "secondary" as const;
  if (status === "escalated" || status === "waiting") return "destructive" as const;
  return "default" as const;
}

function InboxPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string>("Support agent");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.full_name) setAgentName(profile.full_name);
    });
  }, []);

  const conversationsQuery = useQuery({
    queryKey: ["conversations", filter],
    refetchInterval: 60_000,

    queryFn: async () => {
      let q = supabase
        .from("conversations")
        .select(
          "id, reference, subject, status, priority, assigned_to, department_id, escalation_requested, last_message_at, organization_id, website_id, visitor_type, contact_id",
        )
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (filter === "open") q = q.in("status", [...OPEN_STATUSES]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Conversation[];
    },
  });

  const conversations = conversationsQuery.data ?? [];
  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  useEffect(() => {
    if (!activeId && conversations.length) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  // Live updates: new visitor messages and conversation changes push instantly.
  useEffect(() => {
    const channel = supabase
      .channel("inbox-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        const convId = (payload.new as { conversation_id?: string })?.conversation_id;
        if (convId) queryClient.invalidateQueries({ queryKey: ["messages", convId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const messagesQuery = useQuery({
    queryKey: ["messages", activeId],
    enabled: Boolean(activeId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_type, sender_name, body, created_at")
        .eq("conversation_id", activeId!)
        .order("created_at")
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messagesQuery.data]);

  const contactQuery = useQuery({
    queryKey: ["contact", active?.contact_id],
    enabled: Boolean(active?.contact_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("full_name, email, phone, county, health_plan, service_interest, lead_status")
        .eq("id", active!.contact_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sendReply = useMutation({
    mutationFn: async (body: string) => {
      if (!active) throw new Error("No conversation selected");
      const { error } = await supabase.from("messages").insert({
        conversation_id: active.id,
        organization_id: active.organization_id,
        website_id: active.website_id,
        sender_type: "agent",
        sender_user_id: userId,
        sender_name: agentName,
        body,
      });
      if (error) throw error;
      const { error: convError } = await supabase
        .from("conversations")
        .update({
          status: "active",
          assigned_to: active.assigned_to ?? userId,
          last_message_at: new Date().toISOString(),
          unread_agent_count: 0,
        })
        .eq("id", active.id);
      if (convError) throw convError;
      await logAudit({
        action: "conversation.agent_replied",
        recordType: "conversations",
        recordId: active.id,
        websiteId: active.website_id,
      });
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const updateConversation = useMutation({
    mutationFn: async (patch: Database["public"]["Tables"]["conversations"]["Update"]) => {
      if (!active) return;
      const { error } = await supabase.from("conversations").update(patch).eq("id", active.id);
      if (error) throw error;
      await logAudit({
        action: "conversation.updated",
        recordType: "conversations",
        recordId: active.id,
        websiteId: active.website_id,
        previousValue: { status: active.status, assigned_to: active.assigned_to, priority: active.priority },
        newValue: patch as Record<string, unknown>,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const departmentsQuery = useQuery({
    queryKey: ["inbox-departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const transferConversation = useServerFn(transferConversationFn);
  const transfer = useMutation({
    mutationFn: async (departmentId: string) => {
      if (!active) throw new Error("No conversation selected");
      return transferConversation({ data: { conversationId: active.id, departmentId } });
    },
    onSuccess: (result) => {
      toast.success(
        result?.assignedTo
          ? `Transferred to ${result.departmentName} — assigned to ${result.assignedTo}`
          : `Transferred to ${result?.departmentName ?? "department"} — waiting for an agent`,
      );
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", active?.id] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not transfer this conversation");
    },
  });



  return (
    <AdminShell
      title="Inbox"
      description="Website chat conversations, AI answers, and live agent replies."
      actions={
        <div className="flex gap-2">
          <Button
            variant={filter === "open" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("open")}
          >
            Open
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_260px]">
        <aside className="max-h-[70vh] overflow-y-auto rounded-xl border border-border">
          {conversationsQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading conversations…</p>
          ) : conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-accent ${
                      c.id === activeId ? "bg-accent" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.subject ?? "Website chat"}
                      </span>
                      <Badge variant={statusTone(c.status)}>{c.status}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {c.reference} · {new Date(c.last_message_at).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex max-h-[70vh] flex-col rounded-xl border border-border">
          {!active ? (
            <p className="p-6 text-sm text-muted-foreground">Select a conversation.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <span className="text-sm font-medium">{active.subject ?? "Website chat"}</span>
                <Badge variant="outline">{active.priority}</Badge>
                {active.escalation_requested ? <Badge>Agent requested</Badge> : null}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Transfer to department"
                    value={active.department_id ?? ""}
                    disabled={transfer.isPending}
                    onChange={(e) => {
                      if (e.target.value) transfer.mutate(e.target.value);
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Transfer to…</option>
                    {(departmentsQuery.data ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateConversation.mutate({ assigned_to: userId, status: "assigned" })
                    }
                  >
                    Assign to me
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateConversation.mutate({
                        status: "closed",
                        closed_at: new Date().toISOString(),
                      })
                    }
                  >
                    Close
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {(messagesQuery.data ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      m.sender_type === "visitor"
                        ? "bg-muted text-foreground"
                        : m.sender_type === "agent"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "border border-border bg-card text-foreground"
                    }`}
                  >
                    <p className="mb-1 text-xs opacity-70">
                      {m.sender_name ?? m.sender_type} ·{" "}
                      {new Date(m.created_at).toLocaleTimeString()}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form
                className="border-t border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) sendReply.mutate(draft.trim());
                }}
              >
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply to the visitor…"
                  rows={3}
                />
                <div className="mt-2 flex justify-end">
                  <Button type="submit" size="sm" disabled={sendReply.isPending || !draft.trim()}>
                    {sendReply.isPending ? "Sending…" : "Send reply"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>

        <aside className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">Visitor details</h2>
          {contactQuery.data ? (
            <dl className="mt-3 space-y-2 text-sm">
              {Object.entries(contactQuery.data)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {k.replace(/_/g, " ")}
                    </dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No contact record captured for this conversation yet.
            </p>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}
