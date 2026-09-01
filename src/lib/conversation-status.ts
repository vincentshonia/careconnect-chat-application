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
export const COMPLETED_STATUSES = ["resolved", "closed"] as const satisfies readonly ConversationStatus[];

/** Traffic that is not a real service interaction and is excluded from rates. */
export const EXCLUDED_STATUSES = ["spam", "archived"] as const satisfies readonly ConversationStatus[];

export function isConversationStatus(value: string): value is ConversationStatus {
  return (CONVERSATION_STATUSES as readonly string[]).includes(value);
}

/** Human label for a status value. */
export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
