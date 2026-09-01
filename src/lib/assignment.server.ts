/**
 * Server-only live-chat distribution.
 *
 * Round-robin: within a department, the next chat goes to the member who has
 * been waiting longest since their last assignment, skipping anyone who is not
 * available or who is already at their concurrent-chat cap. When nobody
 * qualifies the conversation stays in the shared queue for manual claiming.
 */
import { admin } from "./public-chat.server";

export const BUSY_STATUSES = [
  "assigned",
  "active",
  "pending_visitor",
  "pending_internal",
  "escalated",
];

/** Statuses a conversation may be claimed from. */
export const CLAIMABLE_STATUSES = ["new", "waiting", "escalated", "follow_up"];

export type RoutingMode = "shared_queue" | "round_robin";

export type AssignedAgent = { userId: string; fullName: string };

/**
 * How a department distributes incoming live chats.
 * `shared_queue` leaves the chat unassigned for the first eligible agent to
 * claim; `round_robin` auto-assigns. Anything else falls back to shared queue.
 */
export async function departmentRoutingMode(departmentId: string | null): Promise<RoutingMode> {
  if (!departmentId) return "shared_queue";
  const { data } = await admin()
    .from("departments")
    .select("routing_method")
    .eq("id", departmentId)
    .maybeSingle();
  return data?.routing_method === "round_robin" ? "round_robin" : "shared_queue";
}

/** Count an agent's current live workload, for concurrent-chat caps. */
export async function activeChatCount(userId: string): Promise<number> {
  const { count } = await admin()
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .in("status", BUSY_STATUSES);
  return count ?? 0;
}

/**
 * Staff eligible to be alerted, resolved entirely in PostgreSQL:
 * active organization membership + active profile + (when given) membership of
 * the department + the matching notification preference. Suspended, removed or
 * disabled people are never returned.
 */
export async function alertRecipients(
  organizationId: string,
  departmentId: string | null,
  preference: string | null = null,
): Promise<string[]> {
  const db = admin();
  const { data, error } = await db.rpc("eligible_notification_recipients", {
    _org: organizationId,
    _department: departmentId,
    _pref: preference,
  });
  if (error) {
    console.error("[notifications] recipient lookup failed", error);
    return [];
  }
  let ids = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);

  // A department with no eligible member should still reach the wider team for
  // events that genuinely need attention — but only eligible staff.
  if (ids.length === 0 && departmentId) {
    const { data: fallback } = await db.rpc("eligible_notification_recipients", {
      _org: organizationId,
      _department: null,
      _pref: preference,
    });
    ids = ((fallback ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  }
  return ids;
}

/**
 * Pick the next eligible member of a department and assign the conversation.
 *
 * Candidate selection, capacity checks and the assignment happen in a single
 * database call (`assign_round_robin`) using indexed aggregates, so routing
 * cost does not grow with the number of open conversations or staff.
 * Returns null when nobody is available — the chat then waits in the queue.
 */
export async function assignRoundRobin(input: {
  organizationId: string;
  departmentId: string | null;
  conversationId: string;
}): Promise<AssignedAgent | null> {
  if (!input.departmentId) return null;

  const { data, error } = await admin().rpc("assign_round_robin", {
    _conversation: input.conversationId,
    _department: input.departmentId,
  });
  if (error) {
    console.error("[routing] round-robin failed", error);
    return null;
  }
  const result = (data ?? {}) as { ok?: boolean; user_id?: string; full_name?: string };
  if (!result.ok || !result.user_id) return null;
  return { userId: result.user_id, fullName: result.full_name || "Agent" };
}
