/**
 * Audit trail entries are written on the server so the browser can never pick
 * the actor, the tenant, or skip the record entirely.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, requireOrganization, requirePermission } from "@/lib/authz.server";
import type { Permission } from "@/lib/permissions";
import { z } from "zod";

/** Each audit scope is gated by the permission that governs the change itself. */
const SCOPE_PERMISSION: Record<string, Permission> = {
  settings: "settings.manage",
  website: "website.manage",
  security: "security.manage",
  organization: "organization.manage",
  knowledge: "knowledge.edit",
};

const auditInput = z.object({
  scope: z.enum(["settings", "website", "security", "organization", "knowledge"]),
  action: z.string().trim().min(1).max(120),
  recordType: z.string().trim().max(120).nullish(),
  recordId: z.string().trim().max(200).nullish(),
  websiteId: z.string().uuid().nullish(),
  previousValue: z.record(z.string(), z.unknown()).nullish(),
  newValue: z.record(z.string(), z.unknown()).nullish(),
});

export const recordAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => auditInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requirePermission(actor, SCOPE_PERMISSION[data.scope]!);
    const organizationId = requireOrganization(actor);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      organization_id: organizationId,
      website_id: data.websiteId ?? null,
      actor_id: actor.userId,
      actor_name: actor.fullName,
      action: data.action,
      record_type: data.recordType ?? null,
      record_id: data.recordId ?? null,
      previous_value: (data.previousValue ?? null) as never,
      new_value: (data.newValue ?? null) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
