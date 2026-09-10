/**
 * Small browser-side helpers for the public chat widget.
 *
 * They live outside the component so the rules that were previously buried in
 * effects (when a chat has ended, how fast to poll, when to ask for a rating,
 * whether storage is usable at all) can be unit-tested without a DOM.
 */

/** Conversation statuses where the visitor can no longer take part. */
export const TERMINAL_STATUSES = ["resolved", "closed", "abandoned"] as const;

export function isConversationEnded(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.includes(String(status ?? "") as (typeof TERMINAL_STATUSES)[number]);
}

/* ------------------------------- polling ------------------------------- */

export const POLL_MIN_MS = 5_000;
export const POLL_MAX_MS = 30_000;
/** How long a conversation must stay quiet before polling slows down. */
export const POLL_QUIET_MS = 120_000;

/**
 * @param currentMs           the delay just used
 * @param msSinceLastMessage  how long since the last new message arrived
 */
export function nextPollDelay(currentMs: number, msSinceLastMessage: number): number {
  if (msSinceLastMessage < POLL_QUIET_MS) return POLL_MIN_MS;
  const doubled = Math.max(currentMs, POLL_MIN_MS) * 2;
  return Math.min(Math.max(doubled, POLL_MIN_MS), POLL_MAX_MS);
}

/* ------------------------------- rating -------------------------------- */

/**
 * The rating card is only honest once there is something to rate: the chat is
 * over, or a human actually replied.
 */
export function shouldShowRating(opts: {
  conversationId: string | null;
  status: string | null | undefined;
  agentReplied: boolean;
  dismissed: boolean;
  sending: boolean;
}): boolean {
  if (!opts.conversationId || opts.dismissed || opts.sending) return false;
  return isConversationEnded(opts.status) || opts.agentReplied;
}

/* ------------------------------- storage ------------------------------- */

/**
 * localStorage that cannot throw. Safari with storage blocked (Lockdown mode,
 * "Prevent cross-site tracking" inside an iframe, private browsing quota)
 * throws on plain access, which used to take the whole widget down.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — the widget still works, it just forgets */
    }
  },
  remove(key: string): void {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
  getJson<T>(key: string): T | null {
    const raw = safeStorage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJson(key: string, value: unknown): void {
    try {
      safeStorage.set(key, JSON.stringify(value));
    } catch {
      /* value not serializable */
    }
  },
};
