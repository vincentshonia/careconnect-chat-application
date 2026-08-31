import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createStaffInput,
  staffAccessInput,
  generateTempPassword,
} from "@/lib/staff-helpers";
import {
  resolveActor,
  requirePermission,
  requireOrganization,
  ForbiddenError,
} from "@/lib/authz.server";
import { ROLE_RANK, roleTransitionError, type OrgRole } from "@/lib/permissions";

/** Public origin used for absolute links/images inside outgoing emails. */
const APP_ORIGIN = "https://chat.mypacifichealth.com";

/**
 * Administrator-only: create a staff account directly with a temporary password.
 * The caller must be rank 4+ and cannot create a role above their own rank.
 */
export const createStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createStaffInput.parse(input))
  .handler(async ({ data, context }) => {
    // Authorize from the authoritative membership record.
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "staff.create", "Only administrators can add staff members");
    const organizationId = requireOrganization(actor);
    const callerProfile = { full_name: actor.fullName };

    const transitionError = roleTransitionError({
      actorRole: actor.role,
      actorIsSelf: false,
      actorIsPlatformAdmin: actor.isPlatformAdmin,
      targetCurrentRole: null,
      targetNewRole: data.role as OrgRole,
    });
    if (transitionError) throw new ForbiddenError(transitionError);

    // Departments must belong to the caller's organization (RLS-scoped read).
    let departmentIds: string[] = [];
    if (data.departmentIds?.length) {
      const { data: depts } = await context.supabase
        .from("departments")
        .select("id")
        .in("id", data.departmentIds);
      departmentIds = (depts ?? []).map((d) => d.id);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = data.email.toLowerCase();
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) throw new Error("A staff member with that email already exists");

    const tempPassword = generateTempPassword();
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createError || !created.user) {
      throw new Error(createError?.message ?? "Could not create the account");
    }
    const newUserId = created.user.id;

    // The signup trigger seeds a profile + default role; normalise both here.
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: newUserId,
        organization_id: organizationId,
        full_name: data.fullName,
        email,
        title: data.title || null,
        phone: data.phone || null,
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role, organization_id: organizationId });
    if (roleError) throw new Error(roleError.message);

    // Explicit tenant membership is what actually grants access to the org.
    const { error: membershipError } = await supabaseAdmin
      .from("organization_memberships")
      .upsert(
        {
          organization_id: organizationId,
          user_id: newUserId,
          role: data.role,
          status: "active",
          title: data.title || null,
          invited_by: context.userId,
          accepted_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,user_id" },
      );
    if (membershipError) throw new Error(membershipError.message);

    if (departmentIds.length) {
      await supabaseAdmin.from("department_members").insert(
        departmentIds.map((departmentId) => ({
          user_id: newUserId,
          department_id: departmentId,
          organization_id: organizationId,
        })),
      );
    }

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      actor_name: callerProfile?.full_name ?? null,
      action: "staff.created",
      record_type: "profiles",
      record_id: newUserId,
      new_value: { email, role: data.role, full_name: data.fullName },
    });

    // Welcome email with the temporary password. A failure here must never
    // undo the account that was just created — the password is still shown
    // once in the admin UI as a fallback.
    let emailed = false;
    let emailError: string | null = null;
    try {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name, logo_url, primary_color")
        .eq("id", organizationId)
        .maybeSingle();

      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("staff-welcome", email, {
        idempotencyKey: `staff-welcome-${newUserId}`,
        templateData: {
          fullName: data.fullName,
          organizationName: org?.name ?? "your care team",
          email,
          tempPassword,
          role: data.role,
          signInUrl: `${APP_ORIGIN}/auth`,
          logoUrl: org?.logo_url
            ? org.logo_url.startsWith("http")
              ? org.logo_url
              : `${APP_ORIGIN}${org.logo_url}`
            : undefined,
          primaryColor: org?.primary_color ?? undefined,
        },
      });
      emailed = result.sent;
      if (!result.sent) emailError = "This address is blocked from receiving email.";
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Could not send the welcome email";
      console.error("[staff.created] welcome email failed", emailError);
    }

    return { userId: newUserId, email, tempPassword, emailed, emailError };
  });


/**
 * Administrator-only: disable, re-enable, or revoke a staff account.
 * Access is revoked at the auth layer and the profile is flagged — no
 * conversations, messages, contacts or audit history are ever deleted.
 */
export const setStaffAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffAccessInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) throw new Error("You cannot change your own access");

    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(
      actor,
      data.action === "remove" ? "staff.remove" : "staff.disable",
      "Only administrators can change staff access",
    );
    const organizationId = requireOrganization(actor);
    const callerRank = actor.rank;
    const callerProfile = { full_name: actor.fullName };

    // Target must be visible under the caller's org RLS.
    const { data: target } = await context.supabase
      .from("profiles")
      .select("id, organization_id, full_name, email, status")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target || target.organization_id !== organizationId) {
      throw new Error("Staff member not found in your organization");
    }

    const { data: targetMembership } = await context.supabase
      .from("organization_memberships")
      .select("role")
      .eq("user_id", data.userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const targetRank = ROLE_RANK[(targetMembership?.role ?? "agent") as OrgRole] ?? 0;
    if (targetRank > callerRank && !actor.isPlatformAdmin) {
      throw new ForbiddenError("You cannot change access for a higher role");
    }
    if (targetRank === ROLE_RANK.super_admin && callerRank < ROLE_RANK.super_admin && !actor.isPlatformAdmin) {
      throw new ForbiddenError("Only a Super Admin can change another Super Admin");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const membershipStatus =
      data.action === "enable" ? "active" : data.action === "remove" ? "removed" : "suspended";
    await supabaseAdmin
      .from("organization_memberships")
      .update({ status: membershipStatus, updated_at: new Date().toISOString() })
      .eq("user_id", data.userId)
      .eq("organization_id", organizationId);

    if (data.action === "enable") {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "none" });
      await supabaseAdmin
        .from("profiles")
        .update({ status: "active" })
        .eq("id", data.userId);
    } else {
      // Indefinite ban revokes sign-in without touching any historical records.
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
      await supabaseAdmin
        .from("profiles")
        .update({
          status: data.action === "remove" ? "archived" : "inactive",
          presence: "offline",
        })
        .eq("id", data.userId);

      if (data.action === "remove") {
        // Strip permissions and routing membership; conversations stay assigned
        // so the communication history remains intact and attributable.
        await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
        await supabaseAdmin.from("department_members").delete().eq("user_id", data.userId);
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      actor_name: callerProfile?.full_name ?? null,
      action: `staff.${data.action === "enable" ? "reactivated" : data.action === "remove" ? "removed" : "disabled"}`,
      record_type: "profiles",
      record_id: data.userId,
      previous_value: { status: target.status },
      new_value: { status: data.action === "enable" ? "active" : data.action === "remove" ? "archived" : "inactive" },
    });

    return { ok: true, status: data.action };
  });
