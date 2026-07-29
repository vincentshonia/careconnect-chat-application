import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  websiteId: z.string().uuid(),
  host: z.string().max(300).nullable().optional(),
  sessionToken: z.string().min(8).max(120),
  conversationId: z.string().uuid().nullable().optional(),
  text: z.string().trim().min(1).max(2000),
  menuOption: z.string().max(60).nullable().optional(),
  meta: z.record(z.any()).optional(),
});

export const Route = createFileRoute("/api/public/chat/message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mod = await import("@/lib/public-chat.server");
        const { AiGatewayError } = await import("@/lib/ai.server");
        try {
          const parsed = bodySchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }
          const input = parsed.data;
          const ip = mod.clientIp(request);
          await mod.enforceRateLimit(`msg:ip:${ip}`, 60, 60);
          await mod.enforceRateLimit(`msg:s:${input.sessionToken}`, 15, 60);
          const website = await mod.resolveWebsite(input.websiteId, input.host ?? null);
          const visitor = await mod.ensureVisitor(website, input.sessionToken, input.meta ?? {});
          const conversation = await mod.ensureConversation(
            website,
            visitor,
            input.conversationId ?? null,
            input.menuOption ? `${input.menuOption} enquiry` : undefined,
          );

          const visitorMessage = await mod.insertMessage(conversation, "visitor", input.text, "Visitor");

          // A live agent owns the conversation: don't answer with AI.
          if (conversation.escalation_requested || conversation.assigned_to) {
            return Response.json({
              conversationId: conversation.id,
              messageId: visitorMessage.id,
              liveAgent: true,
            });
          }

          const db = mod.admin();
          const { data: prior } = await db
            .from("messages")
            .select("id, sender_type, body")
            .eq("conversation_id", conversation.id)
            .order("created_at")
            .limit(20);
          const history = (prior ?? [])
            .filter((m: { id: string }) => m.id !== visitorMessage.id)
            .map((m: { sender_type: string; body: string }) => ({
              role: (m.sender_type === "visitor" ? "user" : "assistant") as "user" | "assistant",
              content: m.body,
            }));

          const result = await mod.answerQuestion({
            website,
            question: input.text,
            history,
            conversationId: conversation.id,
          });

          const aiMessage = await mod.insertMessage(
            conversation,
            "ai",
            result.answer,
            website.chatbot_name,
            { confidence: result.confidence, sources: result.sources },
          );
          const aiResponseId = await mod.recordAiResponse({
            website,
            conversationId: conversation.id,
            messageId: aiMessage.id,
            question: input.text,
            result,
          });

          if (result.escalate) {
            await db.from("conversations").update({ status: "waiting" }).eq("id", conversation.id);
          }

          return Response.json({
            conversationId: conversation.id,
            answer: result.answer,
            sources: result.sources,
            confidence: result.confidence,
            escalate: result.escalate,
            crisis: result.crisis,
            aiResponseId,
          });
        } catch (error) {
          if (error instanceof AiGatewayError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          if (error instanceof mod.PublicChatError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error("[chat/message]", error);
          return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
        }
      },
    },
  },
});
