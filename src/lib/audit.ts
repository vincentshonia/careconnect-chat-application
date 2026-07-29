import { supabase } from "@/integrations/supabase/client";

type Json = Record<string, unknown> | null;

export type AuditEntry = {
  /** Machine-readable verb, e.g. "conversation.assigned" or "faq.deleted". */
  action: string;
  recordType?: string | null;
  recordId?: string | null;
  websiteId?: string | null;
  previousValue?: Json;
  newValue?: Json;
};

let actorCache: { userId: string; orgId: string | null; name: string | null } | null = null;

async function resolveActor() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  if (actorCache?.userId === userId) return actorCache;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, full_name")
    .eq("id", userId)
    .maybeSingle();

  actorCache = {
    userId,
    orgId: profile?.organization_id ?? null,
    name: profile?.full_name || auth.user?.email || null,
  };
  return actorCache;
}

/**
 * Record a staff action in the immutable audit log.
 * Never throws — auditing must not break the action it is recording.
 */
export async function logAudit(entry: AuditEntry) {
  try {
    const actor = await resolveActor();
    if (!actor?.orgId) return;

    await supabase.from("audit_logs").insert({
      organization_id: actor.orgId,
      website_id: entry.websiteId ?? null,
      actor_id: actor.userId,
      actor_name: actor.name,
      action: entry.action,
      record_type: entry.recordType ?? null,
      record_id: entry.recordId ?? null,
      previous_value: (entry.previousValue ?? null) as never,
      new_value: (entry.newValue ?? null) as never,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
    });
  } catch (error) {
    console.warn("[audit] could not record action", entry.action, error);
  }
}
