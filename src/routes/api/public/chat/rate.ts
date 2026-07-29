import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  conversationId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(600).optional().nullable(),
});

export const Route = createFileRoute("/api/public/chat/rate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json());
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
        const { admin, clientIp, enforceRateLimit, PublicChatError } = await import(
          "@/lib/public-chat.server"
        );
        const db = admin();
        try {
          await enforceRateLimit(`rate:ip:${clientIp(request)}`, 20, 60);
        } catch (error) {
          if (error instanceof PublicChatError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }

        const { data: conversation } = await db
          .from("conversations")
          .select("id, organization_id, website_id, reference")
          .eq("id", parsed.data.conversationId)
          .maybeSingle();
        if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

        const { error } = await db.from("conversation_ratings").upsert(
          {
            organization_id: conversation.organization_id,
            website_id: conversation.website_id,
            conversation_id: conversation.id,
            score: parsed.data.score,
            comment: parsed.data.comment || null,
            source: "visitor",
          },
          { onConflict: "conversation_id" },
        );
        if (error) return Response.json({ error: "Could not save rating" }, { status: 500 });

        if (parsed.data.score <= 2) {
          const { notifyStaff } = await import("@/lib/notifications.server");
          await notifyStaff({
            organizationId: conversation.organization_id,
            type: "low_rating",
            severity: "warning",
            title: `Low satisfaction rating (${parsed.data.score}/5)`,
            body: parsed.data.comment || `Conversation ${conversation.reference} was rated ${parsed.data.score}/5.`,
            link: "/quality",
            recordType: "conversations",
            recordId: conversation.id,
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
