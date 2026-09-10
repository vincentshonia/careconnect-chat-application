import { createFileRoute } from "@tanstack/react-router";

/**
 * Hourly sweep: a chat where nobody ever asked for a person, still sitting in
 * its opening state with no activity for 24 hours, is closed as "abandoned" so
 * it stops inflating the open backlog. Abandoned chats are excluded from the
 * completed and AI-contained figures in reports.
 */
export const Route = createFileRoute("/api/public/hooks/abandonment-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
          .lt("last_message_at", cutoff)
          .limit(500);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let abandoned = 0;
        for (const row of (stale ?? []) as { id: string; organization_id: string }[]) {
          const now = new Date().toISOString();
          const { error: updateError } = await db
            .from("conversations")
            .update({ status: "abandoned", closed_at: now, updated_at: now })
            .eq("id", row.id)
            .eq("status", "new")
            .eq("escalation_requested", false);
          if (updateError) continue;

          await db.from("conversation_events").insert({
            conversation_id: row.id,
            organization_id: row.organization_id,
            event_type: "auto_abandoned",
            detail: "Closed automatically after 24 hours with no activity and no request for a person.",
            previous_value: "new",
            new_value: "abandoned",
          });
          abandoned += 1;
        }

        return Response.json({ checked: (stale ?? []).length, abandoned });
      },
    },
  },
});
