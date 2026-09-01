import { createFileRoute } from "@tanstack/react-router";

/** Visitor polls for new agent/AI messages in their own conversation. */
export const Route = createFileRoute("/api/public/chat/poll")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const conversationId = url.searchParams.get("c") ?? "";
        const session = url.searchParams.get("s") ?? "";
        const since = url.searchParams.get("since");
        const mod = await import("@/lib/public-chat.server");
        try {
          const ctx = await mod.sessionContext(session, url.searchParams.get("h"));
          const conversation = await mod.conversationForSession(ctx, conversationId);
          const db = mod.admin();

          let query = db
            .from("messages")
            .select("id, sender_type, sender_name, body, created_at, metadata")
            .eq("conversation_id", conversation.id)
            .neq("sender_type", "system")
            .order("created_at")
            .limit(100);
          if (since) query = query.gt("created_at", since);
          const { data: messages } = await query;

          let agentName: string | null = null;
          let agentAvatarUrl: string | null = null;
          if (conversation.assigned_to) {
            const { data: agent } = await db
              .from("profiles")
              .select("full_name, display_name, avatar_url")
              .eq("id", conversation.assigned_to)
              .maybeSingle();
            agentName = agent?.display_name ?? agent?.full_name ?? null;
            agentAvatarUrl = agent?.avatar_url ?? null;
          }

          return Response.json(
            {
              status: conversation.status,
              connected: Boolean(conversation.assigned_to),
              agentName,
              agentAvatarUrl,
              messages: messages ?? [],
            },
            { headers: { "Cache-Control": "no-store" } },
          );

        } catch (error) {
          const status = error instanceof mod.PublicChatError ? error.status : 500;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected error" },
            { status },
          );
        }
      },
    },
  },
});
