import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ROLE_RANK,
  createStaffInput,
  staffAccessInput,
  generateTempPassword,
} from "@/lib/staff-helpers";

/**
 * Administrator-only: create a staff account directly with a temporary password.
 * The caller must be rank 4+ and cannot create a role above their own rank.
 */
export const createStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createStaffInput.parse(input))
  .handler(async ({ data, context }) => {
    // Authorize against the caller's own roles (RLS-scoped read, no admin client yet).
    const { data: callerRoles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) throw new Error("Could not verify your permissions");

    const callerRank = (callerRoles ?? []).reduce(
      (max, r) => Math.max(max, ROLE_RANK[r.role as string] ?? 0),
      0,
    );
    if (callerRank < 4) throw new Error("Only administrators can add staff members");
    if ((ROLE_RANK[data.role] ?? 99) > callerRank) {
      throw new Error("You cannot assign a role higher than your own");
    }

    const { data: callerProfile } = await context.supabase
      .from("profiles")
      .select("organization_id, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const organizationId = callerProfile?.organization_id ?? null;
    if (!organizationId) throw new Error("Your account is not linked to an organization");

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

    return { userId: newUserId, email, tempPassword };
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

    const { data: callerRoles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) throw new Error("Could not verify your permissions");
    const callerRank = (callerRoles ?? []).reduce(
      (max, r) => Math.max(max, ROLE_RANK[r.role as string] ?? 0),
      0,
    );
    if (callerRank < 4) throw new Error("Only administrators can change staff access");

    const { data: callerProfile } = await context.supabase
      .from("profiles")
      .select("organization_id, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const organizationId = callerProfile?.organization_id ?? null;
    if (!organizationId) throw new Error("Your account is not linked to an organization");

    // Target must be visible under the caller's org RLS.
    const { data: target } = await context.supabase
      .from("profiles")
      .select("id, organization_id, full_name, email, status")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target || target.organization_id !== organizationId) {
      throw new Error("Staff member not found in your organization");
    }

    const { data: targetRoles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const targetRank = (targetRoles ?? []).reduce(
      (max, r) => Math.max(max, ROLE_RANK[r.role as string] ?? 0),
      0,
    );
    if (targetRank > callerRank) throw new Error("You cannot change access for a higher role");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
