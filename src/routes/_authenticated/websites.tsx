import { createFileRoute } from "@tanstack/react-router";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { WidgetPreview } from "@/components/admin/WidgetPreview";
import {
  DEFAULT_WIDGET_TABS,
  WIDGET_TAB_ICONS,
  resolveWidgetTabs,
  tabIconPath,
  type WidgetTabConfig,
} from "@/lib/widget-tabs";

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
  const [creating, setCreating] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", domain: "" });
  const [tabs, setTabs] = useState<WidgetTabConfig[]>(DEFAULT_WIDGET_TABS);

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
  const servicesQuery = useQuery({
    queryKey: ["widget-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, short_description, status, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const services = servicesQuery.data ?? [];
  const active = websites.find((w) => w.id === activeId) ?? websites[0] ?? null;

  useEffect(() => {
    if (active) {
      setActiveId(active.id);
      setForm(active);
      setDomainsText(((active.allowed_domains as string[] | null) ?? []).join(", "));
      setTabs(resolveWidgetTabs(active.tab_config));
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
          home_greeting: form.home_greeting,
          home_headline: form.home_headline,
          home_subtitle: form.home_subtitle,
          home_cta_title: form.home_cta_title,
          home_cta_subtitle: form.home_cta_subtitle,
          help_title: form.help_title,
          privacy_footer_text: form.privacy_footer_text,
          show_home_tab: Boolean(form.show_home_tab),
          show_help_tab: Boolean(form.show_help_tab),
          show_services_tab: Boolean(form.show_services_tab),
          show_requests_tab: Boolean(form.show_requests_tab),
          tab_config: tabs,
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

  const create = useMutation({
    mutationFn: async () => {
      let organizationId: string | null = websites[0]?.organization_id ?? null;
      if (!organizationId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("organization_id")
          .maybeSingle();
        organizationId = prof?.organization_id ?? null;
      }
      if (!organizationId) throw new Error("No organization found for this account.");
      const domain = newSite.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!newSite.name.trim() || !domain) throw new Error("Name and domain are required.");
      const { data, error } = await supabase
        .from("websites")
        .insert({
          organization_id: organizationId,
          name: newSite.name.trim(),
          domain,
          allowed_domains: [domain],
        })
        .select("id")
        .single();
      if (error) throw error;
      await logAudit({
        action: "website.created",
        recordType: "websites",
        recordId: data.id,
        websiteId: data.id,
        newValue: { name: newSite.name, domain },
      });
      return data.id as string;
    },
    onSuccess: async (id) => {
      setNewSite({ name: "", domain: "" });
      setCreating(false);
      setNotice("Website created.");
      await queryClient.invalidateQueries({ queryKey: ["websites"] });
      if (id) setActiveId(id);
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Could not create website"),
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
          <div className="border-b border-border p-3">
            {creating ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setNotice(null);
                  create.mutate();
                }}
              >
                <Input
                  placeholder="Site name"
                  value={newSite.name}
                  onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                />
                <Input
                  placeholder="example.com"
                  value={newSite.domain}
                  onChange={(e) => setNewSite({ ...newSite, domain: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={create.isPending}>
                    {create.isPending ? "Creating…" : "Create"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button size="sm" className="w-full" onClick={() => setCreating(true)}>
                + Add website
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border">
            {websites.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(w.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-accent ${w.id === active?.id ? "bg-accent" : ""}`}
                >
                  <span className="text-sm font-medium">{w.name}</span>
                  {w.status !== "active" ? (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {w.status}
                    </span>
                  ) : null}
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
              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold">Site basics</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Identity, domains, and widget appearance.
                </p>
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
                <div className="mt-4 flex items-center gap-3">
                  <Switch
                    id="auto-open"
                    checked={Boolean(form.auto_open)}
                    onCheckedChange={(v) => setForm({ ...form, auto_open: v })}
                  />
                  <Label htmlFor="auto-open">Auto-open the widget after the trigger delay</Label>
                </div>
              </div>


              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold">Home screen</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Copy shown on the widget home tab.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Greeting line">
                    <Input
                      value={form.home_greeting ?? ""}
                      onChange={(e) => setForm({ ...form, home_greeting: e.target.value })}
                    />
                  </Field>
                  <Field label="Headline">
                    <Input
                      value={form.home_headline ?? ""}
                      onChange={(e) => setForm({ ...form, home_headline: e.target.value })}
                    />
                  </Field>
                  <Field label="Sub-headline">
                    <Input
                      value={form.home_subtitle ?? ""}
                      onChange={(e) => setForm({ ...form, home_subtitle: e.target.value })}
                    />
                  </Field>
                  <Field label="Privacy footer text">
                    <Input
                      value={form.privacy_footer_text ?? ""}
                      onChange={(e) => setForm({ ...form, privacy_footer_text: e.target.value })}
                    />
                  </Field>
                  <Field label="Message card title">
                    <Input
                      value={form.home_cta_title ?? ""}
                      onChange={(e) => setForm({ ...form, home_cta_title: e.target.value })}
                    />
                  </Field>
                  <Field label="Message card subtitle">
                    <Input
                      value={form.home_cta_subtitle ?? ""}
                      onChange={(e) => setForm({ ...form, home_cta_subtitle: e.target.value })}
                    />
                  </Field>
                  <Field label="Help section title">
                    <Input
                      value={form.help_title ?? ""}
                      onChange={(e) => setForm({ ...form, help_title: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold">Bottom navigation buttons</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Rename, reorder, re-icon, or hide the buttons at the bottom of the widget. Chat
                  always stays visible.
                </p>
                <ul className="space-y-2">
                  {tabs.map((tab, index) => (
                    <li
                      key={tab.key}
                      className="grid items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,160px)_auto]"
                    >
                      <Switch
                        aria-label={`Show ${tab.label}`}
                        checked={tab.enabled}
                        disabled={tab.key === "chat"}
                        onCheckedChange={(v) =>
                          setTabs(tabs.map((t) => (t.key === tab.key ? { ...t, enabled: v } : t)))
                        }
                      />
                      <Input
                        value={tab.label}
                        placeholder={tab.key}
                        onChange={(e) =>
                          setTabs(
                            tabs.map((t) =>
                              t.key === tab.key ? { ...t, label: e.target.value } : t,
                            ),
                          )
                        }
                      />
                      <div className="flex items-center gap-2">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          className="shrink-0 text-muted-foreground"
                        >
                          <path d={tabIconPath(tab.icon)} />
                        </svg>
                        <select
                          aria-label={`${tab.label} icon`}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={tab.icon}
                          onChange={(e) =>
                            setTabs(
                              tabs.map((t) =>
                                t.key === tab.key ? { ...t, icon: e.target.value } : t,
                              ),
                            )
                          }
                        >
                          {Object.keys(WIDGET_TAB_ICONS).map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={index === 0}
                          onClick={() => setTabs(moveTab(tabs, index, -1))}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={index === tabs.length - 1}
                          onClick={() => setTabs(moveTab(tabs, index, 1))}
                        >
                          ↓
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setTabs(DEFAULT_WIDGET_TABS)}
                >
                  Reset to defaults
                </Button>
              </div>

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

            <ServicesCard organizationId={active.organization_id} />

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

            <div className="rounded-xl border border-destructive/30 p-4">
              <h2 className="text-sm font-semibold">Website status</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Suspending stops the widget from loading on {active.domain} but keeps all
                conversations and history. Deleting is permanent and only possible when no
                conversations are linked.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {active.status === "active" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate("suspended")}
                  >
                    Suspend website
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate("active")}
                  >
                    Reactivate website
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete "${active.name}"? This cannot be undone.`)) {
                      setNotice(null);
                      remove.mutate();
                    }
                  }}
                >
                  Delete website
                </Button>
              </div>
              {notice ? <p className="mt-2 text-sm text-muted-foreground">{notice}</p> : null}
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">No websites configured.</p>
        )}
      </div>

      {active ? (
        <WidgetPreview
          config={{
            chatbotName: form.chatbot_name,
            organizationName: form.name,
            welcomeMessage: form.welcome_message,
            triggerMessage: form.trigger_message,
            privacyDisclaimer: form.privacy_disclaimer,
            primaryColor: form.primary_color,
            accentColor: form.accent_color,
            position: form.widget_position,
            logoUrl: form.logo_url,
            borderRadius: form.border_radius,
            homeGreeting: form.home_greeting,
            homeHeadline: form.home_headline,
            homeSubtitle: form.home_subtitle,
            homeCtaTitle: form.home_cta_title,
            homeCtaSubtitle: form.home_cta_subtitle,
            helpTitle: form.help_title,
            privacyFooterText: form.privacy_footer_text,
            showHomeTab: form.show_home_tab,
            showHelpTab: form.show_help_tab,
            showServicesTab: form.show_services_tab,
            showRequestsTab: form.show_requests_tab,
            topics: services.map((s) => s.name),
            tabs,
          }}
        />
      ) : null}
    </AdminShell>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : "#1d4ed8";
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="Pick color"
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#1d4ed8" />
    </div>
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


function ServicesCard({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ name: "", short_description: "" });
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["widget-services"],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("services")
        .select("id, name, short_description, status, sort_order")
        .order("sort_order");
      if (err) throw err;
      return data ?? [];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["widget-services"] });

  const add = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Service name is required.");
      const { error: err } = await supabase.from("services").insert({
        organization_id: organizationId,
        name: draft.name.trim(),
        short_description: draft.short_description.trim() || draft.name.trim(),
        applies_to_all: true,
      });
      if (err) throw err;
    },
    onSuccess: () => {
      setDraft({ name: "", short_description: "" });
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not add service"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.from("services").delete().eq("id", id);
      if (err) throw err;
    },
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : "Could not delete service"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) => {
      const { error: err } = await supabase.from("services").update({ status }).eq("id", id);
      if (err) throw err;
    },
    onSuccess: invalidate,
  });

  return (
    <div className="rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold">Services shown in the widget</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These appear on the widget Services tab and in home-screen suggestions.
      </p>

      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
        {(list.data ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">{s.short_description}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toggle.mutate({ id: s.id, status: s.status === "active" ? "inactive" : "active" })
              }
            >
              {s.status === "active" ? "Hide" : "Show"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
              Delete
            </Button>
          </li>
        ))}
        {(list.data ?? []).length === 0 ? (
          <li className="px-3 py-2.5 text-sm text-muted-foreground">No services yet.</li>
        ) : null}
      </ul>

      <form
        className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Input
          placeholder="Service name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Input
          placeholder="Short description"
          value={draft.short_description}
          onChange={(e) => setDraft({ ...draft, short_description: e.target.value })}
        />
        <Button type="submit" size="sm" disabled={add.isPending}>
          Add service
        </Button>
      </form>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}


function moveTab(list: WidgetTabConfig[], index: number, delta: number): WidgetTabConfig[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}
