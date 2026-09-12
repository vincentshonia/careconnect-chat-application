import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const input = z.object({ websiteId: z.string().uuid() });

/**
 * Mint a short-lived proof that lets a staff member run the *real* chat widget
 * inside the admin console, on a host that is not on the website's allow-list.
 *
 * Chats started this way are marked as preview traffic, so they never reach the
 * waiting queue, the dashboard or any report.
 */
export const widgetPreviewProofFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data, context }) => {
    const { resolveActor, requirePermission } = await import("@/lib/authz.server");
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requirePermission(actor, "website.manage", "Only administrators can preview the chat widget");

    // RLS-scoped read: the caller must be able to see this website.
    const { data: website, error } = await context.supabase
      .from("websites")
      .select("id")
      .eq("id", data.websiteId)
      .maybeSingle();
    if (error || !website) throw new Error("Website not found");

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const host = getRequestHeader("origin") ?? getRequestHeader("host") ?? "console";

    const { signOriginProof } = await import("@/lib/widget-session.server");
    const proof = await signOriginProof(website.id, host, true);
    return { proof, host };
  });
