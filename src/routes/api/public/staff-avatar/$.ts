import { createFileRoute } from "@tanstack/react-router";

/** Serves staff profile photos to visitors (agent avatar in the chat widget). */
export const Route = createFileRoute("/api/public/staff-avatar/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = (params as Record<string, string>)._splat ?? "";
        if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // A stored photo is not public by itself: it is served only when it
        // belongs to an active staff member who explicitly opted in to being
        // shown in the widget. Otherwise the object stays private.
        const { data: owner } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("avatar_url", `/api/public/staff-avatar/${key}`)
          .eq("status", "active")
          .eq("show_in_widget_team", true)
          .maybeSingle();
        if (!owner) return new Response("Not found", { status: 404 });

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
