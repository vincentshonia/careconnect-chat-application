/**
 * Canonical conversation status vocabulary.
 *
 * This is the single source of truth shared by the Inbox and by Reporting, so
 * the two can never drift apart: the values are exactly the members of the
 * database's `conversation_status` enum, in the order a conversation moves
 * through them.
 */
import type { Database } from "@/integrations/supabase/types";

export type ConversationStatus = Database["public"]["Enums"]["conversation_status"];

export const CONVERSATION_STATUSES = [
  "new",
  "waiting",
  "assigned",
  "active",
  "pending_visitor",
  "pending_internal",
  "follow_up",
  "escalated",
  "resolved",
  "closed",
  "spam",
  "archived",
  "abandoned",
] as const satisfies readonly ConversationStatus[];

/** Statuses that mean the conversation is still on the floor. */
export const OPEN_STATUSES = [
  "new",
  "waiting",
  "assigned",
  "active",
  "pending_visitor",
  "pending_internal",
  "follow_up",
  "escalated",
] as const satisfies readonly ConversationStatus[];

/** Statuses that mean a real service interaction reached an outcome. */
export const COMPLETED_STATUSES = [
  "resolved",
  "closed",
] as const satisfies readonly ConversationStatus[];

/** Traffic that is not a real service interaction and is excluded from rates. */
export const EXCLUDED_STATUSES = [
  "spam",
  "archived",
  "abandoned",
] as const satisfies readonly ConversationStatus[];

/** Statuses that mean the conversation is finished, however it ended. */
export const CLOSED_STATUSES = [
  "resolved",
  "closed",
  "archived",
  "spam",
  "abandoned",
] as const satisfies readonly ConversationStatus[];

/**
 * The single definition of "waiting for a human".
 *
 * A conversation is in the human queue when a visitor has asked for a person,
 * nobody has taken it, and it is in one of the queue statuses. The Inbox, the
 * waiting badge, the dashboard and the database claim check all derive from
 * this one description so they can never disagree.
 */
export const QUEUE_STATUSES = [
  "waiting",
  "escalated",
  "follow_up",
] as const satisfies readonly ConversationStatus[];

export const QUEUE_PREDICATE = {
  escalationRequested: true,
  assignedTo: null,
  statuses: QUEUE_STATUSES,
  /** The same rule as SQL, for migrations and documentation. */
  sql: "escalation_requested AND assigned_to IS NULL AND status IN ('waiting','escalated','follow_up')",
} as const;

/** True when a conversation row is waiting for a human to pick it up. */
export function isQueued(row: {
  escalation_requested?: boolean | null;
  assigned_to?: string | null;
  status: string;
}): boolean {
  return (
    row.escalation_requested === true &&
    !row.assigned_to &&
    (QUEUE_STATUSES as readonly string[]).includes(row.status)
  );
}

/**
 * Apply the queue rule to a PostgREST query builder. Kept generic so both the
 * Inbox list and the waiting-count badge use the identical filter.
 */
export function applyQueueFilter<
  T extends {
    eq: (column: string, value: never) => T;
    is: (column: string, value: null) => T;
    in: (column: string, values: never[]) => T;
  },
>(query: T): T {
  return (
    query
      // Console preview chats are staff testing the widget, never real traffic.
      .eq("is_preview", false as never)
      .eq("escalation_requested", true as never)
      .is("assigned_to", null)
      .in("status", QUEUE_STATUSES as never as never[])
  );
}

/** Compact "how long has this visitor waited" label, e.g. "2h 05m". */
export function waitLabel(since: string | null | undefined, now: number = Date.now()): string {
  if (!since) return "—";
  const started = new Date(since).getTime();
  if (Number.isNaN(started)) return "—";
  const minutes = Math.max(0, Math.floor((now - started) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function isConversationStatus(value: string): value is ConversationStatus {
  return (CONVERSATION_STATUSES as readonly string[]).includes(value);
}

/** Human label for a status value. */
export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
