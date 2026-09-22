/**
 * Layout rules for a conversation thread, shared by every screen that renders
 * messages so the sides never drift apart.
 *
 * The person the team is helping sits on the left; everything the organisation
 * sends — a live agent's reply or the assistant's answer — sits on the right,
 * the way a phone messaging app reads. System notes are centred.
 */

export type ThreadSender = "visitor" | "agent" | "ai" | "system" | (string & {});

/** True when the message was sent by the organisation (agent or assistant). */
export function isOutboundSender(senderType: ThreadSender): boolean {
  return senderType === "agent" || senderType === "ai";
}

/** Classes for the row wrapper: avatar side and horizontal alignment. */
export function threadRowClass(senderType: ThreadSender): string {
  return isOutboundSender(senderType)
    ? "flex items-end gap-2 flex-row-reverse justify-start text-right"
    : "flex items-end gap-2 justify-start";
}

/** Classes for the bubble itself: width cap and tint. */
export function threadBubbleClass(senderType: ThreadSender): string {
  const base = "max-w-[72%] rounded-2xl border px-3 py-2 text-sm text-foreground";
  if (isOutboundSender(senderType)) return `${base} border-primary/25 bg-primary/10 text-left`;
  return `${base} border-border bg-muted/70`;
}

/** Classes for the small author/timestamp line above the message text. */
export function threadMetaClass(senderType: ThreadSender): string {
  return `mb-1 flex items-center gap-1.5 text-xs text-muted-foreground ${
    isOutboundSender(senderType) ? "justify-end" : ""
  }`;
}
