import { CLOSED_STATUSES } from "@/lib/conversation-status";

/** Statuses a visitor reply can reopen. */
export const REOPENABLE_STATUSES = ["resolved", "closed", "abandoned"] as const;

export type ReopenDecision = {
  reopens: boolean;
  /** Put the chat back in front of a person, rather than back to the assistant. */
  toHuman: boolean;
  /** Keep the chat with its previous owner, or send it back to the queue. */
  keepAssignee: boolean;
};

/**
 * A visitor writing into a finished chat reopens it. It only re-enters the
 * human queue when a person was involved before (`first_human_requested_at`
 * is set); otherwise the assistant picks the thread back up. The previous
 * owner keeps it only while they are actually available.
 */
export function decideReopen(input: {
  senderType: string;
  status: string;
  assignedTo: string | null;
  assigneePresence: string | null;
  firstHumanRequestedAt?: string | null;
}): ReopenDecision {
  const reopens =
    input.senderType === "visitor" &&
    (REOPENABLE_STATUSES as readonly string[]).includes(String(input.status));
  if (!reopens) return { reopens: false, toHuman: false, keepAssignee: true };
  const toHuman = Boolean(input.firstHumanRequestedAt);
  const keepAssignee =
    toHuman && Boolean(input.assignedTo) && input.assigneePresence === "available";
  return { reopens: true, toHuman, keepAssignee };
}

/** True when the status means the chat is finished, however it ended. */
export function isFinished(status: string): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(status);
}
