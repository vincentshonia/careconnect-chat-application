import { CLOSED_STATUSES } from "@/lib/conversation-status";

/** Statuses a visitor reply can reopen. */
export const REOPENABLE_STATUSES = ["resolved", "closed", "abandoned"] as const;

export type ReopenDecision = {
  reopens: boolean;
  /** Keep the chat with its previous owner, or send it back to the queue. */
  keepAssignee: boolean;
};

/**
 * A visitor writing into a finished chat puts it back in front of a person.
 * The previous owner keeps it only while they are actually available —
 * otherwise it returns to the queue so somebody else can pick it up.
 */
export function decideReopen(input: {
  senderType: string;
  status: string;
  assignedTo: string | null;
  assigneePresence: string | null;
}): ReopenDecision {
  const reopens =
    input.senderType === "visitor" &&
    (REOPENABLE_STATUSES as readonly string[]).includes(String(input.status));
  if (!reopens) return { reopens: false, keepAssignee: true };
  const keepAssignee = Boolean(input.assignedTo) && input.assigneePresence === "available";
  return { reopens: true, keepAssignee };
}

/** True when the status means the chat is finished, however it ended. */
export function isFinished(status: string): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(status);
}
