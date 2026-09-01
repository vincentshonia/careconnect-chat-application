import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  ROLE_RANK,
  permissionsFor,
  type OrgRole,
  type Permission,
  type PlatformRole,
} from "@/lib/permissions";
import { DEFAULT_TIMEZONE, safeTimeZone } from "@/lib/org-time";

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Current staff member: profile, organization membership, effective role and
 * resolved permissions. The membership record — not `user_roles` — is the
 * authoritative source of the tenant role.
 */
export function useSessionContext() {
  return useQuery({
    queryKey: ["session-context"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Not signed in");

      const [{ data: profile }, { data: membership }, { data: platformRoleData }] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
          supabase
            .from("organization_memberships")
            .select("organization_id, role, status")
            .eq("user_id", userId)
            .eq("status", "active")
            .order("created_at")
            .limit(1)
            .maybeSingle(),
          supabase.rpc("platform_role_of", { _user: userId }),
        ]);

      const role = (membership?.role ?? null) as OrgRole | null;
      const platformRole = (platformRoleData ?? null) as PlatformRole | null;
      const permissions = permissionsFor(role, platformRole);
      const organizationId = membership?.organization_id ?? profile?.organization_id ?? null;

      let departmentIds: string[] = [];
      if (organizationId) {
        const { data: depts } = await supabase
          .from("department_members")
          .select("department_id")
          .eq("user_id", userId);
        departmentIds = (depts ?? []).map((d) => d.department_id);
      }

      // The tenant timezone drives every "today / this week" calculation.
      let timezone = DEFAULT_TIMEZONE;
      if (organizationId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("timezone")
          .eq("id", organizationId)
          .maybeSingle();
        timezone = safeTimeZone(org?.timezone);
      }

      const rank = role ? ROLE_RANK[role] : 0;

      return {
        userId,
        email: auth.user?.email ?? null,
        profile: profile ?? null,
        organizationId,
        timezone,
        role,
        roles: role ? [role as AppRole] : [],
        platformRole,
        isPlatformAdmin: permissions.has("platform.tenant_admin"),
        departmentIds,
        rank,
        permissions,
        can: (permission: Permission | string) => permissions.has(permission),
        isAdmin: rank >= 4 || permissions.has("platform.tenant_admin"),
      };
    },
  });
}

/** Convenience hook: `usePermission("staff.create")`. */
export function usePermission(permission: Permission | string) {
  const session = useSessionContext();
  return {
    allowed: session.data?.permissions.has(permission) ?? false,
    loading: session.isLoading,
  };
}

export { ROLE_RANK };
