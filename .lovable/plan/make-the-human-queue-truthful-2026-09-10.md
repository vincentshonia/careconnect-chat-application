# Make the human queue truthful

Three changes so "waiting for a person" means the same thing everywhere, stale chats stop sitting in the queue forever, and a visitor who writes back after a chat was finished gets a person again.

## 1. One definition of "waiting for a person"

New shared rule in `src/lib/conversation-status.ts`:

> a visitor asked for a person, nobody has taken the chat, and the chat is in Waiting, Escalated or Follow-up.

Chats the assistant is still handling on its own no longer appear in the queue anywhere (your choice: drop them entirely).

Places updated to use it:
- Inbox Waiting tab — its own private copies of the status lists are deleted.
- The waiting badge in the sidebar.
- The dashboard "available to claim" list and the Waiting / department-waiting figures.
- The database claim check, so the screen and the database agree on what can be picked up.

The Waiting tab is re-ordered longest-wait-first (by when the person was requested, chat reference as tiebreaker) and gains a **Waiting** column showing how long each visitor has been waiting.

## 2. Hourly abandonment sweep

A chat where nobody ever asked for a person, still in its opening state, with no activity for 24 hours, is marked **Abandoned** and closed automatically, with a note on the chat's history saying it was closed automatically.

- Runs every hour, using the same protected internal endpoint pattern as the existing response-time sweep.
- "Abandoned" is added as a real status everywhere it needs to exist.
- Reports and the dashboard exclude it from "completed" and from "handled by the assistant", so the drop-off never inflates success numbers.

## 3. Reopening a finished chat

When a visitor writes into a chat that was resolved, closed or abandoned:
- it moves to Follow-up, is marked as needing a person, and the wait clock starts now;
- if the agent who previously handled it is not currently available, the chat goes back to the queue for anyone to take; if they are available it stays with them;
- that agent (or the whole department) is alerted;
- the original resolution and closing times are preserved, and a new "reopened" time is recorded instead of wiping them.

## Technical notes

- `src/lib/conversation-status.ts`: export `QUEUE_PREDICATE` (a typed descriptor: `escalation_requested = true AND assigned_to IS NULL AND status IN ('waiting','escalated','follow_up')`) plus a small `applyQueueFilter(query)` helper for PostgREST callers, and add `abandoned` to `CONVERSATION_STATUSES` / `EXCLUDED_STATUSES`.
- Consumers: `src/routes/_authenticated/inbox.tsx` (delete local `CLAIMABLE_STATUSES`/`OPEN_STATUSES`, use shared lists; Waiting tab orders by `requested_agent_at` asc then `id`, selects `requested_agent_at`, renders a wait-time cell), `src/hooks/use-waiting-count.ts`, and `src/lib/dashboard.functions.ts` (no local list — the SQL is authoritative).
- Migration:
  - `ALTER TYPE conversation_status ADD VALUE IF NOT EXISTS 'abandoned'` in its own statement, then a second migration statement for the functions (Postgres cannot use a new enum value in the same transaction).
  - Recreate `claimable_conversation_statuses()` as `{waiting,escalated,follow_up}` and add the `escalation_requested AND assigned_to IS NULL` test to `claim_conversation`.
  - Recreate `dashboard_metrics` with `org_waiting`, `dept_waiting` and the `available` list all using the predicate; exclude `abandoned` from `open_statuses`, `completed` and AI-containment counts.
  - Recreate the reporting functions that count `completed` / `ai_only` so `status <> 'abandoned'`.
  - Add `conversations.reopened_at timestamptz`.
  - Insert an `abandonment_sweep` row into `internal_tokens` and `cron.schedule('conversation-abandonment-sweep', '0 * * * *', …)` posting to the new endpoint (hourly; worst-case a chat is marked abandoned up to an hour after the 24h mark — hourly keeps recurring database cost low).
- New route `src/routes/api/public/hooks/abandonment-sweep.ts`, mirroring `sla-check.ts` (shared-secret gate against `internal_tokens`, service-role client, batch limit, inserts `conversation_events` rows of type `auto_abandoned`).
- `src/lib/public-chat.server.ts` `insertMessage`: extend the reopen branch to `resolved | closed | abandoned`, set `status='follow_up'`, `escalation_requested=true`, `requested_agent_at=now()`, `reopened_at=now()`, keep `resolved_at`/`closed_at`, look up the previous assignee's `profiles.presence` and null `assigned_to` when they are not `available`, then `notifyStaff({ type: 'escalation', userIds: [assignee] })` or department-wide.
- Tests: unit tests for the predicate/status lists and the reopen decision helper (pure function extracted for the presence/assignment rule), plus a wait-time formatting check. Then `bunx tsgo --noEmit`, the unit suite, and a production build; the diff and the migration SQL are shown at the end.

Nothing else is touched, and nothing is published.
