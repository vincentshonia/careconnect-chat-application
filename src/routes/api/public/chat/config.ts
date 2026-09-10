import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/chat/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const websiteId = url.searchParams.get("w") ?? "";
        const host = url.searchParams.get("h");
        const mod = await import("@/lib/public-chat.server");
        try {
          await mod.enforceRateLimit(`cfg:ip:${mod.clientIp(request)}`, 60, 60);
          const config = await mod.loadWidgetConfig(websiteId, host);
          return Response.json(config, {
            headers: { "Cache-Control": "public, max-age=60" },
          });
        } catch (error) {
          const status = error instanceof mod.PublicChatError ? error.status : 500;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected error" },
            { status, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
