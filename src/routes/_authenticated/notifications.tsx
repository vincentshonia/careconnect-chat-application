import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/use-notifications";
import { useWaitingCount } from "@/hooks/use-waiting-count";
import { pushStatus, requestPush, type PushStatus } from "@/lib/desktop-push";
import { useSessionContext } from "@/hooks/use-session-context";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInZone } from "@/lib/org-time";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Pacific Health Group Support Console" },
      {
        name: "description",
        content: "Escalation alerts, new intake notices, SLA warnings, and your alert preferences.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

const TOGGLES = [
  { key: "escalations", label: "Live-agent escalations" },
  { key: "new_intake", label: "New referrals & enrollments" },
  { key: "sla_breach", label: "First-response SLA breaches" },
  { key: "low_rating", label: "Low satisfaction ratings" },
] as const;

type Prefs = {
  user_id: string;
  organization_id: string | null;
  sla_first_response_minutes: number;
  [key: string]: unknown;
};

function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  /**
   * Notification links are stored as plain strings ("/inbox?c=<id>"). The
   * router's `to` prop never parses a raw query string, so split it here and
   * hand the params over as real search params.
   */
  const openLink = (link: string) => {
    const [pathname, queryString] = link.split("?");
    const search = Object.fromEntries(new URLSearchParams(queryString ?? ""));
    void router.navigate({ to: pathname, search } as never);
  };
  const session = useSessionContext();
  const { notifications, unread, markRead } = useNotifications();
  const { count: waitingCount } = useWaitingCount();

  return (
    <AdminShell
      title="Notifications"
      description="Everything that needs your attention, plus how you want to be alerted."
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={unread.length === 0 || markRead.isPending}
          onClick={() => markRead.mutate(unread.map((n) => n.id))}
        >
          Mark all read
        </Button>
      }
    >
      <div
        className={`mb-6 flex flex-wrap items-center gap-3 rounded-xl border p-4 ${
          waitingCount > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
        }`}
      >
        <span className="grid h-9 min-w-9 place-items-center rounded-full bg-destructive px-2 text-sm font-semibold text-destructive-foreground">
          {waitingCount}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {waitingCount === 1
              ? "1 conversation is waiting for a human"
              : `${waitingCount} conversations are waiting for a human`}
          </p>
          <p className="text-xs text-muted-foreground">
            Unclaimed chats in your queues. The sidebar badge tracks the same number live.
          </p>
        </div>
        <Link to="/inbox" className="ml-auto text-sm font-medium text-primary hover:underline">
          Open inbox
        </Link>
      </div>

      <p className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        Manage alert preferences in{" "}
        <Link to="/profile" className="font-medium text-primary hover:underline">
          My settings
        </Link>
        .
      </p>

      <div>
        <section className="space-y-2">
          {notifications.map((n) => (
            <article
              key={n.id}
              className={`rounded-xl border p-4 transition ${
                n.read_at ? "border-border bg-card" : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={n.severity === "critical" ? "destructive" : "outline"}
                  className="capitalize"
                >
                  {n.type.replace(/_/g, " ")}
                </Badge>
                <span className="text-sm font-medium">{n.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatInZone(n.created_at)}
                </span>
              </div>
              {n.body ? <p className="mt-2 text-sm text-muted-foreground">{n.body}</p> : null}
              <div className="mt-3 flex items-center gap-3 text-xs">
                {n.link ? (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => openLink(n.link!)}
                  >
                    Open
                  </button>
                ) : null}
                {!n.read_at ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:underline"
                    onClick={() => markRead.mutate([n.id])}
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {notifications.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No alerts yet. Escalations, new intakes and SLA breaches will appear here.
            </p>
          ) : null}
        </section>

      </div>
    </AdminShell>
  );
}
