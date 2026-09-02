import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * How many conversations are still waiting for a human to pick them up.
 * Visible to the caller through RLS, so the number always matches what the
 * signed-in staff member can actually claim.
 */
export function useWaitingCount() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["waiting-conversations-count"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        // Same vocabulary as the database's claimable_conversation_statuses().
        .in("status", ["new", "waiting", "escalated", "follow_up"])

        .is("assigned_to", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`waiting-count-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["waiting-conversations-count"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { count: query.data ?? 0, ...query };
}
