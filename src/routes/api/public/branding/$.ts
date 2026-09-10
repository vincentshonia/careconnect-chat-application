import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/branding/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const key = (params as Record<string, string>)._splat ?? "";
        if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

        const chat = await import("@/lib/public-chat.server");
        try {
          await chat.enforceRateLimit(`brand:ip:${chat.clientIp(request)}`, 120, 60);
        } catch (error) {
          const status = error instanceof chat.PublicChatError ? error.status : 500;
          return new Response(error instanceof Error ? error.message : "Unavailable", { status });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("branding").download(key);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(await data.arrayBuffer(), {
          headers: {
            "content-type": data.type || "application/octet-stream",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
