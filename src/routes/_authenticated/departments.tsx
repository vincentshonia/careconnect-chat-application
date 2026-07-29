import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useSessionContext } from "@/hooks/use-session-context";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/departments")({
  head: () => ({
    meta: [
      { title: "Departments & Hours — Pacific Health Group Support Console" },
      { name: "description", content: "Manage support departments, coverage hours and holidays." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DepartmentsPage,
});

type Department = Database["public"]["Tables"]["departments"]["Row"];
type BusinessHour = Database["public"]["Tables"]["business_hours"]["Row"];
type Holiday = Database["public"]["Tables"]["holidays"]["Row"];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function DepartmentsPage() {
  return (
    <AdminShell
      title="Departments & hours"
      description="Routing targets, coverage windows and closures used by the widget and escalation flow."
    >
      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="hours">Business hours</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>
        <TabsContent value="departments" className="mt-4">
          <DepartmentsTab />
        </TabsContent>
        <TabsContent value="hours" className="mt-4">
          <HoursTab />
        </TabsContent>
        <TabsContent value="holidays" className="mt-4">
          <HolidaysTab />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function DepartmentsTab() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const orgId = session.data?.organizationId ?? null;
  const [name, setName] = useState("");

  const list = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });

  const members = useQuery({
    queryKey: ["department-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("department_id, user_id, profiles:profiles!department_members_user_id_fkey(full_name)");
      if (error) return [] as Array<{ department_id: string; user_id: string }>;
      return (data ?? []) as Array<{ department_id: string; user_id: string }>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !name.trim()) return;
      const { error } = await supabase.from("departments").insert({
        organization_id: orgId,
        name: name.trim(),
        routing_method: "first_available",
        timezone: "America/Los_Angeles",
      });
      if (error) throw error;
      await logAudit({ action: "department.created", recordType: "departments", newValue: { name: name.trim() } });
    },
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database["public"]["Tables"]["departments"]["Update"] }) => {
      const { data, error } = await supabase.from("departments").update(patch).eq("id", id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You do not have permission to update departments.");
      await logAudit({ action: "department.updated", recordType: "departments", recordId: id, newValue: patch as Record<string, unknown> });
      return patch;
    },
    onSuccess: (patch) => {
      if (patch?.routing_method) toast.success(`Routing set to ${String(patch.routing_method).replace(/_/g, " ")}`);
      else if (patch?.status) toast.success(`Department ${patch.status === "active" ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update that department"),
  });

  const setDefault = useMutation({
    mutationFn: async (dept: Department) => {
      if (!orgId) throw new Error("Missing organization");
      const { error: clearError } = await supabase
        .from("departments")
        .update({ is_default: false })
        .eq("organization_id", orgId)
        .neq("id", dept.id);
      if (clearError) throw clearError;
      const { data, error } = await supabase
        .from("departments")
        .update({ is_default: true })
        .eq("id", dept.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You do not have permission to change the default department.");
      await logAudit({
        action: "department.default_changed",
        recordType: "departments",
        recordId: dept.id,
        newValue: { name: dept.name, is_default: true },
      });
    },
    onSuccess: (_d, dept) => {
      toast.success(`${dept.name} is now the default department`);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not set the default department"),
  });


  const remove = useMutation({
    mutationFn: async (dept: Department) => {
      const { error } = await supabase.from("departments").delete().eq("id", dept.id);
      if (error) throw error;
      await logAudit({
        action: "department.deleted",
        recordType: "departments",
        recordId: dept.id,
        previousValue: { name: dept.name, routing_method: dept.routing_method },
      });
    },
    onSuccess: (_data, dept) => {
      toast.success(`${dept.name} deleted`);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["department-members"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not delete that department"),
  });

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="dept-name">New department</Label>
          <Input
            id="dept-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Enrollment Support"
            className="w-72"
          />
        </div>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          Add department
        </Button>
      </form>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {(list.data ?? []).map((d) => {
          const count = (members.data ?? []).filter((m) => m.department_id === d.id).length;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {d.routing_method.replace(/_/g, " ")} · {count} member{count === 1 ? "" : "s"} · {d.timezone}
                </p>
              </div>
              {d.is_default ? <Badge>Default</Badge> : null}
              <Badge variant="outline">{d.status}</Badge>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update.mutate({
                      id: d.id,
                      patch: {
                        routing_method: d.routing_method === "round_robin" ? "first_available" : "round_robin",
                      },
                    })
                  }
                >
                  Switch routing
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update.mutate({
                      id: d.id,
                      patch: { status: d.status === "active" ? "inactive" : "active" },
                    })
                  }
                >
                  {d.status === "active" ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={d.is_default || remove.isPending}
                  title={
                    d.is_default
                      ? "The default department cannot be deleted"
                      : "Delete this department"
                  }
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Delete “${d.name}”? Team memberships and coverage hours for this department are removed. Conversations, intakes and routing rules are kept but will no longer point to a department.`,
                    );
                    if (confirmed) remove.mutate(d);
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HoursTab() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const orgId = session.data?.organizationId ?? null;

  const hours = useQuery({
    queryKey: ["business-hours"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_hours").select("*").order("day_of_week");
      if (error) throw error;
      return (data ?? []) as BusinessHour[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (row: { day: number; open: string; close: string; closed: boolean; id?: string }) => {
      if (!orgId) return;
      if (row.id) {
        const { error } = await supabase
          .from("business_hours")
          .update({ open_time: row.open, close_time: row.close, is_closed: row.closed })
          .eq("id", row.id);
        if (error) throw error;
        await logAudit({
          action: "business_hours.updated",
          recordType: "business_hours",
          recordId: row.id,
          newValue: { day_of_week: row.day, open_time: row.open, close_time: row.close, is_closed: row.closed },
        });
      } else {
        const { error } = await supabase.from("business_hours").insert({
          organization_id: orgId,
          day_of_week: row.day,
          open_time: row.open,
          close_time: row.close,
          is_closed: row.closed,
        });
        if (error) throw error;
        await logAudit({
          action: "business_hours.created",
          recordType: "business_hours",
          newValue: { day_of_week: row.day, open_time: row.open, close_time: row.close, is_closed: row.closed },
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-hours"] }),
  });

  return (
    <div className="rounded-xl border border-border">
      <ul className="divide-y divide-border">
        {DAYS.map((label, day) => {
          const row = (hours.data ?? []).find((h) => h.day_of_week === day);
          return (
            <li key={label} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-28 text-sm font-medium">{label}</span>
              <Input
                type="time"
                defaultValue={(row?.open_time ?? "09:00:00").slice(0, 5)}
                className="w-32"
                onBlur={(e) =>
                  upsert.mutate({
                    id: row?.id,
                    day,
                    open: e.target.value,
                    close: (row?.close_time ?? "17:00:00").slice(0, 5),
                    closed: row?.is_closed ?? false,
                  })
                }
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="time"
                defaultValue={(row?.close_time ?? "17:00:00").slice(0, 5)}
                className="w-32"
                onBlur={(e) =>
                  upsert.mutate({
                    id: row?.id,
                    day,
                    open: (row?.open_time ?? "09:00:00").slice(0, 5),
                    close: e.target.value,
                    closed: row?.is_closed ?? false,
                  })
                }
              />
              <Button
                size="sm"
                variant={row?.is_closed ? "default" : "outline"}
                onClick={() =>
                  upsert.mutate({
                    id: row?.id,
                    day,
                    open: (row?.open_time ?? "09:00:00").slice(0, 5),
                    close: (row?.close_time ?? "17:00:00").slice(0, 5),
                    closed: !(row?.is_closed ?? false),
                  })
                }
              >
                {row?.is_closed ? "Closed" : "Open"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HolidaysTab() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const orgId = session.data?.organizationId ?? null;
  const [form, setForm] = useState({ name: "", date: "" });

  const list = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await supabase.from("holidays").select("*").order("holiday_date");
      if (error) throw error;
      return (data ?? []) as Holiday[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.name.trim() || !form.date) return;
      const { error } = await supabase
        .from("holidays")
        .insert({ organization_id: orgId, name: form.name.trim(), holiday_date: form.date });
      if (error) throw error;
      await logAudit({ action: "holiday.created", recordType: "holidays", newValue: { name: form.name.trim(), date: form.date } });
    },
    onSuccess: () => {
      setForm({ name: "", date: "" });
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holidays").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ action: "holiday.deleted", recordType: "holidays", recordId: id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["holidays"] }),
  });

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="holiday-name">Holiday</Label>
          <Input
            id="holiday-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Thanksgiving"
            className="w-64"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="holiday-date">Date</Label>
          <Input
            id="holiday-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-48"
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Add closure
        </Button>
      </form>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {(list.data ?? []).map((h) => (
          <li key={h.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{h.name}</span>
            <span className="text-muted-foreground">{h.holiday_date}</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => remove.mutate(h.id)}>
              Remove
            </Button>
          </li>
        ))}
        {(list.data ?? []).length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">No closures configured.</li>
        ) : null}
      </ul>
    </div>
  );
}
