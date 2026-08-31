import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  session: z.string().min(20).max(4000),
  host: z.string().max(300).nullable().optional(),
  conversationId: z.string().uuid(),
  aiResponseId: z.string().uuid(),
  helpful: z.boolean(),
});

export const Route = createFileRoute("/api/public/chat/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mod = await import("@/lib/public-chat.server");
        try {
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
          await mod.enforceRateLimit(`fb:ip:${mod.clientIp(request)}`, 30, 60);

          const ctx = await mod.sessionContext(parsed.data.session, parsed.data.host ?? null);
          const conversation = await mod.conversationForSession(ctx, parsed.data.conversationId);

          // The rated response must belong to this visitor's own conversation.
          const { error } = await mod
            .admin()
            .from("ai_responses")
            .update({ visitor_feedback: parsed.data.helpful ? "helpful" : "not_helpful" })
            .eq("id", parsed.data.aiResponseId)
            .eq("conversation_id", conversation.id);
          if (error) return Response.json({ error: "Could not save feedback" }, { status: 500 });

          return Response.json({ ok: true });
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
