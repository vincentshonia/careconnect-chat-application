import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useSessionContext, type AppRole } from "@/hooks/use-session-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "Staff & Roles — Pacific Health Group Support Console" },
      {
        name: "description",
        content: "Manage staff members, assign roles and departments, and set chat availability.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffPage,
});

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
const ROLES: AppRole[] = ["agent", "team_lead", "manager", "administrator", "super_admin"];
const PRESENCE = ["available", "busy", "away", "offline"];

function StaffPage() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const isAdmin = session.data?.isAdmin ?? false;

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [profiles, roles, departments, members] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("id, user_id, role, organization_id"),
        supabase.from("departments").select("id, name").order("name"),
        supabase.from("department_members").select("id, user_id, department_id"),
      ]);
      if (profiles.error) throw profiles.error;
      return {
        profiles: (profiles.data ?? []) as Profile[],
        roles: roles.data ?? [],
        departments: departments.data ?? [],
        members: members.data ?? [],
      };
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const orgId = session.data?.organizationId ?? null;
      const { error: delError } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delError) throw delError;
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role, organization_id: orgId });
      if (error) throw error;
      await logAudit({ action: "user_role.changed", recordType: "user_roles", recordId: userId, newValue: { role } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });

  const updateProfile = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["profiles"]["Update"];
    }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
      await logAudit({ action: "staff_profile.updated", recordType: "profiles", recordId: id, newValue: patch as Record<string, unknown> });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });

  const toggleDepartment = useMutation({
    mutationFn: async ({
      userId,
      departmentId,
      member,
    }: {
      userId: string;
      departmentId: string;
      member?: { id: string };
    }) => {
      if (member) {
        const { error } = await supabase.from("department_members").delete().eq("id", member.id);
        if (error) throw error;
        await logAudit({ action: "department_member.removed", recordType: "department_members", recordId: userId, previousValue: { departmentId } });
        return;
      }
      const { error } = await supabase.from("department_members").insert({
        user_id: userId,
        department_id: departmentId,
        organization_id: session.data?.organizationId ?? "",
      });
      if (error) throw error;
      await logAudit({ action: "department_member.added", recordType: "department_members", recordId: userId, newValue: { departmentId } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });

  const data = staffQuery.data;

  return (
    <AdminShell
      title="Staff & roles"
      description="Roles control what each teammate can change. Departments drive conversation routing."
    >
      {!isAdmin ? (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          You can view the team, but only administrators can change roles or departments.
        </p>
      ) : null}

      {staffQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading team…</p>
      ) : (
        <div className="space-y-3">
          {(data?.profiles ?? []).map((p) => {
            const role = (data?.roles ?? [])
              .filter((r) => r.user_id === p.id)
              .map((r) => r.role as AppRole)
              .sort((a, b) => ROLES.indexOf(b) - ROLES.indexOf(a))[0];
            return (
              <article key={p.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold">{p.full_name || "Unnamed staff member"}</h2>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="capitalize">
                        {(role ?? "no role").replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {p.presence}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Role</Label>
                      <select
                        disabled={!isAdmin}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                        value={role ?? ""}
                        onChange={(e) => setRole.mutate({ userId: p.id, role: e.target.value as AppRole })}
                      >
                        <option value="" disabled>
                          Select role
                        </option>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Presence</Label>
                      <select
                        disabled={!isAdmin && session.data?.userId !== p.id}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                        value={p.presence}
                        onChange={(e) =>
                          updateProfile.mutate({ id: p.id, patch: { presence: e.target.value } })
                        }
                      >
                        {PRESENCE.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max chats</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        disabled={!isAdmin && session.data?.userId !== p.id}
                        defaultValue={p.max_concurrent_chats}
                        onBlur={(e) =>
                          updateProfile.mutate({
                            id: p.id,
                            patch: { max_concurrent_chats: Number(e.target.value) || 1 },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(data?.departments ?? []).map((d) => {
                    const member = (data?.members ?? []).find(
                      (m) => m.user_id === p.id && m.department_id === d.id,
                    );
                    return (
                      <Button
                        key={d.id}
                        type="button"
                        size="sm"
                        variant={member ? "default" : "outline"}
                        disabled={!isAdmin}
                        onClick={() =>
                          toggleDepartment.mutate({
                            userId: p.id,
                            departmentId: d.id,
                            member: member ?? undefined,
                          })
                        }
                      >
                        {d.name}
                      </Button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {setRole.error ? (
        <p className="mt-4 text-sm text-destructive">{(setRole.error as Error).message}</p>
      ) : null}
    </AdminShell>
  );
}
