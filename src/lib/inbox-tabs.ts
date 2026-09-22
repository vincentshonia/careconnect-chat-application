/**
 * Inbox landing rules.
 *
 * Staff reported an "empty inbox": the queue always opened on Waiting, and
 * with nobody waiting that tab renders an empty list, which reads as a broken
 * page even when there are active and closed conversations a click away.
 *
 * The two decisions that fixes — which tab to land on, and which tab contains
 * a conversation opened from a notification link — are pure functions here so
 * they can be unit tested without a browser.
 */
import { CLOSED_STATUSES, QUEUE_STATUSES } from "@/lib/conversation-status";

export type InboxTab = "waiting" | "mine" | "department" | "active" | "closed" | "all";

export const INBOX_TABS: InboxTab[] = [
  "waiting",
  "mine",
  "department",
  "active",
  "closed",
  "all",
];

export type InboxCounts = Record<InboxTab, number>;

export function isInboxTab(value: unknown): value is InboxTab {
  return typeof value === "string" && (INBOX_TABS as string[]).includes(value);
}

/**
 * Landing tab: the queue first, because a visitor waiting for a human is the
 * most urgent thing on the page — but never an empty queue.
 */
export function defaultInboxTab(counts: Partial<InboxCounts> | null | undefined): InboxTab {
  if ((counts?.waiting ?? 0) > 0) return "waiting";
  if ((counts?.active ?? 0) > 0) return "active";
  return "all";
}

type TabConversation = {
  status: string;
  assigned_to: string | null;
  department_id: string | null;
};

/**
 * The tab that actually contains a given conversation, so opening
 * `/inbox?c=<id>` never lands on a tab whose list does not include it.
 */
export function tabForConversation(
  conversation: TabConversation,
  context: { userId: string | null; departmentIds: string[]; canViewAll: boolean },
): InboxTab {
  const status = conversation.status;
  if ((CLOSED_STATUSES as readonly string[]).includes(status)) return "closed";
  if (conversation.assigned_to && conversation.assigned_to === context.userId) return "mine";
  if ((QUEUE_STATUSES as readonly string[]).includes(status) && !conversation.assigned_to) {
    return "waiting";
  }
  if (status === "active" || status === "assigned") return "active";
  if (conversation.department_id && context.departmentIds.includes(conversation.department_id)) {
    return "department";
  }
  return context.canViewAll ? "all" : "department";
}
