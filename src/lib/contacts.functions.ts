/**
 * Contact record writes. The browser can read contacts under RLS but never
 * write them; edits run here with a `contact.edit` check and an audit row.
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

const updateInput = z.object({
  id: z.string().uuid(),
  leadStatus: z.enum(["new", "working", "qualified", "converted", "closed"]).optional(),
  notes: z.string().max(5000).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
});

export const updateContactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "contact.edit", "Only managers and above can edit contacts");
    const organizationId = requireOrganization(actor);

    // RLS-scoped read: a contact the caller cannot see cannot be edited.
    const { data: contact, error: readError } = await context.supabase
      .from("contacts")
      .select("id, organization_id, lead_status, owner_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !contact) throw new Error("Contact not found");
    if (contact.organization_id !== organizationId && !actor.isPlatformAdmin) {
      throw new ForbiddenError("That contact belongs to another organization");
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.leadStatus !== undefined) patch["lead_status"] = data.leadStatus;
    if (data.notes !== undefined) patch["notes"] = data.notes;
    if (data.ownerId !== undefined) patch["owner_id"] = data.ownerId;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("contacts")
      .update(patch as never)
      .eq("id", contact.id);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: contact.organization_id,
      action: "contact.updated",
      recordType: "contacts",
      recordId: contact.id,
      previousValue: { lead_status: contact.lead_status, owner_id: contact.owner_id },
      newValue: patch,
    });

    return { ok: true };
  });
