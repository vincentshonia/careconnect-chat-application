# Fix visitor-facing chat widget defects

Six targeted repairs to the visitor chat widget. No redesign, no new features.

## What changes for a visitor

1. **The chat survives a page change or refresh.** The conversation and the messages already on screen are remembered per website, so moving from one page to another keeps the thread. When the server says the conversation is finished, the saved copy is cleared. Every read and write to browser storage goes through one safe helper, so a Safari session with storage blocked no longer crashes the chat panel.
2. **A returning visitor stays the same visitor.** When the chat renews its session (after 12 hours, or when the server rejects the old one), it sends the previous session along. If that previous session is genuine and less than 7 days old, the server keeps the same visitor instead of creating a new one — so an older conversation no longer disappears with "Conversation not found".
3. **A finished chat says so.** While waiting for a representative, the chat reads the conversation status. If it is resolved, closed or abandoned, the panel shows "This conversation has ended" with a "Start a new chat" button and stops checking for new messages. Checking slows down from every 5 seconds to every 30 seconds after two quiet minutes, and speeds back up the moment something new arrives. Messages already on screen are no longer repeated when the waiting view opens.
4. **Pressing Enter twice cannot start two chats.** A single in-flight guard is shared by the Enter key and the send button.
5. **The rating card appears at the right time** — only once the chat is finished or a representative has actually replied — and staying dismissed is remembered for that conversation.
6. **Referral, enrollment, message and contact forms return to the chat** with a confirmation message, instead of dropping the visitor on the "connecting you" screen meant for live chat.

## Technical detail

**src/routes/widget.tsx**
- Add a module-level `safeStorage` helper (`get`/`set`/`remove`, all try/catch, SSR-safe). Replace every direct `window.localStorage` use (name key, dismissed key, session cache) with it.
- Persist `{ conversationId, messages, updatedAt }` under `phg-widget-{websiteId}-conv-v1`; hydrate on mount before the welcome bubble is added (so the welcome message is not re-appended over a restored thread); write on change; remove on ended status and on "Start a new chat".
- `ensureSession(force)` sends `priorSession` (the cached token, even if past `expiresAt`) in the POST body.
- Poll effect: keep `lastSeenByConversation` keyed by conversation id and reset when `conversationId` changes; store the poll `status`; on a terminal status set an `ended` state, clear the interval and the persisted thread. Replace `setInterval` with a self-scheduling `setTimeout` that doubles 5s → 30s after 120s with no new message and resets to 5s on any new message.
- Add `inFlightRef`; `sendQuestion` returns immediately if it is set, sets it before the request and clears it in `finally`. The Enter handler and submit button both go through `sendQuestion`.
- `SatisfactionPrompt` gains an `eligible` condition (terminal status, or at least one message with `sender_type === "agent"` seen) and initialises `dismissed` from `safeStorage` key `phg-widget-{websiteId}-rated-{conversationId}`, writing on dismiss and on submit. Remove the unconditional render in the waiting view.
- Intake `onSubmit`: for `formKind !== "live_agent"`, push a confirmation bot bubble and `setView("chat")`; `live_agent` keeps the waiting view.

**src/lib/widget-session.server.ts**
- Add `verifySessionAllowingExpiry(token, graceSeconds)` sharing the existing HMAC verification path, accepting a token whose `exp` passed less than `graceSeconds` ago (7 days) and rejecting anything else exactly as today. `verifySession` stays strict and keeps its current behaviour for all other endpoints.

**src/lib/public-chat.server.ts** (`startWidgetSession`)
- Accept `priorSession?: string | null`. When present, verify with the 7-day grace helper; if it verifies and its `wid` matches the resolved website, reuse `claims.sid` (still calling `ensureVisitor`, which updates the existing row) instead of `newSessionId()`. Any failure falls back silently to a fresh id.

**src/routes/api/public/chat/session.ts**
- Add `priorSession: z.string().max(4000).nullable().optional()` to the schema and pass it through.

**src/routes/api/public/chat/poll.ts**
- Already returns `status`; no behaviour change needed beyond confirming terminal statuses are surfaced. Touch only if the field shape needs it.

**Tests** — extend `tests/widget-session.test.ts` with grace-window verification (valid inside 7 days, rejected after, rejected when tampered), plus new pure-helper tests for the poll backoff schedule and the rating-eligibility rule extracted into small exported functions so they are testable without a DOM. Then run typecheck and the unit suite, and show the diff.

## Manual test to run afterwards
A short two-page walkthrough will be written out at the end: start a chat on page A, navigate to page B and confirm the thread is intact, close the conversation from the staff inbox and confirm the ended notice, then reopen with "Start a new chat".
