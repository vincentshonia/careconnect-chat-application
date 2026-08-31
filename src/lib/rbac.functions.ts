/**
 * Role administration. Role writes are blocked at the database layer for
 * ordinary users, so every change flows through these audited server
 * functions where the caller's authority is verified first.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  resolveActor,
  requirePermission,
  requireOrganization,
  writeAudit,
  ForbiddenError,
} from "@/lib/authz.server";
import { ORG_ROLES, roleTransitionError, type OrgRole } from "@/lib/permissions";

const roleEnum = z.enum(ORG_ROLES as [OrgRole, ...OrgRole[]]);

const changeRoleInput = z.object({
  userId: z.string().uuid(),
  role: roleEnum,
});

/** Current caller's effective authorization context, for the UI. */
export const getAuthorizationFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    return {
      userId: actor.userId,
      organizationId: actor.organizationId,
      role: actor.role,
      rank: actor.rank,
      platformRole: actor.platformRole,
      isPlatformAdmin: actor.isPlatformAdmin,
      permissions: [...actor.permissions],
      departmentIds: actor.departmentIds,
      fullName: actor.fullName,
    };
  });

/** Set a teammate's role within the caller's organization. */
export const setUserRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => changeRoleInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "role.manage", "Only administrators can change roles");
    const organizationId = requireOrganization(actor);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("organization_memberships")
      .select("id, role, status, organization_id")
      .eq("user_id", data.userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!target) throw new ForbiddenError("That teammate is not part of your organization");

    const error = roleTransitionError({
      actorRole: actor.role,
      actorIsSelf: actor.userId === data.userId,
      actorIsPlatformAdmin: actor.isPlatformAdmin,
      targetCurrentRole: target.role as OrgRole,
      targetNewRole: data.role,
    });
    if (error) throw new ForbiddenError(error);

    const { error: updateError } = await supabaseAdmin
      .from("organization_memberships")
      .update({ role: data.role, updated_at: new Date().toISOString() })
      .eq("id", target.id);
    if (updateError) throw new Error("Could not update the role");

    // Keep the legacy role table in step for anything still reading it.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role, organization_id: organizationId });

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId,
      action: "role.changed",
      recordType: "organization_memberships",
      recordId: data.userId,
      previousValue: { role: target.role },
      newValue: { role: data.role },
    });

    return { ok: true, role: data.role };
  });
