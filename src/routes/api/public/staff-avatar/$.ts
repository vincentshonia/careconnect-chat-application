import { createFileRoute } from "@tanstack/react-router";

/** Serves staff profile photos to visitors (agent avatar in the chat widget). */
export const Route = createFileRoute("/api/public/staff-avatar/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = (params as Record<string, string>)._splat ?? "";
        if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("staff-avatars").download(key);
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
