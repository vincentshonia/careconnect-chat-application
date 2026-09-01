import { createFileRoute } from "@tanstack/react-router";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/websites")({
  head: () => ({
    meta: [
      { title: "Websites & Widget Settings — Pacific Health Group" },
      {
        name: "description",
        content: "Configure widget branding, greetings, proactive triggers, and the embed snippet.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WebsitesPageRoute,
});

type Website = Database["public"]["Tables"]["websites"]["Row"];

function WebsitesPageRoute() {
  return (
    <RequirePermission permission="website.manage" title="Websites">
      <WebsitesPage />
    </RequirePermission>
  );
}

function WebsitesPage() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Website>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [domainsText, setDomainsText] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const listQuery = useQuery({
    queryKey: ["websites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("websites").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Website[];
    },
  });

  const websites = listQuery.data ?? [];
  const active = websites.find((w) => w.id === activeId) ?? websites[0] ?? null;

  useEffect(() => {
    if (active) {
      setActiveId(active.id);
      setForm(active);
      setDomainsText(((active.allowed_domains as string[] | null) ?? []).join(", "));
    }
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase
        .from("websites")
        .update({
          name: form.name,
          domain: (form.domain ?? "").trim().toLowerCase(),
          allowed_domains: String(domainsText)
            .split(/[\s,]+/)
            .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
            .filter(Boolean),
          chatbot_name: form.chatbot_name,
          welcome_message: form.welcome_message,
          trigger_message: form.trigger_message,
          trigger_delay_seconds: Number(form.trigger_delay_seconds ?? 0),
          auto_open: Boolean(form.auto_open),
          widget_position: form.widget_position,
          primary_color: form.primary_color,
          accent_color: form.accent_color,
          offline_message: form.offline_message,
          privacy_disclaimer: form.privacy_disclaimer,
          ai_instructions: form.ai_instructions,
        })
        .eq("id", active.id);
      if (error) throw error;
      await logAudit({
        action: "website_settings.updated",
        recordType: "websites",
        recordId: active.id,
        websiteId: active.id,
        newValue: { name: form.name, chatbot_name: form.chatbot_name, widget_position: form.widget_position },
      });
    },
    onSuccess: () => {
      setNotice("Widget settings saved.");
      queryClient.invalidateQueries({ queryKey: ["websites"] });
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Save failed"),
  });

  const setStatus = useMutation({
    mutationFn: async (status: "active" | "suspended") => {
      if (!active) return;
      const { error } = await supabase.from("websites").update({ status }).eq("id", active.id);
      if (error) throw error;
      await logAudit({
        action: `website.${status === "suspended" ? "suspended" : "activated"}`,
        recordType: "websites",
        recordId: active.id,
        websiteId: active.id,
        newValue: { status },
      });
    },
    onSuccess: (_d, status) => {
      setNotice(status === "suspended" ? "Website suspended — the widget will stop loading." : "Website reactivated.");
      queryClient.invalidateQueries({ queryKey: ["websites"] });
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase.from("websites").delete().eq("id", active.id);
      if (error) throw error;
      await logAudit({
        action: "website.deleted",
        recordType: "websites",
        recordId: active.id,
        previousValue: { name: active.name, domain: active.domain },
      });
    },
    onSuccess: () => {
      setActiveId(null);
      setNotice("Website deleted.");
      queryClient.invalidateQueries({ queryKey: ["websites"] });
    },
    onError: () =>
      setNotice(
        "Could not delete this website. It still has conversations or other linked records — suspend it instead.",
      ),
  });

  // Preview/sandbox origins are auth-gated, so a snippet pointing at them never
  // loads on a customer site. Always emit the public production origin.
  const PUBLIC_EMBED_ORIGIN = "https://chat.mypacifichealth.com";
  const isPrivateOrigin =
    !origin ||
    /lovableproject\.com|gpt-eng\.com|id-preview|-dev\.lovable\.app|localhost|127\.0\.0\.1/.test(origin);
  const embedOrigin = isPrivateOrigin ? PUBLIC_EMBED_ORIGIN : origin;

  const snippet = active
    ? `<script src="${embedOrigin}/api/public/widget.js" data-website-id="${active.id}"></script>`
    : "";


  return (
    <AdminShell
      title="Websites & widget"
      description="Branding, greetings, proactive triggers, and the embed snippet for each site."
    >
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-border">
          <ul className="divide-y divide-border">
            {websites.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(w.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-accent ${w.id === active?.id ? "bg-accent" : ""}`}
                >
                  <span className="text-sm font-medium">{w.name}</span>
                  <p className="text-xs text-muted-foreground">{w.domain}</p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {active ? (
          <section className="space-y-6">
            <form
              className="space-y-4 rounded-xl border border-border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setNotice(null);
                save.mutate();
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Site name">
                  <Input
                    value={form.name ?? ""}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Chatbot name">
                  <Input
                    value={form.chatbot_name ?? ""}
                    onChange={(e) => setForm({ ...form, chatbot_name: e.target.value })}
                  />
                </Field>
                <Field label="Primary domain">
                  <Input
                    placeholder="mypacifichealth.com"
                    value={form.domain ?? ""}
                    onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  />
                </Field>
                <Field label="Allowed embed domains">
                  <Input
                    placeholder="mypacifichealth.com, www.mypacifichealth.com"
                    value={domainsText}
                    onChange={(e) => setDomainsText(e.target.value)}
                  />
                </Field>
                <Field label="Primary color">
                  <ColorInput
                    value={form.primary_color ?? "#1d4ed8"}
                    onChange={(v) => setForm({ ...form, primary_color: v })}
                  />
                </Field>
                <Field label="Accent color">
                  <ColorInput
                    value={form.accent_color ?? "#0891b2"}
                    onChange={(v) => setForm({ ...form, accent_color: v })}
                  />
                </Field>

                <Field label="Widget position">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.widget_position ?? "bottom-right"}
                    onChange={(e) => setForm({ ...form, widget_position: e.target.value })}
                  >
                    <option value="bottom-right">bottom-right</option>
                    <option value="bottom-left">bottom-left</option>
                  </select>
                </Field>
                <Field label="Trigger delay (seconds)">
                  <Input
                    type="number"
                    min={0}
                    value={form.trigger_delay_seconds ?? 0}
                    onChange={(e) =>
                      setForm({ ...form, trigger_delay_seconds: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>

              <Field label="Welcome message">
                <Textarea
                  rows={2}
                  value={form.welcome_message ?? ""}
                  onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
                />
              </Field>
              <Field label="Proactive trigger message">
                <Textarea
                  rows={2}
                  value={form.trigger_message ?? ""}
                  onChange={(e) => setForm({ ...form, trigger_message: e.target.value })}
                />
              </Field>
              <Field label="Offline message">
                <Textarea
                  rows={2}
                  value={form.offline_message ?? ""}
                  onChange={(e) => setForm({ ...form, offline_message: e.target.value })}
                />
              </Field>
              <Field label="Privacy disclaimer">
                <Textarea
                  rows={2}
                  value={form.privacy_disclaimer ?? ""}
                  onChange={(e) => setForm({ ...form, privacy_disclaimer: e.target.value })}
                />
              </Field>
              <Field label="AI instructions (site specific)">
                <Textarea
                  rows={4}
                  value={form.ai_instructions ?? ""}
                  onChange={(e) => setForm({ ...form, ai_instructions: e.target.value })}
                />
              </Field>

              <div className="flex items-center gap-3">
                <Switch
                  id="auto-open"
                  checked={Boolean(form.auto_open)}
                  onCheckedChange={(v) => setForm({ ...form, auto_open: v })}
                />
                <Label htmlFor="auto-open">Auto-open the widget after the trigger delay</Label>
              </div>

              {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save settings"}
              </Button>
            </form>

            <div className="rounded-xl border border-border p-4">
              <h2 className="text-sm font-semibold">Embed snippet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste this before the closing body tag on {active.domain}.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">{snippet}</pre>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(snippet)}
              >
                Copy snippet
              </Button>
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">No websites configured.</p>
        )}
      </div>
    </AdminShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
