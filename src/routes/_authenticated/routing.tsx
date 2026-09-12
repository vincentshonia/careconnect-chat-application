import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  manageRoutingRuleFn,
  manageResponseTemplateFn,
  manageDispositionFn,
} from "@/lib/routing-admin.functions";
import type { Database } from "@/integrations/supabase/types";
import { useSessionContext } from "@/hooks/use-session-context";
import { PanelShell } from "@/components/admin/PanelShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/routing")({
  // Moved into the Admin hub. The old address still works so existing links,
  // notifications and the staff manuals keep resolving.
  beforeLoad: () => {
    throw redirect({ to: "/admin", search: { tab: "routing" } });
  },
});

type Rule = Database["public"]["Tables"]["routing_rules"]["Row"];
type Template = Database["public"]["Tables"]["response_templates"]["Row"];

const MATCH_TYPES = ["interest", "keyword", "county", "menu_option", "language"];

export function RoutingPanel() {
  return (
    <PanelShell
      title="Routing & templates"
      description="Decide which department receives each escalation, and keep approved replies handy for agents."
    >
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Routing rules</TabsTrigger>
          <TabsTrigger value="templates">Response templates</TabsTrigger>
          <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-4">
          <Rules />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <Templates />
        </TabsContent>
        <TabsContent value="outcomes" className="mt-4">
          <Outcomes />
        </TabsContent>
      </Tabs>
    </PanelShell>
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

  // Routing changes are written server-side with a permission check and audit row.
  const saveRule = useServerFn(manageRoutingRuleFn);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.name.trim() || !form.match_value.trim()) return;
      await saveRule({
        data: {
          action: "create",
          name: form.name.trim(),
          matchType: form.match_type as
            | "interest"
            | "keyword"
            | "county"
            | "menu_option"
            | "language",
          matchValue: form.match_value.trim(),
          departmentId: form.department_id || null,
          priority: Number(form.priority) || 100,
        },
      });
    },
    onSuccess: () => {
      setForm({
        name: "",
        match_type: "interest",
        match_value: "",
        department_id: "",
        priority: 100,
      });
      queryClient.invalidateQueries({ queryKey: ["routing-rules"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save that routing rule"),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["routing_rules"]["Update"];
    }) => {
      await saveRule({
        data: {
          action: "update",
          id,
          ...(patch.priority !== undefined ? { priority: Number(patch.priority) } : {}),
          ...(patch.status !== undefined ? { status: patch.status as "active" | "inactive" } : {}),
          ...(patch.department_id !== undefined
            ? { departmentId: patch.department_id ?? null }
            : {}),
        },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-rules"] }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save that routing rule"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await saveRule({ data: { action: "delete", id } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-rules"] }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save that routing rule"),
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
          <Input
            id="rule-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
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
              →{" "}
              {(departments.data ?? []).find((d) => d.id === r.department_id)?.name ?? "Unassigned"}{" "}
              · priority {r.priority}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update.mutate({
                    id: r.id,
                    patch: { status: r.status === "active" ? "inactive" : "active" },
                  })
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

  const saveTemplate = useServerFn(manageResponseTemplateFn);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.name.trim() || !form.body.trim()) return;
      await saveTemplate({
        data: {
          action: "create",
          name: form.name.trim(),
          shortcut: form.shortcut.trim() || null,
          category: form.category.trim() || null,
          body: form.body.trim(),
        },
      });
    },
    onSuccess: () => {
      setForm({ name: "", shortcut: "", category: "", body: "" });
      queryClient.invalidateQueries({ queryKey: ["response-templates"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save that template"),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["response_templates"]["Update"];
    }) => {
      await saveTemplate({
        data: {
          action: "update",
          id,
          ...(patch.name !== undefined ? { name: String(patch.name) } : {}),
          ...(patch.shortcut !== undefined ? { shortcut: patch.shortcut ?? null } : {}),
          ...(patch.category !== undefined ? { category: patch.category ?? null } : {}),
          ...(patch.body !== undefined ? { body: String(patch.body) } : {}),
          ...(patch.approved !== undefined ? { approved: Boolean(patch.approved) } : {}),
        },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["response-templates"] }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save that template"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await saveTemplate({ data: { action: "delete", id } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["response-templates"] }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save that template"),
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
          <Input
            id="tpl-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
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

/**
 * Resolution outcomes agents pick when they close a chat. Keeping at least one
 * active outcome is what makes the Resolve dialog usable.
 */
function Outcomes() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const canManage = session.data?.permissions.has("workflow.manage") ?? false;
  const [label, setLabel] = useState("");
  const save = useServerFn(manageDispositionFn);

  const list = useQuery({
    queryKey: ["conversation-dispositions-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_dispositions")
        .select("id, label, is_active")
        .order("label");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutate = useMutation({
    mutationFn: async (input: {
      action: "create" | "rename" | "activate" | "deactivate";
      id?: string;
      label?: string;
    }) => {
      await save({ data: input });
    },
    onSuccess: () => {
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["conversation-dispositions-admin"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-dispositions"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save that outcome"),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These are the outcomes an agent chooses when resolving a chat. Deactivated outcomes stay on
        past chats but no longer appear in the Resolve dialog.
      </p>
      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">New outcome</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Callback scheduled"
              className="w-64"
            />
          </div>
          <Button
            type="button"
            disabled={!label.trim() || mutate.isPending}
            onClick={() => mutate.mutate({ action: "create", label: label.trim() })}
          >
            Add outcome
          </Button>
        </div>
      ) : null}
      {mutate.isError ? (
        <p className="text-sm text-destructive">
          {mutate.error instanceof Error ? mutate.error.message : "Could not save that outcome"}
        </p>
      ) : null}
      <div className="space-y-2">
        {(list.data ?? []).map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
          >
            <Input
              defaultValue={d.label}
              key={`${d.id}-${d.label}`}
              disabled={!canManage}
              className="w-64"
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== d.label)
                  mutate.mutate({ action: "rename", id: d.id, label: next });
              }}
            />
            <Badge variant={d.is_active ? "default" : "outline"}>
              {d.is_active ? "Active" : "Inactive"}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canManage || mutate.isPending}
              onClick={() =>
                mutate.mutate({ action: d.is_active ? "deactivate" : "activate", id: d.id })
              }
            >
              {d.is_active ? "Deactivate" : "Activate"}
            </Button>
          </div>
        ))}
        {list.data && list.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outcomes yet — add one above.</p>
        ) : null}
      </div>
    </div>
  );
}
