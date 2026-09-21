/**
 * Personal alert preferences — in-app, desktop and email delivery plus the
 * first-response reminder target. Lives in My settings; the Notifications page
 * only links here.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionContext } from "@/hooks/use-session-context";
import { pushStatus, requestPush, type PushStatus } from "@/lib/desktop-push";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export function AlertPreferences() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
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

  // Keyed on the loaded record, not the query object, so a refetch cannot
  // discard toggles the user has not saved yet.
  useEffect(() => {
    if (!prefs.isSuccess) return;
    const p = prefs.data;
    const next: Record<string, boolean | number> = {
      sla_first_response_minutes: p?.sla_first_response_minutes ?? 15,
    };
    for (const t of TOGGLES) {
      next[`inapp_${t.key}`] = (p?.[`inapp_${t.key}`] as boolean) ?? true;
      // Chat-alert emails (escalations, and new intake) are on by default so a
      // waiting visitor reaches the team without anyone configuring anything.
      next[`email_${t.key}`] =
        (p?.[`email_${t.key}`] as boolean) ?? (t.key === "escalations" || t.key === "new_intake");
    }
    setForm(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.isSuccess, prefs.data?.user_id]);

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
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-card-foreground">Alert preferences</h2>
        <p className="text-xs text-muted-foreground">
          Choose what reaches you in the console, on your desktop and by email.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Desktop &amp; device alerts</p>
          <p className="text-xs text-muted-foreground">
            {push === "granted"
              ? "Enabled — new escalations pop up even when this tab is in the background."
              : push === "denied"
                ? "Blocked by your browser. Re-enable notifications for this site in your browser settings."
                : push === "open-in-new-tab"
                  ? "Open the console in its own browser tab to turn on device notifications."
                  : push === "unsupported"
                    ? "This browser does not support desktop notifications."
                    : "Get a system pop-up on your desktop or phone the moment a chat needs a human."}
          </p>
        </div>
        <Button
          className="ml-auto"
          size="sm"
          variant="outline"
          disabled={push !== "default"}
          onClick={async () => setPush(await requestPush())}
        >
          {push === "granted" ? "Enabled" : "Enable notifications"}
        </Button>
      </div>

      <div className="space-y-3">
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
              aria-label={`${t.label} in app`}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={Boolean(form[`inapp_${t.key}`])}
              onChange={(e) => setForm({ ...form, [`inapp_${t.key}`]: e.target.checked })}
            />
            <input
              type="checkbox"
              aria-label={`${t.label} by email`}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={Boolean(form[`email_${t.key}`])}
              onChange={(e) => setForm({ ...form, [`email_${t.key}`]: e.target.checked })}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sla">First-response target (minutes)</Label>
        <Input
          id="sla"
          type="number"
          min={1}
          max={1440}
          className="max-w-[200px]"
          value={Number(form.sla_first_response_minutes ?? 15)}
          onChange={(e) =>
            setForm({ ...form, sla_first_response_minutes: Number(e.target.value) || 15 })
          }
        />
        <p className="text-xs text-muted-foreground">
          Waiting conversations older than this appear as SLA breaches on the dashboard.
        </p>
      </div>

      {saved ? <p className="text-sm text-muted-foreground">{saved}</p> : null}
      <Button
        onClick={() => {
          setSaved(null);
          save.mutate();
        }}
        disabled={save.isPending}
      >
        {save.isPending ? "Saving…" : "Save preferences"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Email delivery activates once a sending domain is verified for this workspace.
      </p>
    </section>
  );
}
