/**
 * Quality review writes. Reviews drive coaching and performance reporting, so
 * they are written server-side with a `quality.review` check, the agent taken
 * from the conversation record, and the reviewer taken from the session.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ForbiddenError,
  requireOrganization,
  requirePermission,
  resolveActor,
  writeAudit,
} from "@/lib/authz.server";

const score = z.number().int().min(1).max(5);

const reviewInput = z.object({
  conversationId: z.string().uuid(),
  accuracy: score,
  tone: score,
  compliance: score,
  resolution: score,
  notes: z.string().max(4000).nullable().optional(),
  flagged: z.boolean().default(false),
});

export const createQaReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    // Reviews are a supervisory activity; team leads and above hold this.
    requirePermission(actor, "quality.review", "Only supervisors can record quality reviews");
    const organizationId = requireOrganization(actor);

    const { data: conversation, error: readError } = await context.supabase
      .from("conversations")
      .select("id, organization_id, assigned_to")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (readError || !conversation) throw new Error("Conversation not found");
    if (conversation.organization_id !== organizationId && !actor.isPlatformAdmin) {
      throw new ForbiddenError("That conversation belongs to another organization");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("qa_reviews").insert({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      reviewer_id: actor.userId,
      reviewer_name: actor.fullName,
      // Attribution comes from the conversation record, never from the client.
      agent_id: conversation.assigned_to,
      accuracy_score: data.accuracy,
      tone_score: data.tone,
      compliance_score: data.compliance,
      resolution_score: data.resolution,
      coaching_notes: data.notes ?? null,
      flagged: data.flagged,
    });
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: conversation.organization_id,
      action: "qa_review.created",
      recordType: "conversations",
      recordId: conversation.id,
      newValue: {
        accuracy_score: data.accuracy,
        tone_score: data.tone,
        compliance_score: data.compliance,
        resolution_score: data.resolution,
        flagged: data.flagged,
      },
    });

    return { ok: true };
  });
