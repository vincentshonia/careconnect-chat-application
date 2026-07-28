import { createFileRoute } from "@tanstack/react-router";

/** Visitor polls for new agent/AI messages in their own conversation. */
export const Route = createFileRoute("/api/public/chat/poll")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const conversationId = url.searchParams.get("c") ?? "";
        const sessionToken = url.searchParams.get("s") ?? "";
        const since = url.searchParams.get("since");
        const mod = await import("@/lib/public-chat.server");
        if (!/^[0-9a-f-]{36}$/i.test(conversationId) || sessionToken.length < 8) {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
        const db = mod.admin();
        const { data: visitor } = await db
          .from("visitors")
          .select("id")
          .eq("session_token", sessionToken)
          .maybeSingle();
        if (!visitor) return Response.json({ error: "Session not found" }, { status: 403 });

        const { data: conversation } = await db
          .from("conversations")
          .select("id, status, assigned_to, escalation_requested")
          .eq("id", conversationId)
          .eq("visitor_id", visitor.id)
          .maybeSingle();
        if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });

        let query = db
          .from("messages")
          .select("id, sender_type, sender_name, body, created_at, metadata")
          .eq("conversation_id", conversationId)
          .neq("sender_type", "system")
          .order("created_at")
          .limit(100);
        if (since) query = query.gt("created_at", since);
        const { data: messages } = await query;

        let agentName: string | null = null;
        if (conversation.assigned_to) {
          const { data: agent } = await db
            .from("profiles")
            .select("full_name")
            .eq("id", conversation.assigned_to)
            .maybeSingle();
          agentName = agent?.full_name ?? null;
        }

        return Response.json(
          {
            status: conversation.status,
            connected: Boolean(conversation.assigned_to),
            agentName,
            messages: messages ?? [],
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
