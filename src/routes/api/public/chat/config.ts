import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/chat/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const websiteId = url.searchParams.get("w") ?? "";
        const host = url.searchParams.get("h");
        const { loadWidgetConfig, PublicChatError } = await import("@/lib/public-chat.server");
        try {
          const config = await loadWidgetConfig(websiteId, host);
          return Response.json(config, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          const status = error instanceof PublicChatError ? error.status : 500;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected error" },
            { status },
          );
        }
      },
    },
  },
});
