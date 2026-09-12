import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStaffInput, staffAccessInput } from "@/lib/staff-helpers";
import { issueInvitation } from "@/lib/invitations.functions";
import {
  resolveActor,
  requirePermission,
  requireOrganization,
  writeAudit,
  ForbiddenError,
} from "@/lib/authz.server";
import { ROLE_RANK, roleTransitionError, type OrgRole } from "@/lib/permissions";

/** Public origin used for absolute links/images inside outgoing emails. */
const APP_ORIGIN = "https://chat.mypacifichealth.com";

/**
 * Hand a departing staff member's open chats back to the queue.
 *
 * Offboarding must never leave a visitor owned by an account that can no
 * longer sign in, and deleting the account later must not have to rewrite
 * lifecycle columns behind the workflow's back. Every chat goes through the
 * lifecycle routine, so the history entry and timing columns stay consistent,
 * and the department is alerted that the chat is waiting again.
 */
async function releaseOpenConversations(
  userId: string,
  organizationId: string,
  actorId: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: open } = await supabaseAdmin
    .from("conversations")
    .select("id, department_id")
    .eq("organization_id", organizationId)
    .eq("assigned_to", userId)
    .in("status", ["active", "assigned"]);

  if (!open?.length) return;

  const { transitionConversation } = await import("@/lib/lifecycle.server");
  const { notifyStaff } = await import("@/lib/notifications.server");

  for (const conversation of open) {
    try {
      await transitionConversation({
        conversationId: conversation.id,
        event: "release",
        actorId,
        payload: {
          expected_assignee: userId,
          detail: "Returned to the queue — staff member offboarded",
        },
      });
      await notifyStaff({
        organizationId,
        departmentId: conversation.department_id,
        type: "escalation",
        severity: "warning",
        title: "Chat returned to the queue",
        body: "The assigned staff member was removed or disabled",
        link: `/inbox?c=${conversation.id}`,
        recordType: "conversations",
        recordId: conversation.id,
      });
    } catch (error) {
      // A chat that moved on in the meantime must not block offboarding.
      console.warn("[staff] release on offboard failed", conversation.id, error);
    }
  }
}

/**
 * Administrator-only: invite a staff member.
 *
 * No account and no password are ever created here. The person receives a
 * single-use, expiring invitation link bound to their email address, and the
 * account is provisioned when they accept it. The caller must hold
 * staff.create and cannot invite a role above their own rank.
 */
export const createStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createStaffInput.parse(input))
  .handler(async ({ data, context }) => {
    // Authorize from the authoritative membership record.
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
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

    // Same single-use, email-bound token as the invitations card.
    const invitation = await issueInvitation(context, {
      organizationId,
      email,
      role: data.role,
      title: data.title,
      departmentIds,
      expiresInDays: 7,
    });
    const inviteUrl = `${APP_ORIGIN}/invite?t=${invitation.token}`;

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      actor_name: callerProfile?.full_name ?? null,
      action: "staff.invited",
      record_type: "organization_invitations",
      new_value: { email, role: data.role, full_name: data.fullName },
    });

    // Welcome email carrying the invitation link only — never a password. A
    // failure here must not undo the invitation; the link is still shown once
    // in the admin UI as a fallback.
    let emailed = false;
    let emailError: string | null = null;
    try {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name, logo_url, phone")
        .eq("id", organizationId)
        .maybeSingle();

      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("staff-welcome", email, {
        idempotencyKey: `staff-invite-${invitation.expiresAt}-${email}`,
        templateData: {
          fullName: data.fullName,
          organizationName: org?.name ?? "your care team",
          email,
          role: data.role,
          inviteUrl,
          expiresAt: invitation.expiresAt,
          logoUrl: org?.logo_url
            ? org.logo_url.startsWith("http")
              ? org.logo_url
              : `${APP_ORIGIN}${org.logo_url}`
            : `${APP_ORIGIN}${brandLogoAsset.url}`,
          supportPhone: org?.phone ?? undefined,
        },
      });
      emailed = result.sent;
      if (!result.sent) emailError = "This address is blocked from receiving email.";
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Could not send the invitation email";
      console.error("[staff.invited] invitation email failed", emailError);
    }

    return { email, inviteUrl, expiresAt: invitation.expiresAt, emailed, emailError };
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

    const actor = await resolveActor(context.supabase, context.userId, context.claims);
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
    if (
      targetRank === ROLE_RANK.super_admin &&
      callerRank < ROLE_RANK.super_admin &&
      !actor.isPlatformAdmin
    ) {
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
      await supabaseAdmin.from("profiles").update({ status: "active" }).eq("id", data.userId);
    } else {
      // Hand their open chats back to the queue first, through the lifecycle
      // routine, so the history entry is written and the team is alerted.
      await releaseOpenConversations(data.userId, organizationId, context.userId);

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
      new_value: {
        status:
          data.action === "enable" ? "active" : data.action === "remove" ? "archived" : "inactive",
      },
    });

    return { ok: true, status: data.action };
  });

const staffProfileInput = z.object({
  userId: z.string().uuid(),
  presence: z.enum(["available", "busy", "away", "offline"]).optional(),
  maxConcurrentChats: z.number().int().min(1).max(20).optional(),
});

/**
 * Adjust availability or chat capacity.
 *
 * Anyone may change their OWN availability (that is how an agent goes on or
 * off the live rotation). Changing someone else's settings, or anyone's chat
 * capacity, stays an administrator action behind `staff.edit`.
 */
export const updateStaffProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    const isSelf = data.userId === context.userId;
    const selfPresenceOnly = isSelf && data.maxConcurrentChats === undefined;
    if (!selfPresenceOnly) {
      requirePermission(
        actor,
        "staff.edit",
        isSelf
          ? "Only administrators can change chat capacity"
          : "Only administrators can change staff settings",
      );
    }
    const organizationId = requireOrganization(actor);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, organization_id, presence, max_concurrent_chats")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target || (target.organization_id !== organizationId && !actor.isPlatformAdmin)) {
      throw new ForbiddenError("Staff member not found in your organization");
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.presence !== undefined) patch["presence"] = data.presence;
    if (data.maxConcurrentChats !== undefined)
      patch["max_concurrent_chats"] = data.maxConcurrentChats;

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", target.id);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId,
      action: "staff_profile.updated",
      recordType: "profiles",
      recordId: target.id,
      previousValue: {
        presence: target.presence,
        max_concurrent_chats: target.max_concurrent_chats,
      },
      newValue: patch,
    });

    return { ok: true };
  });
