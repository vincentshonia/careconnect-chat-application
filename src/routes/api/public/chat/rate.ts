import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  session: z.string().min(20).max(4000),
  host: z.string().max(300).nullable().optional(),
  conversationId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(600).optional().nullable(),
});

export const Route = createFileRoute("/api/public/chat/rate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mod = await import("@/lib/public-chat.server");
        try {
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
          await mod.enforceRateLimit(`rate:ip:${mod.clientIp(request)}`, 20, 60);

          const ctx = await mod.sessionContext(parsed.data.session, parsed.data.host ?? null);
          const conversation = await mod.conversationForSession(ctx, parsed.data.conversationId);
          const db = mod.admin();

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
              body:
                parsed.data.comment ||
                `Conversation ${conversation.reference} was rated ${parsed.data.score}/5.`,
              link: "/quality",
              recordType: "conversations",
              recordId: conversation.id,
            });
          }

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
