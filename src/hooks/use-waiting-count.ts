import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyQueueFilter } from "@/lib/conversation-status";

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
      // One shared definition of "waiting for a human" — see QUEUE_PREDICATE.
      const { count, error } = await applyQueueFilter(
        supabase.from("conversations").select("id", { count: "exact", head: true }),
      );
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    // Busy tenants can emit many conversation changes per second. Coalescing
    // them into one refresh keeps the badge current without hammering the
    // database with a count query per event.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`waiting-count-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          queryClient.invalidateQueries({ queryKey: ["waiting-conversations-count"] });
        }, 5_000);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { count: query.data ?? 0, ...query };
}
