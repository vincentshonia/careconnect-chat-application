import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  aiResponseId: z.string().uuid(),
  helpful: z.boolean(),
});

export const Route = createFileRoute("/api/public/chat/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json());
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
        const { admin } = await import("@/lib/public-chat.server");
        await admin()
          .from("ai_responses")
          .update({ visitor_feedback: parsed.data.helpful ? "helpful" : "not_helpful" })
          .eq("id", parsed.data.aiResponseId);
        return Response.json({ ok: true });
      },
    },
  },
});
