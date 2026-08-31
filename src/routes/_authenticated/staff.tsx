import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { createStaffFn, setStaffAccessFn } from "@/lib/staff.functions";
import { InvitationsCard } from "@/components/admin/InvitationsCard";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useSessionContext, ROLE_RANK, type AppRole } from "@/hooks/use-session-context";
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
  const callerRank = session.data?.rank ?? 0;
  const createStaff = useServerFn(createStaffFn);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    role: "agent" as AppRole,
    title: "",
    phone: "",
  });
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    tempPassword: string;
    emailed: boolean;
    emailError: string | null;
  } | null>(null);

  const addStaff = useMutation({
    mutationFn: async () =>
      createStaff({
        data: {
          fullName: form.fullName,
          email: form.email,
          role: form.role,
          title: form.title || null,
          phone: form.phone || null,
        },
      }),
    onSuccess: (result) => {
      setCreatedCredentials({
        email: result.email,
        tempPassword: result.tempPassword,
        emailed: result.emailed,
        emailError: result.emailError,
      });

      setForm({ fullName: "", email: "", role: "agent", title: "", phone: "" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });



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

  const changeAccess = useServerFn(setStaffAccessFn);
  const setAccess = useMutation({
    mutationFn: async (input: { userId: string; action: "disable" | "enable" | "remove" }) =>
      changeAccess({ data: input }),
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
      ) : (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Add a staff member</h2>
              <p className="text-xs text-muted-foreground">
                Creates the account immediately with a one-time temporary password you share with them.
              </p>
            </div>
            <Button type="button" variant={showForm ? "outline" : "default"} onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "Add staff member"}
            </Button>
          </div>

          {showForm ? (
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                addStaff.mutate();
              }}
            >
              <div className="space-y-1">
                <Label className="text-xs">Full name</Label>
                <Input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Maria Lopez"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Work email</Label>
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="maria@pacifichealthgroup.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}
                >
                  {ROLES.filter((r) => ROLE_RANK[r] <= callerRank).map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Job title (optional)</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Enrollment specialist"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone (optional)</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 010-2233"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={addStaff.isPending}>
                  {addStaff.isPending ? "Creating…" : "Create account"}
                </Button>
              </div>
              {addStaff.error ? (
                <p className="text-sm text-destructive sm:col-span-2 lg:col-span-3">
                  {(addStaff.error as Error).message}
                </p>
              ) : null}
            </form>
          ) : null}

          {createdCredentials ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium">Account created — share these details once</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Email: <span className="font-mono">{createdCredentials.email}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Temporary password:{" "}
                <span className="font-mono">{createdCredentials.tempPassword}</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                This password will not be shown again. Ask them to sign in at /auth and change it from Security.
              </p>
              <p className="mt-2 text-xs">
                {createdCredentials.emailed
                  ? "A welcome email with these details was sent to them."
                  : `Welcome email not sent${createdCredentials.emailError ? ` — ${createdCredentials.emailError}` : ""}. Share the password directly.`}
              </p>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setCreatedCredentials(null)}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {isAdmin ? <InvitationsCard callerRank={callerRank} /> : null}

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
                      {p.status !== "active" ? (
                        <Badge variant="destructive" className="capitalize">
                          {p.status === "archived" ? "removed" : p.status}
                        </Badge>
                      ) : null}

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

                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Departments — click to add or remove this teammate
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(data?.departments ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No departments yet — create one under Departments &amp; hours.
                      </p>
                    ) : null}
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
                          disabled={!isAdmin || toggleDepartment.isPending}
                          onClick={() =>
                            toggleDepartment.mutate({
                              userId: p.id,
                              departmentId: d.id,
                              member: member ?? undefined,
                            })
                          }
                        >
                          <span className="mr-1">{member ? "✓" : "+"}</span>
                          {d.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {isAdmin && session.data?.userId !== p.id ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      Account access — history and past conversations are always kept.
                    </p>
                    <div className="ml-auto flex gap-2">
                      {p.status === "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={setAccess.isPending}
                          onClick={() => {
                            if (confirm(`Disable ${p.full_name || p.email}? They will not be able to sign in, but all their chat history stays.`))
                              setAccess.mutate({ userId: p.id, action: "disable" });
                          }}
                        >
                          Disable
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={setAccess.isPending}
                          onClick={() => setAccess.mutate({ userId: p.id, action: "enable" })}
                        >
                          Re-enable
                        </Button>
                      )}
                      {p.status !== "archived" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={setAccess.isPending}
                          onClick={() => {
                            if (confirm(`Remove ${p.full_name || p.email} from the team? Sign-in, roles and department routing are revoked. Conversations, messages and audit records are preserved.`))
                              setAccess.mutate({ userId: p.id, action: "remove" });
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

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
