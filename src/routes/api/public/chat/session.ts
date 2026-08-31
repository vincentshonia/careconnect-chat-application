import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  websiteId: z.string().uuid().nullable().optional(),
  publicKey: z.string().max(120).nullable().optional(),
  host: z.string().max(300).nullable().optional(),
  meta: z.record(z.any()).optional(),
});

/**
 * Mints a signed, short-lived chat session. Every other public chat endpoint
 * requires the token returned here — the browser never chooses its own id.
 */
export const Route = createFileRoute("/api/public/chat/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mod = await import("@/lib/public-chat.server");
        try {
          const parsed = schema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
          if (!parsed.data.websiteId && !parsed.data.publicKey) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }
          await mod.enforceRateLimit(`sess:ip:${mod.clientIp(request)}`, 30, 60);
          const result = await mod.startWidgetSession({
            websiteId: parsed.data.websiteId ?? null,
            publicKey: parsed.data.publicKey ?? null,
            host: parsed.data.host ?? null,
            meta: parsed.data.meta ?? {},
          });
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
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
