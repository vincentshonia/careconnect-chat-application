/**
 * Internal (staff-only) notes on a conversation. Never shown in the widget.
 * The browser is read-only on `internal_notes`; the author is stamped from
 * the session here so a note can't be attributed to somebody else.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ForbiddenError, requireOrganization, resolveActor } from "@/lib/authz.server";

const noteInput = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const addInternalNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => noteInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const organizationId = requireOrganization(actor);

    // RLS-scoped read: a conversation the caller cannot see cannot be noted on.
    const { data: conversation, error } = await context.supabase
      .from("conversations")
      .select("id, organization_id, assigned_to")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error || !conversation) throw new Error("Conversation not found");
    if (conversation.organization_id !== organizationId && !actor.isPlatformAdmin) {
      throw new ForbiddenError("That conversation belongs to another organization");
    }

    const isAssignee = conversation.assigned_to === actor.userId;
    const supervises =
      actor.permissions.has("conversation.reassign") ||
      actor.permissions.has("conversation.view_all");
    if (!isAssignee && !supervises) {
      throw new ForbiddenError("Only the assigned agent or a supervisor can add notes here");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: insertError } = await supabaseAdmin
      .from("internal_notes")
      .insert({
        conversation_id: conversation.id,
        organization_id: conversation.organization_id,
        author_id: actor.userId,
        body: data.body,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    return { ok: true, id: row.id };
  });
