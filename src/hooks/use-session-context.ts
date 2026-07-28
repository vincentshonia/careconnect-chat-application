import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

const RANK: Record<AppRole, number> = {
  agent: 1,
  team_lead: 2,
  manager: 3,
  administrator: 4,
  super_admin: 5,
};

/** Current staff member: profile, organization, and effective role rank. */
export function useSessionContext() {
  return useQuery({
    queryKey: ["session-context"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Not signed in");

      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const rank = roleList.reduce((max, r) => Math.max(max, RANK[r] ?? 0), 0);

      return {
        userId,
        email: auth.user?.email ?? null,
        profile: profile ?? null,
        organizationId: profile?.organization_id ?? null,
        roles: roleList,
        rank,
        isAdmin: rank >= 4,
      };
    },
  });
}

export const ROLE_RANK = RANK;
