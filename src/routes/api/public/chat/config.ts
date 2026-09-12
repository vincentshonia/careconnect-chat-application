import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/chat/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const websiteId = url.searchParams.get("w") ?? "";
        // `h` is what the page claimed (analytics only). Authorization uses the
        // signed origin proof issued to the loader script.
        const clientHint = url.searchParams.get("h");
        const mod = await import("@/lib/public-chat.server");
        try {
          await mod.enforceRateLimit(`cfg:ip:${mod.clientIp(request)}`, 60, 60);
          const proven = await mod.provenHost(url.searchParams.get("op"), websiteId);
          const config = await mod.loadWidgetConfig(websiteId, proven, clientHint);
          return Response.json(config, {
            headers: { "Cache-Control": "public, max-age=60" },
          });
        } catch (error) {
          const status = error instanceof mod.PublicChatError ? error.status : 500;
          const code = error instanceof Error ? error.message : "Unexpected error";
          // Visitors get something they can act on; the technical reason stays
          // in `code` for debugging.
          const contact = status === 403 ? await mod.publicContact(websiteId) : null;
          const friendly = contact
            ? `This chat isn't available on this page yet.${
                contact.phone ? ` Please call ${contact.phone}` : ""
              }${contact.domain ? `${contact.phone ? " or" : " Please"} visit ${contact.domain}` : ""}.`
            : code;
          return Response.json(
            { error: friendly, code, contact },
            { status, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
