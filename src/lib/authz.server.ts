/**
 * Server-side authorization resolver.
 *
 * Every protected server function resolves the caller through this module so
 * authorization decisions are made in one place, from the authoritative
 * membership record — never from client-supplied input.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ROLE_RANK,
  permissionsFor,
  type OrgRole,
  type Permission,
  type PlatformRole,
} from "@/lib/permissions";

export type Actor = {
  userId: string;
  organizationId: string | null;
  role: OrgRole | null;
  rank: number;
  platformRole: PlatformRole | null;
  isPlatformAdmin: boolean;
  permissions: Set<string>;
  fullName: string | null;
  departmentIds: string[];
};

type Client = SupabaseClient<Database>;

/** Resolve the caller's tenant membership, platform role and permissions. */
export async function resolveActor(supabase: Client, userId: string): Promise<Actor> {
  const [membershipRes, platformRes, profileRes] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase.rpc("platform_role_of", { _user: userId }),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);

  const organizationId = membershipRes.data?.organization_id ?? null;
  const role = (membershipRes.data?.role ?? null) as OrgRole | null;
  const platformRole = (platformRes.data ?? null) as PlatformRole | null;
  const permissions = permissionsFor(role, platformRole);

  let departmentIds: string[] = [];
  if (organizationId) {
    const { data: depts } = await supabase
      .from("department_members")
      .select("department_id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId);
    departmentIds = (depts ?? []).map((d) => d.department_id);
  }

  return {
    userId,
    organizationId,
    role,
    rank: role ? ROLE_RANK[role] : 0,
    platformRole,
    isPlatformAdmin: permissions.has("platform.tenant_admin"),
    permissions,
    fullName: profileRes.data?.full_name ?? null,
    departmentIds,
  };
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function requirePermission(actor: Actor, permission: Permission, message?: string) {
  if (!actor.permissions.has(permission)) {
    throw new ForbiddenError(message);
  }
}

export function requireOrganization(actor: Actor): string {
  if (!actor.organizationId) {
    throw new ForbiddenError("Your account is not linked to an organization");
  }
  return actor.organizationId;
}

/** Immutable audit record written with the service role so it cannot be skipped. */
export async function writeAudit(
  admin: Client,
  entry: {
    actor: Actor;
    organizationId: string;
    action: string;
    recordType?: string | null;
    recordId?: string | null;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  },
) {
  try {
    await admin.from("audit_logs").insert({
      organization_id: entry.organizationId,
      actor_id: entry.actor.userId,
      actor_name: entry.actor.fullName,
      action: entry.action,
      record_type: entry.recordType ?? null,
      record_id: entry.recordId ?? null,
      previous_value: (entry.previousValue ?? null) as never,
      new_value: (entry.newValue ?? null) as never,
    });
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}
