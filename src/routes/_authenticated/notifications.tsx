import { createFileRoute, Link } from "@tanstack/react-router";
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
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const { notifications, unread, markRead } = useNotifications();
  const { count: waitingCount } = useWaitingCount();
  const [push, setPush] = useState<PushStatus>("default");
  const [saved, setSaved] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, boolean | number>>({});

  useEffect(() => setPush(pushStatus()), []);

  const prefs = useQuery({
    queryKey: ["notification-preferences", session.data?.userId],
    enabled: Boolean(session.data?.userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", session.data!.userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Prefs | null;
    },
  });

  useEffect(() => {
    const p = prefs.data;
    const next: Record<string, boolean | number> = {
      sla_first_response_minutes: p?.sla_first_response_minutes ?? 15,
    };
    for (const t of TOGGLES) {
      next[`inapp_${t.key}`] = (p?.[`inapp_${t.key}`] as boolean) ?? true;
      next[`email_${t.key}`] = (p?.[`email_${t.key}`] as boolean) ?? t.key === "escalations";
    }
    setForm(next);
  }, [prefs.data]);

  const save = useMutation({
    mutationFn: async () => {
      const userId = session.data?.userId;
      if (!userId) return;
      const { error } = await supabase.from("notification_preferences").upsert(
        {
          user_id: userId,
          organization_id: session.data?.organizationId ?? null,
          ...form,
        } as never,
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setSaved("Preferences saved.");
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: (e) => setSaved(e instanceof Error ? e.message : "Could not save"),
  });

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
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-2">
          {notifications.map((n) => (
            <article
              key={n.id}
              className={`rounded-xl border p-4 transition ${
                n.read_at ? "border-border bg-card" : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={n.severity === "critical" ? "destructive" : "outline"} className="capitalize">
                  {n.type.replace(/_/g, " ")}
                </Badge>
                <span className="text-sm font-medium">{n.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>
              {n.body ? <p className="mt-2 text-sm text-muted-foreground">{n.body}</p> : null}
              <div className="mt-3 flex items-center gap-3 text-xs">
                {n.link ? (
                  <Link to={n.link} className="font-medium text-primary hover:underline">
                    Open
                  </Link>
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

        <section className="h-fit rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Alert preferences</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose what reaches you in the console and by email.
          </p>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Alert</span>
              <span>In app</span>
              <span>Email</span>
            </div>
            {TOGGLES.map((t) => (
              <div key={t.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                <span>{t.label}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={Boolean(form[`inapp_${t.key}`])}
                  onChange={(e) => setForm({ ...form, [`inapp_${t.key}`]: e.target.checked })}
                />
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={Boolean(form[`email_${t.key}`])}
                  onChange={(e) => setForm({ ...form, [`email_${t.key}`]: e.target.checked })}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2">
            <Label htmlFor="sla">First-response target (minutes)</Label>
            <Input
              id="sla"
              type="number"
              min={1}
              max={1440}
              value={Number(form.sla_first_response_minutes ?? 15)}
              onChange={(e) =>
                setForm({ ...form, sla_first_response_minutes: Number(e.target.value) || 15 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Waiting conversations older than this appear as SLA breaches on the dashboard.
            </p>
          </div>

          {saved ? <p className="mt-4 text-sm text-muted-foreground">{saved}</p> : null}
          <Button
            className="mt-4 w-full"
            onClick={() => {
              setSaved(null);
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save preferences"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Email delivery activates once a sending domain is verified for this workspace.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
