import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { transferConversationFn } from "@/lib/routing.functions";
import {
  attachmentUrlFn,
  claimConversationFn,
  closeConversationFn,
  replyToConversationFn,
  resolveConversationFn,
} from "@/lib/conversations.functions";
import { useSessionContext } from "@/hooks/use-session-context";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ReassignDialog } from "@/components/admin/ReassignDialog";

export const Route = createFileRoute("/_authenticated/inbox")({
  // `?c=<id>` lets report drill-downs open a specific conversation.
  // `?c=<id>` opens a conversation; `?tab=` / `?status=` let dashboard and
  // report drill-downs land on a pre-filtered queue.
  validateSearch: (
    search: Record<string, unknown>,
  ): { c?: string; tab?: string; status?: string } => ({
    ...(typeof search['c'] === "string" ? { c: search['c'] } : {}),
    ...(typeof search['tab'] === "string" ? { tab: search['tab'] } : {}),
    ...(typeof search['status'] === "string" ? { status: search['status'] } : {}),
  }),


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

type Tab = "waiting" | "mine" | "department" | "active" | "closed" | "all";

const OPEN_STATUSES = [
  "new",
  "waiting",
  "assigned",
  "active",
  "escalated",
  "pending_visitor",
  "pending_internal",
  "follow_up",
];
const CLOSED_STATUSES = ["closed", "resolved", "archived", "spam"];
const CLAIMABLE_STATUSES = ["new", "waiting", "escalated", "follow_up"];

const STATUS_LABEL: Record<string, string> = {
  new: "AI handling",
  waiting: "Waiting for human",
  assigned: "Claimed",
  active: "Active",
  pending_visitor: "Waiting for visitor",
  pending_internal: "Internal follow-up",
  follow_up: "Follow-up",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
  spam: "Spam",
  archived: "Archived",
};

function statusTone(status: string) {
  if (CLOSED_STATUSES.includes(status)) return "secondary" as const;
  if (status === "escalated" || status === "waiting") return "destructive" as const;
  return "default" as const;
}

const PAGE_SIZE = 25;
const NO_DEPARTMENT = "00000000-0000-0000-0000-000000000000";

function InboxPage() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(
    (["waiting", "mine", "department", "active", "closed", "all"] as const).includes(
      search.tab as Tab,
    )
      ? (search.tab as Tab)
      : search.c
        ? "all"
        : "waiting",
  );
  const statusFilter = search.status ?? null;

  const [activeId, setActiveId] = useState<string | null>(search.c ?? null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);


  const userId = session.data?.userId ?? null;
  const organizationId = session.data?.organizationId ?? null;
  const can = (p: string) => session.data?.permissions.has(p) ?? false;
  const isSupervisor = can("conversation.reassign") || can("conversation.view_all");
  const departmentIds = session.data?.departmentIds ?? [];

  const presenceQuery = useQuery({
    queryKey: ["my-presence", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, presence, max_concurrent_chats")
        .eq("id", userId!)
        .maybeSingle();
      return data;
    },
  });

  /**
   * Queue loading is done by the database, one page at a time: each tab is a
   * filtered, ordered, ranged query so the browser never holds — or filters —
   * the whole conversation table.
   */
  const conversationsQuery = useQuery({
    queryKey: ["conversations", tab, statusFilter, page, query, userId, departmentIds.join(",")],
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from("conversations")
        .select(
          "id, reference, subject, status, priority, assigned_to, department_id, escalation_requested, last_message_at, organization_id, website_id, visitor_type, contact_id",
          { count: "exact" },
        );

      switch (tab) {
        case "waiting":
          q = q.is("assigned_to", null).in("status", CLAIMABLE_STATUSES as never[]);
          break;
        case "mine":
          q = q.eq("assigned_to", userId ?? "").not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
          break;
        case "department":
          q = q
            .in("department_id", departmentIds.length ? departmentIds : [NO_DEPARTMENT])
            .not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
          break;
        case "active":
          q = q.in("status", ["active", "assigned"]);
          break;
        case "closed":
          q = q.in("status", CLOSED_STATUSES as never[]);
          break;
        default:
          if (!can("conversation.view_all")) q = q.in("status", OPEN_STATUSES as never[]);
      }

      if (statusFilter) q = q.eq("status", statusFilter as never);
      if (query.trim()) {
        const term = query.trim().replace(/[%,()]/g, "");
        if (term) q = q.or(`reference.ilike.%${term}%,subject.ilike.%${term}%`);
      }

      const { data, error, count } = await q
        .order("last_message_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Conversation[], total: count ?? 0 };
    },
  });

  const conversations = conversationsQuery.data?.rows ?? [];
  const total = conversationsQuery.data?.total ?? 0;

  // The open conversation is fetched by id so it survives paging and filtering.
  const activeQuery = useQuery({
    queryKey: ["conversation", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, reference, subject, status, priority, assigned_to, department_id, escalation_requested, last_message_at, organization_id, website_id, visitor_type, contact_id",
        )
        .eq("id", activeId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Conversation | null;
    },
  });

  const active = activeQuery.data ?? null;

  useEffect(() => {
    if (conversations.length && !activeId) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  // Changing queue or filters always restarts at the first page.
  useEffect(() => {
    setPage(0);
  }, [tab, statusFilter, query]);


  /**
   * Live updates, scoped as narrowly as the data allows: conversation events
   * are limited to this organization, and message events to the chat that is
   * actually open. Events only invalidate the affected query — the list is
   * refetched from the server rather than patched in the browser, so paging
   * and counts stay authoritative.
   */
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`inbox-live-${organizationId}-${userId ?? "anon"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          const changed = (payload.new ?? payload.old) as { id?: string } | null;
          if (changed?.id && changed.id === activeId) {
            queryClient.invalidateQueries({ queryKey: ["conversation", activeId] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, organizationId, userId, activeId]);

  /** Message stream for the open conversation only. */
  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`inbox-messages-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, activeId]);

  const messagesQuery = useQuery({
    queryKey: ["messages", activeId],
    enabled: Boolean(activeId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_type, sender_name, body, created_at, metadata")
        .eq("conversation_id", activeId!)
        // Newest 200 first, then flipped for display: a very long chat still
        // shows its latest turns instead of truncating at the beginning.
        .order("created_at", { ascending: false })
        .range(0, 199);
      if (error) throw error;
      return (data ?? []).slice().reverse();
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messagesQuery.data]);

  const staffQuery = useQuery({
    queryKey: ["inbox-staff"],
    enabled: isSupervisor,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name")
        .range(0, 199);
      return data ?? [];
    },
  });

  const ownerName = useMemo(() => {
    if (!active?.assigned_to) return null;
    if (active.assigned_to === userId) return "You";
    return (
      (staffQuery.data ?? []).find((s) => s.id === active.assigned_to)?.full_name ??
      "another team member"
    );
  }, [active, staffQuery.data, userId]);

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
  };
  const fail = (error: unknown, fallback: string) =>
    toast.error(error instanceof Error ? error.message : fallback);

  const claimFn = useServerFn(claimConversationFn);
  const replyFn = useServerFn(replyToConversationFn);
  const closeFn = useServerFn(closeConversationFn);
  const resolveFn = useServerFn(resolveConversationFn);
  const transferFn = useServerFn(transferConversationFn);

  const claim = useMutation({
    mutationFn: async () => claimFn({ data: { conversationId: active!.id } }),
    onSuccess: async (_res, _v) => {
      const claimedId = activeId;
      toast.success("You now own this conversation");
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["conversation"] });
      queryClient.invalidateQueries({ queryKey: ["messages", claimedId] });
      // Stay on the chat you just claimed: it has left the Waiting queue.
      setTab("mine");
      if (claimedId) setActiveId(claimedId);
    },
    onError: (e) => {
      fail(e, "Could not claim this conversation");
      invalidate();
    },
  });


  const sendReply = useMutation({
    mutationFn: async (body: string) => replyFn({ data: { conversationId: active!.id, body } }),
    onSuccess: () => {
      setDraft("");
      invalidate();
    },
    onError: (e) => fail(e, "Could not send that reply"),
  });

  const closeConversation = useMutation({
    mutationFn: async () => closeFn({ data: { conversationId: active!.id } }),
    onSuccess: () => {
      toast.success("Conversation closed");
      invalidate();
    },
    onError: (e) => fail(e, "Could not close this conversation"),
  });

  // Resolving credits the outcome to this agent for reporting; closing does not.
  const resolveConversation = useMutation({
    mutationFn: async () => resolveFn({ data: { conversationId: active!.id } }),
    onSuccess: () => {
      toast.success("Conversation resolved");
      invalidate();
    },
    onError: (e) => fail(e, "Could not resolve this conversation"),
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

  const transfer = useMutation({
    mutationFn: async (departmentId: string) =>
      transferFn({ data: { conversationId: active!.id, departmentId } }),
    onSuccess: (result) => {
      toast.success(
        result?.assignedTo
          ? `Transferred to ${result.departmentName} — assigned to ${result.assignedTo}`
          : `Transferred to ${result?.departmentName ?? "department"} — waiting for an agent`,
      );
      invalidate();
    },
    onError: (e) => fail(e, "Could not transfer this conversation"),
  });

  const isOwner = Boolean(active && active.assigned_to === userId);
  const isClosed = Boolean(active && CLOSED_STATUSES.includes(active.status));
  const canClaim =
    Boolean(active) &&
    !active!.assigned_to &&
    !isClosed &&
    CLAIMABLE_STATUSES.includes(active!.status) &&
    can("conversation.claim");
  const canReply = Boolean(active) && !isClosed && (isOwner || isSupervisor);
  const readOnly = Boolean(active) && !canReply && !canClaim;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "waiting", label: "Waiting" },
    { key: "mine", label: "Mine" },
    { key: "department", label: "Department" },
    { key: "active", label: "Active" },
    { key: "closed", label: "Closed" },
    ...(can("conversation.view_all") ? [{ key: "all" as Tab, label: "All conversations" }] : []),
  ];

  function ownershipLabel(c: Conversation) {
    if (!c.assigned_to) return "";
    if (c.assigned_to === userId) return "Assigned to you";
    const name = (staffQuery.data ?? []).find((s) => s.id === c.assigned_to)?.full_name;
    return name ? `Assigned to ${name}` : "Assigned to a colleague";

  }

  return (
    <AdminShell
      title="Inbox"
      description="Website chat conversations, AI answers, and live agent replies."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference or subject"
            className="h-8 w-56 rounded-md border border-border bg-background px-2 text-xs"
          />
          {tabs.map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_260px]">
        <aside className="max-h-[70vh] overflow-y-auto rounded-xl border border-border">
          {conversationsQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading conversations…</p>
          ) : conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing in this queue right now.</p>
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
                      <Badge variant={statusTone(c.status)}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                      {ownershipLabel(c)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.reference} · {new Date(c.last_message_at).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {total > PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </span>
            </div>
          ) : null}
        </aside>

        <section className="flex max-h-[70vh] flex-col rounded-xl border border-border">
          {!active ? (
            <p className="p-6 text-sm text-muted-foreground">Select a conversation.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <span className="text-sm font-medium">{active.subject ?? "Website chat"}</span>
                <Badge variant="outline">{active.priority}</Badge>
                <Badge variant={statusTone(active.status)}>
                  {STATUS_LABEL[active.status] ?? active.status}
                </Badge>
                {isOwner ? (
                  <Badge>Assigned to you</Badge>
                ) : active.assigned_to ? (
                  <Badge variant="secondary">Assigned to {ownerName}</Badge>
                ) : null}

                {readOnly ? <Badge variant="outline">View only</Badge> : null}

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {can("conversation.transfer") ? (
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
                  ) : null}

                  {isSupervisor && !isClosed ? (
                    <ReassignDialog
                      key={active.id}
                      conversationId={active.id}
                      currentAssignee={active.assigned_to}
                      onDone={invalidate}
                    />
                  ) : null}

                  {canClaim ? (
                    <Button size="sm" onClick={() => claim.mutate()} disabled={claim.isPending}>
                      {claim.isPending ? "Claiming…" : "Claim conversation"}
                    </Button>
                  ) : null}


                  {canReply ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => resolveConversation.mutate()}
                        disabled={resolveConversation.isPending}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => closeConversation.mutate()}
                        disabled={closeConversation.isPending}
                      >
                        Close
                      </Button>
                    </>
                  ) : null}

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
                    {(m.metadata as { attachment?: Attachment } | null)?.attachment ? (
                      <AttachmentCard
                        conversationId={active.id}
                        attachment={(m.metadata as { attachment: Attachment }).attachment}
                      />
                    ) : null}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {canReply ? (
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (draft.trim() && !sendReply.isPending) sendReply.mutate(draft.trim());
                      }
                    }}
                    placeholder="Reply to the visitor… (Enter to send, Shift+Enter for a new line)"
                    rows={3}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button type="submit" size="sm" disabled={sendReply.isPending || !draft.trim()}>
                      {sendReply.isPending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="border-t border-border p-4 text-sm text-muted-foreground">
                  {isClosed
                    ? "This conversation is closed."
                    : active.assigned_to
                      ? `${ownerName} is currently handling this conversation.`
                      : "Claim this conversation to reply."}
                </div>
              )}
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

type Attachment = { path: string; name: string; type: string; size: number };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Visitor attachment with on-demand signed access so agents can view or save it. */
function AttachmentCard({
  conversationId,
  attachment,
}: {
  conversationId: string;
  attachment: Attachment;
}) {
  const getUrl = useServerFn(attachmentUrlFn);
  const [busy, setBusy] = useState(false);

  const open = async (download: boolean) => {
    setBusy(true);
    try {
      const { url } = await getUrl({ data: { conversationId, path: attachment.path } });
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that attachment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-background/60 p-2 text-foreground">
      <p className="truncate text-xs font-medium">{attachment.name}</p>
      <p className="text-[11px] text-muted-foreground">
        {attachment.type} · {formatSize(attachment.size)}
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => open(false)}>
          View
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => open(true)}>
          Save
        </Button>
      </div>
    </div>
  );
}
