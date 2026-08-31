import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useSessionContext } from "@/hooks/use-session-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/organizations")({
  head: () => ({
    meta: [
      { title: "Organizations & Brands — Pacific Health Group Support Console" },
      {
        name: "description",
        content: "Manage tenant organizations, their brands, and the websites each brand serves.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrganizationsPage,
});

type Organization = Database["public"]["Tables"]["organizations"]["Row"];

function OrganizationsPage() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const isAdmin = session.data?.isAdmin ?? false;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Organization>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [brand, setBrand] = useState({ name: "", slug: "" });
  const [site, setSite] = useState({ name: "", domain: "" });

  const orgQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Organization[];
    },
  });

  const orgs = orgQuery.data ?? [];
  const active = orgs.find((o) => o.id === activeId) ?? orgs[0] ?? null;

  useEffect(() => {
    if (active) {
      setActiveId(active.id);
      setForm(active);
    }
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const childrenQuery = useQuery({
    queryKey: ["org-children", active?.id],
    enabled: Boolean(active?.id),
    queryFn: async () => {
      const [workspaces, websites] = await Promise.all([
        supabase.from("workspaces").select("*").eq("organization_id", active!.id).order("name"),
        supabase.from("websites").select("*").eq("organization_id", active!.id).order("name"),
      ]);
      if (workspaces.error) throw workspaces.error;
      if (websites.error) throw websites.error;
      return { workspaces: workspaces.data ?? [], websites: websites.data ?? [] };
    },
  });

  const saveOrg = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase
        .from("organizations")
        .update({
          name: form.name,
          phone: form.phone,
          email: form.email,
          address: form.address,
          timezone: form.timezone,
          primary_color: form.primary_color,
          ai_instructions: form.ai_instructions,
          emergency_message: form.emergency_message,
          privacy_notice: form.privacy_notice,
        })
        .eq("id", active.id);
      if (error) throw error;
      await logAudit({ action: "organization.updated", recordType: "organizations", recordId: active.id, newValue: { name: form.name, timezone: form.timezone } });
    },
    onSuccess: () => {
      setNotice("Organization saved.");
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (e) => setNotice(e instanceof Error ? e.message : "Save failed"),
  });

  const addBrand = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase.from("workspaces").insert({
        organization_id: active.id,
        name: brand.name,
        slug: brand.slug || brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      });
      if (error) throw error;
      await logAudit({ action: "brand.created", recordType: "workspaces", newValue: { name: brand.name } });
    },
    onSuccess: () => {
      setBrand({ name: "", slug: "" });
      queryClient.invalidateQueries({ queryKey: ["org-children"] });
    },
  });

  const addSite = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase.from("websites").insert({
        organization_id: active.id,
        name: site.name,
        domain: site.domain,
        // Public widget key; the database also defaults this if omitted.
        public_key: `cc_pk_${crypto.randomUUID().replace(/-/g, "")}`,
      });
      if (error) throw error;
      await logAudit({ action: "website.created", recordType: "websites", newValue: { name: site.name, domain: site.domain } });
    },
    onSuccess: () => {
      setSite({ name: "", domain: "" });
      queryClient.invalidateQueries({ queryKey: ["org-children"] });
    },
  });

  return (
    <AdminShell
      title="Organizations & brands"
      description="Each organization is an isolated tenant with its own brands, websites, knowledge, and conversations."
    >
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-border">
          <ul className="divide-y divide-border">
            {orgs.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(o.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-accent ${o.id === active?.id ? "bg-accent" : ""}`}
                >
                  <span className="text-sm font-medium">{o.name}</span>
                  <p className="text-xs text-muted-foreground">{o.slug}</p>
                </button>
              </li>
            ))}
            {orgs.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">No organizations visible.</li>
            ) : null}
          </ul>
        </aside>

        {active ? (
          <section className="space-y-6">
            <form
              className="space-y-4 rounded-xl border border-border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setNotice(null);
                saveOrg.mutate();
              }}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Tenant details</h2>
                <Badge variant="outline" className="capitalize">
                  {active.status}
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name">
                  <Input
                    disabled={!isAdmin}
                    value={form.name ?? ""}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Support email">
                  <Input
                    disabled={!isAdmin}
                    value={form.email ?? ""}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    disabled={!isAdmin}
                    value={form.phone ?? ""}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="Timezone">
                  <Input
                    disabled={!isAdmin}
                    value={form.timezone ?? ""}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  />
                </Field>
                <Field label="Primary color">
                  <Input
                    disabled={!isAdmin}
                    value={form.primary_color ?? ""}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  />
                </Field>
                <Field label="Address">
                  <Input
                    disabled={!isAdmin}
                    value={form.address ?? ""}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Organization-wide AI instructions">
                <Textarea
                  rows={3}
                  disabled={!isAdmin}
                  value={form.ai_instructions ?? ""}
                  onChange={(e) => setForm({ ...form, ai_instructions: e.target.value })}
                />
              </Field>
              <Field label="Emergency message">
                <Textarea
                  rows={2}
                  disabled={!isAdmin}
                  value={form.emergency_message ?? ""}
                  onChange={(e) => setForm({ ...form, emergency_message: e.target.value })}
                />
              </Field>
              <Field label="Privacy notice">
                <Textarea
                  rows={2}
                  disabled={!isAdmin}
                  value={form.privacy_notice ?? ""}
                  onChange={(e) => setForm({ ...form, privacy_notice: e.target.value })}
                />
              </Field>
              {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
              <Button type="submit" disabled={!isAdmin || saveOrg.isPending}>
                {saveOrg.isPending ? "Saving…" : "Save organization"}
              </Button>
            </form>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border p-4">
                <h2 className="text-sm font-semibold">Brands</h2>
                <ul className="mt-3 space-y-2">
                  {(childrenQuery.data?.workspaces ?? []).map((w) => (
                    <li key={w.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      {w.name} <span className="text-xs text-muted-foreground">/{w.slug}</span>
                    </li>
                  ))}
                  {(childrenQuery.data?.workspaces ?? []).length === 0 ? (
                    <li className="text-sm text-muted-foreground">No brands yet.</li>
                  ) : null}
                </ul>
                <form
                  className="mt-4 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addBrand.mutate();
                  }}
                >
                  <Input
                    placeholder="Brand name"
                    value={brand.name}
                    disabled={!isAdmin}
                    onChange={(e) => setBrand({ ...brand, name: e.target.value })}
                    required
                  />
                  <Input
                    placeholder="slug (optional)"
                    value={brand.slug}
                    disabled={!isAdmin}
                    onChange={(e) => setBrand({ ...brand, slug: e.target.value })}
                  />
                  {addBrand.error ? (
                    <p className="text-sm text-destructive">{(addBrand.error as Error).message}</p>
                  ) : null}
                  <Button size="sm" type="submit" disabled={!isAdmin || addBrand.isPending}>
                    Add brand
                  </Button>
                </form>
              </div>

              <div className="rounded-xl border border-border p-4">
                <h2 className="text-sm font-semibold">Websites</h2>
                <ul className="mt-3 space-y-2">
                  {(childrenQuery.data?.websites ?? []).map((w) => (
                    <li key={w.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      {w.name} <span className="text-xs text-muted-foreground">{w.domain}</span>
                    </li>
                  ))}
                  {(childrenQuery.data?.websites ?? []).length === 0 ? (
                    <li className="text-sm text-muted-foreground">No websites yet.</li>
                  ) : null}
                </ul>
                <form
                  className="mt-4 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addSite.mutate();
                  }}
                >
                  <Input
                    placeholder="Website name"
                    value={site.name}
                    disabled={!isAdmin}
                    onChange={(e) => setSite({ ...site, name: e.target.value })}
                    required
                  />
                  <Input
                    placeholder="example.com"
                    value={site.domain}
                    disabled={!isAdmin}
                    onChange={(e) => setSite({ ...site, domain: e.target.value })}
                    required
                  />
                  {addSite.error ? (
                    <p className="text-sm text-destructive">{(addSite.error as Error).message}</p>
                  ) : null}
                  <Button size="sm" type="submit" disabled={!isAdmin || addSite.isPending}>
                    Add website
                  </Button>
                </form>
              </div>
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">No organization selected.</p>
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
