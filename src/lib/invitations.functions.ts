import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ROLE_RANK } from "@/lib/staff-helpers";

/**
 * Secure staff invitations.
 *
 * An invitation is a single-use, expiring, email-bound token. Only the raw
 * token (never stored) can be redeemed; the database keeps a SHA-256 hash.
 * Accepting an invitation is the ONLY self-serve way to join a tenant —
 * signing up (including via Google/Microsoft) grants no organization access.
 */

const createInput = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(["agent", "team_lead", "manager", "administrator"]),
  title: z.string().trim().max(120).optional().nullable(),
  departmentIds: z.array(z.string().uuid()).max(20).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

async function sha256Hex(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The caller's active membership, used for every authorization decision. */
async function callerMembership(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) throw new Error("Your account is not a member of any organization");
  const rank = ROLE_RANK[data.role as string] ?? 0;
  return { organizationId: data.organization_id as string, role: data.role as string, rank };
}

export const listInvitationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("organization_invitations")
      .select("id, email, role, title, status, expires_at, created_at, accepted_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const createInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await callerMembership(context);
    if (caller.rank < 4) throw new Error("Only administrators can invite staff");
    if ((ROLE_RANK[data.role] ?? 99) > caller.rank) {
      throw new Error("You cannot invite someone at a higher role than your own");
    }

    const email = data.email.toLowerCase();

    // Departments must be visible under the caller's own RLS scope.
    let departmentIds: string[] = [];
    if (data.departmentIds?.length) {
      const { data: depts } = await context.supabase
        .from("departments")
        .select("id")
        .in("id", data.departmentIds);
      departmentIds = (depts ?? []).map((d: { id: string }) => d.id);
    }

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();

    const { error } = await context.supabase.from("organization_invitations").insert({
      organization_id: caller.organizationId,
      email,
      role: data.role,
      title: data.title || null,
      department_ids: departmentIds,
      token_hash: tokenHash,
      invited_by: context.userId,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    return { token, email, expiresAt };
  });

export const revokeInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await callerMembership(context);
    if (caller.rank < 4) throw new Error("Only administrators can revoke invitations");
    const { error } = await context.supabase
      .from("organization_invitations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Redeem an invitation as the currently signed-in user. The invitation email
 * must match the signed-in account, so a leaked link cannot be used by anyone
 * else.
 */
export const acceptInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(32).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const email = String(context.claims["email"] ?? "").toLowerCase();
    if (!email) throw new Error("Your account has no verified email address");

    const tokenHash = await sha256Hex(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite } = await supabaseAdmin
      .from("organization_invitations")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!invite || invite.status !== "pending") throw new Error("This invitation is no longer valid");
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from("organization_invitations")
        .update({ status: "expired" })
        .eq("id", invite.id);
      throw new Error("This invitation has expired");
    }
    if (String(invite.email).toLowerCase() !== email) {
      throw new Error("This invitation was issued to a different email address");
    }

    const organizationId = invite.organization_id as string;

    await supabaseAdmin.from("profiles").upsert(
      { id: context.userId, email, organization_id: organizationId, title: invite.title ?? null },
      { onConflict: "id" },
    );

    const { error: membershipError } = await supabaseAdmin
      .from("organization_memberships")
      .upsert(
        {
          organization_id: organizationId,
          user_id: context.userId,
          role: invite.role,
          status: "active",
          title: invite.title ?? null,
          invited_by: invite.invited_by,
          invited_at: invite.created_at,
          accepted_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,user_id" },
      );
    if (membershipError) throw new Error(membershipError.message);

    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: context.userId, role: invite.role, organization_id: organizationId },
        { onConflict: "user_id,role" },
      );

    const departmentIds: string[] = invite.department_ids ?? [];
    if (departmentIds.length) {
      await supabaseAdmin.from("department_members").upsert(
        departmentIds.map((departmentId) => ({
          user_id: context.userId,
          department_id: departmentId,
          organization_id: organizationId,
        })),
        { onConflict: "user_id,department_id" },
      );
    }

    await supabaseAdmin
      .from("organization_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_user_id: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      actor_name: email,
      action: "invitation.accepted",
      record_type: "organization_invitations",
      record_id: invite.id,
      new_value: { role: invite.role },
    });

    return { ok: true, organizationId };
  });
