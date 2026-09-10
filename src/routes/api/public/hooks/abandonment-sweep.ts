import { createFileRoute } from "@tanstack/react-router";

/** Hard cap per run, so a backlog can never make one call run long. */
const MAX_CANDIDATES = 200;
/** Above this, the run is slow enough to be worth a log line. */
const SLOW_RUN_MS = 4000;

/**
 * Hourly sweep: a chat where nobody ever asked for a person, still sitting in
 * its opening state with no activity for 24 hours, is closed as "abandoned" so
 * it stops inflating the open backlog. Abandoned chats are excluded from the
 * completed and AI-contained figures in reports.
 *
 * Chats that never received a message at all (no last_message_at) are swept on
 * the same 24-hour rule, measured from when they were created.
 */
export const Route = createFileRoute("/api/public/hooks/abandonment-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const provided = request.headers.get("x-careconnect-secret") ?? "";
        const { admin } = await import("@/lib/public-chat.server");
        const db = admin();

        const { data: tokenRow } = await db
          .from("internal_tokens")
          .select("token")
          .eq("name", "abandonment_sweep")
          .maybeSingle();
        const accepted = [tokenRow?.token, process.env.INTERNAL_WEBHOOK_SECRET].filter(
          (v): v is string => typeof v === "string" && v.length > 0,
        );
        const authorized = accepted.some(
          (secret) => provided.length === secret.length && provided === secret,
        );
        if (!authorized) return new Response("Unauthorized", { status: 401 });

        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: stale, error } = await db
          .from("conversations")
          .select("id, organization_id")
          .eq("escalation_requested", false)
          .eq("status", "new")
          // Idle for 24h, or never had a message and was created over 24h ago.
          .or(`last_message_at.lt.${cutoff},and(last_message_at.is.null,created_at.lt.${cutoff})`)
          .order("created_at", { ascending: true })
          .limit(MAX_CANDIDATES);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rows = (stale ?? []) as { id: string; organization_id: string }[];
        let abandoned = 0;

        if (rows.length > 0) {
          const now = new Date().toISOString();
          // One guarded update for the whole batch instead of a query per row.
          const { data: updated, error: updateError } = await db
            .from("conversations")
            .update({ status: "abandoned", closed_at: now, updated_at: now })
            .in(
              "id",
              rows.map((row) => row.id),
            )
            .eq("status", "new")
            .eq("escalation_requested", false)
            .select("id, organization_id");
          if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

          const changed = (updated ?? []) as { id: string; organization_id: string }[];
          abandoned = changed.length;

          if (changed.length > 0) {
            const { error: eventError } = await db.from("conversation_events").insert(
              changed.map((row) => ({
                conversation_id: row.id,
                organization_id: row.organization_id,
                event_type: "auto_abandoned",
                detail:
                  "Closed automatically after 24 hours with no activity and no request for a person.",
                previous_value: "new",
                new_value: "abandoned",
              })),
            );
            if (eventError) console.warn("[abandonment-sweep] event insert failed", eventError);
          }
        }

        const durationMs = Date.now() - startedAt;
        if (durationMs > SLOW_RUN_MS) {
          console.warn(
            `[abandonment-sweep] slow run: ${durationMs}ms for ${rows.length} candidates, ${abandoned} abandoned`,
          );
        }

        return Response.json({ processed: rows.length, abandoned, durationMs });
      },
    },
  },
});
