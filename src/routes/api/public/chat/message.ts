import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  session: z.string().min(20).max(4000),
  host: z.string().max(300).nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  text: z.string().trim().min(1).max(4000),
  menuOption: z.string().max(60).nullable().optional(),
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

          // Session is verified first: website + visitor come from the token,
          // never from client-supplied ids.
          const ctx = await mod.sessionContext(input.session, input.host ?? null);
          const limits = await mod.orgLimits(ctx.claims.org);

          await mod.enforceRateLimit(`msg:ip:${ip}`, limits.ip_requests_per_minute, 60);
          await mod.enforceRateLimit(
            `msg:s:${ctx.claims.sid}`,
            limits.session_ai_messages_per_minute,
            60,
          );

          if (input.text.length > limits.max_prompt_chars) {
            return Response.json({ error: "That message is too long." }, { status: 400 });
          }

          const website = ctx.website;
          const conversation = input.conversationId
            ? await mod.conversationForSession(ctx, input.conversationId)
            : await mod.ensureConversation(
                website,
                ctx.visitor,
                null,
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

          await mod.enforceAiBudget(ctx.claims.org, limits);

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

          await mod.recordUsage(ctx.claims.org, "ai_messages", 1);
          await mod.recordUsage(
            ctx.claims.org,
            "ai_tokens",
            Math.ceil((input.text.length + result.answer.length) / 4),
          );

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
            // Run the complete human hand-off: route to a department, alert the
            // team and expose the chat in the Waiting queue for claiming.
            const { handoffToHumans } = await import("@/lib/handoff.server");
            await handoffToHumans({
              conversationId: conversation.id,
              organizationId: website.organization_id,
              websiteId: website.id,
              departmentId: conversation.department_id ?? null,
              currentDepartmentId: conversation.department_id ?? null,
              matchValue: result.crisis ? "crisis" : "ai_escalation",
              reason: result.crisis
                ? "Crisis language detected — human assistance required"
                : "The assistant could not answer confidently",
              eventType: "ai_escalation",
            });
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
