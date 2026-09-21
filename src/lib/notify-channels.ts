/**
 * Pure helpers shared by the staff alert fan-out (in-app, email, RingCentral).
 *
 * Kept free of server imports so the gating rules can be unit-tested directly.
 */

/** Notification types that mean "a chat needs a human". Only these fan out. */
export const CHAT_ALERT_TYPES = ["escalation", "new_intake", "visitor_reply"] as const;

export type ChatAlertType = (typeof CHAT_ALERT_TYPES)[number];

export function isChatAlertType(type: string): type is ChatAlertType {
  return (CHAT_ALERT_TYPES as readonly string[]).includes(type);
}

/**
 * Email preference column per alert type. Visitor replies reuse the escalation
 * toggle, mirroring the in-app mapping — both mean someone is waiting.
 */
export const EMAIL_PREF_COLUMN: Record<ChatAlertType, string> = {
  escalation: "email_escalations",
  new_intake: "email_new_intake",
  visitor_reply: "email_escalations",
};

/** Absolute console origin used in emails and chat-room posts. */
export const CONSOLE_ORIGIN = "https://chat.mypacifichealth.com";

/** Deep link to a conversation thread, or the inbox when there is no record. */
export function consoleLink(recordType?: string | null, recordId?: string | null): string {
  if (recordType === "conversations" && recordId) {
    return `${CONSOLE_ORIGIN}/inbox?c=${recordId}`;
  }
  return `${CONSOLE_ORIGIN}/inbox`;
}

/** One-line RingCentral post. No PHI — department, reason and a link only. */
export function ringCentralText(input: {
  departmentName?: string | null;
  title: string;
  link: string;
}): string {
  const where = input.departmentName ? ` — ${input.departmentName}` : "";
  return `🟢 New visitor waiting${where}. ${input.title}. Open: ${input.link}`;
}

/** Stable key so a retried fan-out never emails the same person twice. */
export function emailIdempotencyKey(
  conversationId: string | null | undefined,
  userId: string,
  type: string,
): string {
  return `chat-alert:${conversationId ?? "none"}:${userId}:${type}`;
}
