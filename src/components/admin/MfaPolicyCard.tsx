import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const ADMIN_ROLES = ["administrator", "super_admin"];

/** Organization-wide MFA enforcement, editable by administrators. */
export function MfaPolicyCard() {
  const queryClient = useQueryClient();

  const policy = useQuery({
    queryKey: ["mfa-policy"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id, role")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!membership) return null;

      const { data: org, error } = await supabase
        .from("organizations")
        .select("id, name, require_mfa, require_mfa_for_admins")
        .eq("id", membership.organization_id)
        .maybeSingle();
      if (error) throw error;
      return org ? { org, canEdit: ADMIN_ROLES.includes(membership.role as string) } : null;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: { require_mfa?: boolean; require_mfa_for_admins?: boolean }) => {
      const orgId = policy.data?.org.id;
      if (!orgId) throw new Error("No organization");
      const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
      if (error) throw error;
      await logAudit({
        action: "security.mfa_policy_updated",
        recordType: "organization",
        recordId: orgId,
        metadata: patch,
      });
    },
    onSuccess: () => {
      toast.success("Two-step verification policy updated");
      queryClient.invalidateQueries({ queryKey: ["mfa-policy"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update policy"),
  });

  if (!policy.data) return null;
  const { org, canEdit } = policy.data;

  return (
    <section className="h-fit rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Organization MFA policy</h2>
        <Badge variant={org.require_mfa ? "default" : "outline"}>
          {org.require_mfa ? "Enforced for everyone" : org.require_mfa_for_admins ? "Admins only" : "Optional"}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Staff in {org.name} who fall under enforcement must complete an authenticator code before the
        console loads. Existing sessions are stepped up on their next page load.
      </p>

      <div className="mt-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="require-mfa-all">Require for all staff</Label>
            <p className="text-xs text-muted-foreground">Agents, leads, managers and administrators.</p>
          </div>
          <Switch
            id="require-mfa-all"
            checked={!!org.require_mfa}
            disabled={!canEdit || update.isPending}
            onCheckedChange={(v) => update.mutate({ require_mfa: v })}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="require-mfa-admins">Require for administrators</Label>
            <p className="text-xs text-muted-foreground">
              Accounts that can manage staff, tenants and billing.
            </p>
          </div>
          <Switch
            id="require-mfa-admins"
            checked={!!org.require_mfa_for_admins}
            disabled={!canEdit || update.isPending}
            onCheckedChange={(v) => update.mutate({ require_mfa_for_admins: v })}
          />
        </div>
      </div>

      {!canEdit ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Only administrators can change this policy.
        </p>
      ) : null}
    </section>
  );
}
