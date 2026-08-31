import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { showDesktopNotification } from "@/lib/desktop-push";
import { toast } from "sonner";

export type NotificationRow = {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** Short two-tone chime so agents hear a chat landing in their queue. */
function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1174].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio is best-effort — never block the alert */
  }
}

/**
 * Live notification feed for the signed-in staff member.
 * Pass `{ alerts: true }` on exactly one mounted instance (the shell bell) to
 * also announce brand-new notifications with a toast and a chime.
 */
export function useNotifications(options: { alerts?: boolean } = {}) {
  const queryClient = useQueryClient();
  const alerts = options.alerts ?? false;
  const seen = useRef<Set<string> | null>(null);

  const query = useQuery({
    queryKey: ["notifications"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [] as NotificationRow[];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, severity, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  useEffect(() => {
    // Unique per hook instance: the bell and the notifications page both subscribe.
    const channel = supabase
      .channel(`notifications-feed-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const rows = query.data;
  useEffect(() => {
    if (!alerts || !rows) return;
    // First load only records what already exists — no retro-alerts.
    if (seen.current === null) {
      seen.current = new Set(rows.map((n) => n.id));
      return;
    }
    const fresh = rows.filter((n) => !n.read_at && !seen.current!.has(n.id));
    rows.forEach((n) => seen.current!.add(n.id));
    if (!fresh.length) return;
    playChime();
    fresh.slice(0, 3).forEach((n) => {
      const show = n.severity === "critical" ? toast.error : n.severity === "warning" ? toast.warning : toast.info;
      show(n.title, { description: n.body ?? undefined, duration: 8000 });
    });
  }, [rows, alerts]);



  const unread = (query.data ?? []).filter((n) => !n.read_at);

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return { ...query, notifications: query.data ?? [], unread, markRead };
}
