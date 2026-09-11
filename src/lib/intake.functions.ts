/**
 * Intake pipeline writes.
 *
 * The browser is read-only on `intake_requests` / `intake_events`; every
 * change flows through these audited server functions so the permission check
 * and the actor stamp cannot be skipped by a tampered client.
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

const STAGES = [
  "new",
  "in_review",
  "contacted",
  "eligibility_check",
  "submitted",
  "approved",
  "denied",
  "withdrawn",
] as const;

const updateInput = z.object({
  id: z.string().uuid(),
  stage: z.enum(STAGES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z.string().max(20).nullable().optional(),
});

const noteInput = z.object({
  id: z.string().uuid(),
  note: z.string().trim().min(1).max(2000),
});

/** Read the request through the caller's own RLS scope. */
async function loadIntake(supabase: Parameters<typeof resolveActor>[0], id: string) {
  const { data, error } = await supabase
    .from("intake_requests")
    .select("id, organization_id, stage, assigned_to, due_date, reference")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("Request not found");
  return data;
}

/** Stage, assignment and due-date changes — supervisory work. */
export const updateIntakeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "workflow.manage", "Only managers and above can change intake requests");
    const organizationId = requireOrganization(actor);

    const intake = await loadIntake(context.supabase, data.id);
    if (intake.organization_id !== organizationId && !actor.isPlatformAdmin) {
      throw new ForbiddenError("That request belongs to another organization");
    }

    const patch: Record<string, unknown> = {};
    if (data.stage !== undefined) patch['stage'] = data.stage;
    if (data.assignedTo !== undefined) patch['assigned_to'] = data.assignedTo;
    if (data.dueDate !== undefined) patch['due_date'] = data.dueDate || null;
    if (Object.keys(patch).length === 0) return { ok: true };

    // The assignee must be a member of the same organization.
    if (data.assignedTo) {
      const { data: target } = await context.supabase
        .from("profiles")
        .select("id")
        .eq("id", data.assignedTo)
        .eq("organization_id", intake.organization_id)
        .maybeSingle();
      if (!target) throw new Error("That staff member is not in your organization");
    }

    if (data.stage !== undefined) patch['stage_changed_at'] = new Date().toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("intake_requests")
      .update(patch as never)
      .eq("id", intake.id);
    if (error) throw new Error(error.message);

    if (data.stage !== undefined && data.stage !== intake.stage) {
      await supabaseAdmin.from("intake_events").insert({
        intake_id: intake.id,
        organization_id: intake.organization_id,
        actor_id: actor.userId,
        event_type: "stage_change",
        previous_value: intake.stage,
        new_value: data.stage,
      });
    }
    if (data.assignedTo !== undefined && data.assignedTo !== intake.assigned_to) {
      await supabaseAdmin.from("intake_events").insert({
        intake_id: intake.id,
        organization_id: intake.organization_id,
        actor_id: actor.userId,
        event_type: "assignment",
        previous_value: intake.assigned_to ?? "unassigned",
        new_value: data.assignedTo ?? "unassigned",
      });
    }

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: intake.organization_id,
      action: "intake_request.updated",
      recordType: "intake_requests",
      recordId: intake.id,
      previousValue: { stage: intake.stage, assigned_to: intake.assigned_to, due_date: intake.due_date },
      newValue: patch,
    });

    return { ok: true };
  });

/** A free-text note on the request timeline — assignee or manager only. */
export const addIntakeNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => noteInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const organizationId = requireOrganization(actor);
    const intake = await loadIntake(context.supabase, data.id);
    if (intake.organization_id !== organizationId && !actor.isPlatformAdmin) {
      throw new ForbiddenError("That request belongs to another organization");
    }

    const isAssignee = intake.assigned_to === actor.userId;
    if (!isAssignee && !actor.permissions.has("workflow.manage")) {
      throw new ForbiddenError("Only the assignee or a manager can add notes to this request");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("intake_events").insert({
      intake_id: intake.id,
      organization_id: intake.organization_id,
      actor_id: actor.userId,
      event_type: "note",
      detail: data.note,
    });
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: intake.organization_id,
      action: "intake_request.note_added",
      recordType: "intake_requests",
      recordId: intake.id,
    });

    return { ok: true };
  });
