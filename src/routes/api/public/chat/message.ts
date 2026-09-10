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

          // The insert may have reopened a finished chat. Re-read the row so a
          // reopen that went back to the human queue is not also answered by
          // the assistant.
          const dbEarly = mod.admin();
          const { data: refreshed } = await dbEarly
            .from("conversations")
            .select("status, escalation_requested, assigned_to")
            .eq("id", conversation.id)
            .maybeSingle();
          const liveAgentOwned = Boolean(
            (refreshed?.escalation_requested ?? conversation.escalation_requested) ||
              (refreshed?.assigned_to ?? conversation.assigned_to),
          );

          // A live agent owns the conversation: don't answer with AI.
          if (liveAgentOwned) {
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
            .order("created_at", { ascending: false })
            .limit(20);
          const history = (prior ?? [])
            .slice()
            .reverse()
            .filter((m: { id: string }) => m.id !== visitorMessage.id)
            .filter((m: { sender_type: string }) => m.sender_type !== "system")
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

          // Only genuine crisis language pulls a human in automatically. Other
          // low-confidence answers stay with the assistant and simply offer the
          // "Connect me" buttons, so the human queue is not flooded.
          if (result.crisis) {
            const { handoffToHumans } = await import("@/lib/handoff.server");
            await handoffToHumans({
              conversationId: conversation.id,
              organizationId: website.organization_id,
              websiteId: website.id,
              departmentId: conversation.department_id ?? null,
              currentDepartmentId: conversation.department_id ?? null,
              matchValue: "crisis",
              reason: "Crisis language detected — human assistance required",
              eventType: "ai_escalation",
            });
          }

          // Track consecutive shaky answers so the widget can emphasise the
          // "Connect me" button once the assistant has struggled twice.
          const metadata = (conversation.metadata ?? {}) as Record<string, unknown>;
          const priorStreak = Number(metadata["ai_low_confidence_streak"] ?? 0) || 0;
          const streak = result.crisis ? priorStreak : result.escalate ? priorStreak + 1 : 0;
          if (!result.crisis && streak !== priorStreak) {
            await db
              .from("conversations")
              .update({ metadata: { ...metadata, ai_low_confidence_streak: streak } as never })
              .eq("id", conversation.id);
          }

          return Response.json({
            conversationId: conversation.id,
            answer: result.answer,
            sources: result.sources,
            confidence: result.confidence,
            escalate: result.escalate,
            crisis: result.crisis,
            suggestHuman: streak >= 2,
            aiResponseId,
            // The widget renders this bubble immediately; returning the stored
            // id and timestamp lets it dedupe against the polling feed.
            messageId: aiMessage.id,
            createdAt: aiMessage.created_at,
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
