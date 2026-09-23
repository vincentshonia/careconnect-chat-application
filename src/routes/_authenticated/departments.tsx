import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  manageDepartmentFn,
  manageHolidayFn,
  saveBusinessHoursFn,
} from "@/lib/departments.functions";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useSessionContext } from "@/hooks/use-session-context";
import { PanelShell } from "@/components/admin/PanelShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  alertDeliveriesFn,
  ringCentralChatsFn,
  sendRingCentralTestFn,
  setDepartmentChatFn,
} from "@/lib/ringcentral.functions";

/** Searchable channel picker — the account can have dozens of RingCentral teams. */
function ChannelCombobox({
  label,
  value,
  chats,
  unlisted,
  onSelect,
}: {
  label: string;
  value: string | null;
  chats: Array<{ id: string; name: string }>;
  unlisted: Array<{ id: string; name: string }>;
  onSelect: (chatId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = chats.find((c) => c.id === value);
  const orphan = current ? null : (unlisted.find((c) => c.id === value) ?? null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={`RingCentral channel for ${label}`}
            className="w-56 justify-between font-normal"
          >
            <span className="truncate">
              {current?.name ??
                orphan?.name ??
                (value ? "Unknown channel" : "No RingCentral channel")}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search channels…" />
            <CommandList>
              <CommandEmpty>No channel found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="No RingCentral channel"
                  onSelect={() => {
                    setOpen(false);
                    onSelect(null);
                  }}
                >
                  No RingCentral channel
                </CommandItem>
                {chats.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => {
                      setOpen(false);
                      onSelect(c.id);
                    }}
                  >
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {orphan ? (
        <Badge variant="destructive" className="whitespace-normal text-left">
          Bot not a member — add PHG Alert Bot to this team
        </Badge>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/departments")({
  // Moved into the Admin hub. The old address still works so existing links,
  // notifications and the staff manuals keep resolving.
  beforeLoad: () => {
    throw redirect({ to: "/admin", search: { tab: "departments" } });
  },
});

type Department = Database["public"]["Tables"]["departments"]["Row"];
type BusinessHour = Database["public"]["Tables"]["business_hours"]["Row"];
type Holiday = Database["public"]["Tables"]["holidays"]["Row"];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function DepartmentsPanel() {
  return (
    <PanelShell
      title="Departments & hours"
      description="The default department receives all new visitor requests; staff can transfer. Coverage windows and closures are set here too."
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
    </PanelShell>
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
        .select(
          "department_id, user_id, profiles:profiles!department_members_user_id_fkey(full_name)",
        );
      if (error) return [] as Array<{ department_id: string; user_id: string }>;
      return (data ?? []) as Array<{ department_id: string; user_id: string }>;
    },
  });

  // RingCentral channels available for mapping, plus the connection status.
  const loadChats = useServerFn(ringCentralChatsFn);
  const ringCentral = useQuery({
    queryKey: ["ringcentral-chats"],
    staleTime: 5 * 60_000,
    queryFn: async () => await loadChats(),
  });

  const saveChat = useServerFn(setDepartmentChatFn);
  const mapChannel = useMutation({
    mutationFn: async (vars: { departmentId: string; chatId: string | null }) => {
      await saveChat({ data: vars });
    },
    onSuccess: () => {
      toast.success("RingCentral channel saved");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save that channel"),
  });

  const canManageIntegrations = Boolean(session.data?.permissions.has("integration.manage"));
  const loadDeliveries = useServerFn(alertDeliveriesFn);
  const deliveries = useQuery({
    queryKey: ["alert-deliveries"],
    enabled: canManageIntegrations,
    staleTime: 30_000,
    queryFn: async () => await loadDeliveries(),
  });
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    message: string;
  } | null>(null);
  const runTest = useServerFn(sendRingCentralTestFn);
  const sendTest = useMutation({
    mutationFn: async (departmentId: string) => {
      const result = await runTest({ data: { departmentId } });
      return { departmentId, ...result };
    },
    onSuccess: (result) => {
      setTestResult({ id: result.departmentId, ok: result.ok, message: result.message });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    },
    onError: (error: unknown, departmentId) => {
      const message = error instanceof Error ? error.message : "Could not send that test alert";
      setTestResult({ id: departmentId, ok: false, message });
      toast.error(message);
    },
  });

  // Department changes run server-side behind a permission check with audit rows.
  const saveDepartment = useServerFn(manageDepartmentFn);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !name.trim()) return;
      await saveDepartment({ data: { action: "create", name: name.trim() } });
    },
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not create that department"),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["departments"]["Update"];
    }) => {
      await saveDepartment({
        data: {
          action: "update",
          id,
          ...(patch.name !== undefined ? { name: String(patch.name) } : {}),
          ...(patch.routing_method !== undefined
            ? { routingMethod: patch.routing_method as "first_available" | "round_robin" }
            : {}),
          ...(patch.status !== undefined ? { status: patch.status as "active" | "inactive" } : {}),
        },
      });
      return patch;
    },
    onSuccess: (patch) => {
      if (patch?.routing_method)
        toast.success(`Routing set to ${String(patch.routing_method).replace(/_/g, " ")}`);
      else if (patch?.status)
        toast.success(`Department ${patch.status === "active" ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update that department"),
  });

  const setDefault = useMutation({
    mutationFn: async (dept: Department) => {
      if (!orgId) throw new Error("Missing organization");
      await saveDepartment({ data: { action: "set_default", id: dept.id } });
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
      await saveDepartment({ data: { action: "delete", id: dept.id } });
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

      {(() => {
        const fallback = (list.data ?? []).find((d) => d.is_default);
        if (!fallback) return null;
        const fallbackCount = (members.data ?? []).filter(
          (m) => m.department_id === fallback.id,
        ).length;
        if (fallbackCount > 0) return null;
        return (
          <div
            role="alert"
            className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            The default department “{fallback.name}” has no members. Conversations that fall back to
            it cannot be routed to anyone — add at least one team member.
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-4 py-3">
        <p className="text-sm font-medium">RingCentral Team Messaging</p>
        {ringCentral.isLoading ? (
          <Badge variant="outline">Checking…</Badge>
        ) : ringCentral.data?.connected ? (
          <Badge>Connected</Badge>
        ) : (
          <Badge variant="destructive">Not connected</Badge>
        )}
        <p className="text-xs text-muted-foreground">
          {ringCentral.data?.connected
            ? "Pick the channel each team should be alerted in when a visitor is waiting."
            : "Not connected — add RingCentral credentials in project secrets."}
        </p>
        <div className="flex w-full flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Alert bot</p>
          {ringCentral.data?.bot?.connected ? (
            <>
              <Badge>Connected</Badge>
              <p className="text-xs text-muted-foreground">
                Alerts post as {ringCentral.data.bot.name ?? "the CareConnect Alerts bot"}
                {ringCentral.data.bot.extensionId
                  ? ` (extension ${ringCentral.data.bot.extensionId})`
                  : ""}
                {ringCentral.data.bot.source === "dashboard"
                  ? " · dashboard token"
                  : ringCentral.data.bot.source === "oauth"
                    ? " · OAuth install"
                    : ""}
                {ringCentral.data.bot.lastPostAt
                  ? ` · last post ${new Date(ringCentral.data.bot.lastPostAt).toLocaleString()}`
                  : " · no posts yet"}
                . The bot must be added to each channel it posts into.
              </p>
            </>
          ) : (
            <>
              <Badge variant="outline">Not connected</Badge>
              <p className="text-xs text-muted-foreground">
                Install the CareConnect Alerts bot in RingCentral — until then alerts post from the
                connected staff account.
              </p>
            </>
          )}

          {canManageIntegrations ? (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs font-medium">Recent alert deliveries</p>
              {(deliveries.data ?? []).length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No alert attempts recorded yet.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {(deliveries.data ?? []).map((row) => (
                    <li key={row.id} className="text-xs text-muted-foreground">
                      <span className={row.ok ? "text-foreground" : "text-destructive"}>
                        {row.ok ? "Delivered" : "Failed"}
                      </span>{" "}
                      · {new Date(row.created_at).toLocaleString()} ·{" "}
                      {row.department_name ?? "Unknown team"} · channel {row.chat_id ?? "—"} · as{" "}
                      {row.identity ?? "—"} · HTTP {row.status_code ?? "—"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {(list.data ?? []).map((d) => {
          const count = (members.data ?? []).filter((m) => m.department_id === d.id).length;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {d.routing_method.replace(/_/g, " ")} · {count} member{count === 1 ? "" : "s"} ·{" "}
                  {d.timezone}
                </p>
              </div>
              {d.is_default ? <Badge>Default</Badge> : null}
              {count === 0 ? (
                <Badge variant="destructive">No members — routing will fail</Badge>
              ) : null}
              <Badge variant="outline">{d.status}</Badge>
              {ringCentral.data?.connected ? (
                <ChannelCombobox
                  label={d.name}
                  value={d.ringcentral_chat_id ?? null}
                  chats={ringCentral.data?.chats ?? []}
                  unlisted={ringCentral.data?.unlisted ?? []}
                  onSelect={(chatId) => mapChannel.mutate({ departmentId: d.id, chatId })}
                />
              ) : null}
              {ringCentral.data?.connected && canManageIntegrations ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!d.ringcentral_chat_id || sendTest.isPending}
                    title={
                      d.ringcentral_chat_id
                        ? "Post a test alert to this channel"
                        : "Map a channel first"
                    }
                    onClick={() => sendTest.mutate(d.id)}
                  >
                    Send test alert
                  </Button>
                  {testResult?.id === d.id ? (
                    <span
                      className={
                        testResult.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"
                      }
                    >
                      {testResult.message}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={d.is_default || setDefault.isPending}
                  title={
                    d.is_default
                      ? "Already the default department"
                      : "Make this the default department"
                  }
                  onClick={() => setDefault.mutate(d)}
                >
                  {d.is_default ? "Default" : "Make default"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      id: d.id,
                      patch: {
                        routing_method:
                          d.routing_method === "round_robin" ? "first_available" : "round_robin",
                      },
                    })
                  }
                >
                  Switch to {d.routing_method === "round_robin" ? "first available" : "round robin"}
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
      const { data, error } = await supabase
        .from("business_hours")
        .select("*")
        .order("day_of_week");
      if (error) throw error;
      return (data ?? []) as BusinessHour[];
    },
  });

  const saveHours = useServerFn(saveBusinessHoursFn);
  const upsert = useMutation({
    mutationFn: async (row: {
      day: number;
      open: string;
      close: string;
      closed: boolean;
      id?: string;
    }) => {
      if (!orgId) return;
      await saveHours({
        data: {
          ...(row.id ? { id: row.id } : {}),
          dayOfWeek: row.day,
          openTime: row.open,
          closeTime: row.close,
          isClosed: row.closed,
        },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-hours"] }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save those hours"),
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

  const saveHolidayFnCall = useServerFn(manageHolidayFn);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.name.trim() || !form.date) return;
      await saveHolidayFnCall({
        data: { action: "create", name: form.name.trim(), date: form.date },
      });
    },
    onSuccess: () => {
      setForm({ name: "", date: "" });
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not add that holiday"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await saveHolidayFnCall({ data: { action: "delete", id } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["holidays"] }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not remove that holiday"),
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
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => remove.mutate(h.id)}
            >
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
