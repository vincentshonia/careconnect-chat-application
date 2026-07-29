import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useSessionContext } from "@/hooks/use-session-context";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/routing")({
  head: () => ({
    meta: [
      { title: "Routing & Templates — Pacific Health Group Support Console" },
      { name: "description", content: "Route escalations to the right department and manage canned replies." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoutingPage,
});

type Rule = Database["public"]["Tables"]["routing_rules"]["Row"];
type Template = Database["public"]["Tables"]["response_templates"]["Row"];

const MATCH_TYPES = ["interest", "keyword", "county", "menu_option", "language"];

function RoutingPage() {
  return (
    <AdminShell
      title="Routing & templates"
      description="Decide which department receives each escalation, and keep approved replies handy for agents."
    >
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Routing rules</TabsTrigger>
          <TabsTrigger value="templates">Response templates</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-4">
          <Rules />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <Templates />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function Rules() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const orgId = session.data?.organizationId ?? null;
  const [form, setForm] = useState({
    name: "",
    match_type: "interest",
    match_value: "",
    department_id: "",
    priority: 100,
  });

  const list = useQuery({
    queryKey: ["routing-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("routing_rules").select("*").order("priority");
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const departments = useQuery({
    queryKey: ["departments-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.name.trim() || !form.match_value.trim()) return;
      const { error } = await supabase.from("routing_rules").insert({
        organization_id: orgId,
        name: form.name.trim(),
        match_type: form.match_type,
        match_value: form.match_value.trim(),
        department_id: form.department_id || null,
        priority: Number(form.priority) || 100,
        routing_method: "first_available",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ name: "", match_type: "interest", match_value: "", department_id: "", priority: 100 });
      queryClient.invalidateQueries({ queryKey: ["routing-rules"] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database["public"]["Tables"]["routing_rules"]["Update"] }) => {
      const { error } = await supabase.from("routing_rules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-rules"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("routing_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-rules"] }),
  });

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="rule-name">Rule name</Label>
          <Input id="rule-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-type">Match on</Label>
          <select
            id="rule-type"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.match_type}
            onChange={(e) => setForm({ ...form, match_type: e.target.value })}
          >
            {MATCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-value">Value</Label>
          <Input
            id="rule-value"
            value={form.match_value}
            onChange={(e) => setForm({ ...form, match_value: e.target.value })}
            placeholder="referral"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-dept">Department</Label>
          <select
            id="rule-dept"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          >
            <option value="">Unassigned</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending}>
            Add rule
          </Button>
        </div>
      </form>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {(list.data ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{r.name}</span>
            <Badge variant="outline">
              {r.match_type}: {r.match_value}
            </Badge>
            <span className="text-xs text-muted-foreground">
              → {(departments.data ?? []).find((d) => d.id === r.department_id)?.name ?? "Unassigned"} · priority{" "}
              {r.priority}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update.mutate({ id: r.id, patch: { status: r.status === "active" ? "inactive" : "active" } })
                }
              >
                {r.status === "active" ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => remove.mutate(r.id)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
        {(list.data ?? []).length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">No routing rules yet.</li>
        ) : null}
      </ul>
    </div>
  );
}

function Templates() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const orgId = session.data?.organizationId ?? null;
  const [form, setForm] = useState({ name: "", shortcut: "", category: "", body: "" });

  const list = useQuery({
    queryKey: ["response-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("response_templates").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.name.trim() || !form.body.trim()) return;
      const { error } = await supabase.from("response_templates").insert({
        organization_id: orgId,
        name: form.name.trim(),
        shortcut: form.shortcut.trim() || null,
        category: form.category.trim() || null,
        body: form.body.trim(),
        language: "en",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ name: "", shortcut: "", category: "", body: "" });
      queryClient.invalidateQueries({ queryKey: ["response-templates"] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database["public"]["Tables"]["response_templates"]["Update"] }) => {
      const { error } = await supabase.from("response_templates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["response-templates"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("response_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["response-templates"] }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <form
        className="space-y-3 rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">New template</h2>
        <div className="space-y-2">
          <Label htmlFor="tpl-name">Name</Label>
          <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="tpl-shortcut">Shortcut</Label>
            <Input
              id="tpl-shortcut"
              value={form.shortcut}
              onChange={(e) => setForm({ ...form, shortcut: e.target.value })}
              placeholder="/hours"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-category">Category</Label>
            <Input
              id="tpl-category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Greeting"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-body">Message</Label>
          <Textarea
            id="tpl-body"
            rows={5}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Save template
        </Button>
      </form>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {(list.data ?? []).map((t) => (
          <li key={t.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t.name}</span>
              {t.shortcut ? <Badge variant="outline">{t.shortcut}</Badge> : null}
              {t.category ? <Badge variant="secondary">{t.category}</Badge> : null}
              <Badge variant={t.approved ? "default" : "outline"}>
                {t.approved ? "Approved" : "Pending approval"}
              </Badge>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update.mutate({ id: t.id, patch: { approved: !t.approved } })}
                >
                  {t.approved ? "Unapprove" : "Approve"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => remove.mutate(t.id)}>
                  Delete
                </Button>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
          </li>
        ))}
        {(list.data ?? []).length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">No templates yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
