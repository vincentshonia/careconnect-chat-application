import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Proves the embedding page's origin.
 *
 * The widget itself runs in an iframe served from our own origin, so nothing it
 * sends can prove which site it is embedded in. The loader script runs on the
 * customer's page instead, so this request is cross-origin and the browser
 * attaches a trustworthy `Origin` header. When that origin is on the website's
 * allow-list the response carries a short-lived signed proof, which the widget
 * presents when it mints a chat session.
 */

const schema = z.object({
  websiteId: z.string().uuid().nullable().optional(),
  publicKey: z.string().max(120).nullable().optional(),
});

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

export const Route = createFileRoute("/api/public/chat/origin")({
  server: {
    handlers: {
      OPTIONS: ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),
      POST: async ({ request }) => {
        const mod = await import("@/lib/public-chat.server");
        const origin = request.headers.get("origin");
        const headers = corsHeaders(origin);
        try {
          const parsed = schema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success || (!parsed.data.websiteId && !parsed.data.publicKey)) {
            return Response.json({ error: "Invalid request" }, { status: 400, headers });
          }
          await mod.enforceRateLimit(`origin:ip:${mod.clientIp(request)}`, 60, 60);

          const reported = mod.verifiedOrigin(request);
          const website = parsed.data.publicKey
            ? await mod.resolveWebsiteByKey(parsed.data.publicKey, reported)
            : await mod.resolveWebsite(String(parsed.data.websiteId), reported);

          const { signOriginProof } = await import("@/lib/widget-session.server");
          const host = reported ?? "";
          const proof = host ? await signOriginProof(website.id, host) : null;
          return Response.json({ proof, websiteId: website.id }, { headers });
        } catch (error) {
          const status = error instanceof mod.PublicChatError ? error.status : 500;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected error" },
            { status, headers },
          );
        }
      },
    },
  },
});
