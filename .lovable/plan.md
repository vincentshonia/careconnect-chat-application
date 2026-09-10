# Inbox improvements for daily agent use (P6.1)

Scope: only the six items in P6.1. The later stages you pasted (P6.2, P7.x, P8.x) stay queued and are not touched here.

## What changes for agents

1. **Saved replies** — Typing `/` in the reply box opens a shortcut list of the organization's approved templates; typing more letters filters it and Enter inserts the wording, with the visitor's name and the agent's name filled in. A "Templates" button next to Send opens the same list with a search box, for people who prefer clicking.

2. **Header status** — The agent's own availability (available / away / busy) becomes a toggle in the header, next to a live "3 of 5 chats" capacity count.

3. **Claim tells you why it is off** — Instead of clicking Claim and getting a failure message, the button is disabled and its tooltip states the reason: "You're not marked available", "You're at your chat limit", or "This chat belongs to a department you're not in".

4. **Queue rows show urgency** — Each waiting row gains a live-counting wait time, an SLA countdown that turns amber then red past the organization's target, the priority and department, and a dot when the visitor has sent something unread. The Waiting tab's longest-wait-first ordering is verified rather than rebuilt.

5. **Visitor replies notify the owner** — When a visitor writes back on a chat that already has an assigned agent, that agent gets a notification, and clicking it opens the exact chat. Every existing inbox notification link is updated to open its own chat instead of the inbox list.

6. **Freshness and transfer** — The open conversation refreshes every 15 seconds and after any action (claim, reply, resolve, close, transfer, reassign), so two agents never see different states. The search box waits for a pause in typing instead of querying every keystroke. Transfer moves from an easy-to-mis-click dropdown to a "Transfer…" button with a small confirm dialog that also lets the agent add a note for the receiving team.

## Technical notes

- `src/routes/_authenticated/inbox.tsx` — all UI work: template autocomplete + picker, presence toggle and capacity in the header, claim-eligibility derivation with tooltip reasons, queue row metadata (wait timer via a 1s ticker, SLA countdown against `organizations.sla_first_response_minutes` using existing `src/lib/sla.ts` helpers), `useDebounced` on search, `refetchInterval: 15_000` on the `["conversation", activeId]` query, `["conversation", activeId]` added to every mutation's invalidations, and the transfer dialog.
- Templates query: `response_templates` filtered to the org, `approved = true`, ordered by `shortcut`; substitution of `{visitor_name}` / `{agent_name}` in a small pure helper (`src/lib/templates.ts`) so it is unit-testable.
- Pagination gets an `id` tiebreaker on the non-waiting ordering (`last_message_at desc, id desc`); the waiting branch already has one.
- Presence/capacity writes reuse the existing self-profile update path (`profiles.presence`); no new policy needed for self-updates.
- `src/lib/public-chat.server.ts` `insertMessage`: on `sender_type = 'visitor'` with `conversations.assigned_to` set, call `notifyStaff` with type `visitor_reply`, severity `info`, link `/inbox?c={conversationId}`.
- Link fix in `conversations.functions.ts:391`, `handoff.server.ts:197,210`, `routing.functions.ts:116,129`, `public-chat.server.ts:503`, plus the `escalate.ts` and `rate.ts` notifications — each becomes `/inbox?c={conversationId}`.
- Transfer dialog sends the optional note through the existing `transferConversationFn` note parameter.
- No schema migration is required for P6.1.

## Tests

- New unit tests for template substitution and shortcut matching, and for the claim-eligibility reason helper (pure function, extracted so it can be tested without the page).
- Existing suites re-run: typecheck, unit/non-integration Vitest, production build.

## Not included

Disposition on resolve, internal notes pane, error-state/Retry work, quality page changes, the state-machine migration, MFA/origin hardening, and the launch-readiness panel — all later prompts in your list.
