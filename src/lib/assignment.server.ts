/**
 * Server-only live-chat distribution.
 *
 * Round-robin: within a department, the next chat goes to the member who has
 * been waiting longest since their last assignment, skipping anyone who is not
 * available or who is already at their concurrent-chat cap. When nobody
 * qualifies the conversation stays in the shared queue for manual claiming.
 */
import { admin } from "./public-chat.server";

const BUSY_STATUSES = ["assigned", "active", "pending_visitor", "pending_internal", "escalated"];

export type AssignedAgent = { userId: string; fullName: string };

/** Staff who should be alerted: the department's members, or the whole org. */
export async function alertRecipients(
  organizationId: string,
  departmentId: string | null,
): Promise<string[]> {
  const db = admin();
  if (departmentId) {
    const { data: members } = await db
      .from("department_members")
      .select("user_id")
      .eq("department_id", departmentId);
    const ids = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (ids.length) return ids;
  }
  const { data: staff } = await db
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  return (staff ?? []).map((s: { id: string }) => s.id);
}

/**
 * Pick the next eligible member of a department and assign the conversation.
 * Returns null when nobody is available — the chat then waits in the queue.
 */
export async function assignRoundRobin(input: {
  organizationId: string;
  departmentId: string | null;
  conversationId: string;
}): Promise<AssignedAgent | null> {
  if (!input.departmentId) return null;
  const db = admin();

  const { data: members } = await db
    .from("department_members")
    .select("id, user_id, last_assigned_at")
    .eq("department_id", input.departmentId)
    .order("last_assigned_at", { ascending: true, nullsFirst: true });

  const rows = (members ?? []) as Array<{
    id: string;
    user_id: string;
    last_assigned_at: string | null;
  }>;
  if (!rows.length) return null;

  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name, presence, status, max_concurrent_chats")
    .in(
      "id",
      rows.map((r) => r.user_id),
    );
  const profileById = new Map(
    ((profiles ?? []) as Array<Record<string, any>>).map((p) => [p.id as string, p]),
  );

  // Current live load per agent, so we never exceed their concurrent cap.
  const { data: openConvs } = await db
    .from("conversations")
    .select("assigned_to")
    .eq("organization_id", input.organizationId)
    .in("status", BUSY_STATUSES)
    .not("assigned_to", "is", null);
  const load = new Map<string, number>();
  for (const c of (openConvs ?? []) as Array<{ assigned_to: string }>) {
    load.set(c.assigned_to, (load.get(c.assigned_to) ?? 0) + 1);
  }

  const candidate = rows.find((r) => {
    const p = profileById.get(r.user_id);
    if (!p) return false;
    if (p.status !== "active" || p.presence !== "available") return false;
    const cap = Number(p.max_concurrent_chats ?? 0);
    return cap <= 0 ? true : (load.get(r.user_id) ?? 0) < cap;
  });
  if (!candidate) return null;

  const { error } = await db
    .from("conversations")
    .update({ assigned_to: candidate.user_id, status: "assigned" })
    .eq("id", input.conversationId)
    .is("assigned_to", null); // never steal a chat someone already claimed
  if (error) return null;

  await db
    .from("department_members")
    .update({ last_assigned_at: new Date().toISOString() })
    .eq("id", candidate.id);

  const fullName = (profileById.get(candidate.user_id)?.full_name as string) || "Agent";
  return { userId: candidate.user_id, fullName };
}
