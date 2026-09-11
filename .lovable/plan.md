# One place decides a conversation's lifecycle

Today every route writes conversation status and ownership itself: the hand-off helper, the agent actions (claim, reply, reassign, resolve, close), the transfer action, the widget reopen path and the hourly abandonment sweep. Any one of them can leave a chat in a state the others do not expect. This moves all of those writes behind a single database routine, so an impossible state can no longer be written from anywhere.

## One thing to correct first

The count in the request does not match the live data. Right now the database holds:

- 2 chats marked "active" with nobody assigned (not 402)
- 27 "waiting", 5 "abandoned", 3 "closed", 2 "resolved", 3 "assigned", 1 "active" — 43 conversations in total

So the inconsistency is real but small. The guard rails are still worth adding; the clean-up step just touches 2 rows.

Also worth knowing: 2 resolved and 3 closed chats have no assignee. The proposed rule only covers active/assigned/waiting/new, so those rows stay as they are.

## What gets built

### 1. A single lifecycle routine in the database

A new routine handles the ten things that can happen to a conversation: hand-off, claim, reply, transfer, reassign, release, resolve, close, reopen, abandon.

For each one it:

- locks the conversation so two people acting at the same instant cannot both win
- checks the move is legal for the state the chat is actually in, and refuses with a plain message if not ("You cannot claim a conversation that is already resolved")
- sets every related field together — status, owner, claim time, escalation flag, the various first-response and finish timestamps, reopen time, outcome — so they can never drift apart
- writes the matching history entry

Only the backend may run it; the browser cannot call it directly.

The existing claim rules (must be available, must be in the right department, must be under capacity) stay exactly as they are — that routine keeps its checks and hands the actual write to the new one.

### 2. Clean up and lock in the rule

- The 2 "active with nobody assigned" chats become "waiting" (which is what they really are).
- A permanent rule is added: active and assigned chats must have an owner; waiting and new chats must not. Added in two steps so no existing row blocks it.

### 3. Existing code calls the routine instead of writing columns

Hand-off, the agent actions, transfer, the widget reopen path and the hourly abandonment sweep all switch to the new routine for the lifecycle write. Their permission checks, alerts, audit entries and system messages stay untouched — only the column writing moves.

### 4. Stop anything else writing those columns

A database guard rejects any change to status, owner, claim/finish timestamps, escalation flag and the transfer/reopen counters unless it comes from the backend. An assignee can still change priority, subject and tags from the console as they do today.

### 5. Tests

Added to the existing concurrency test file: claiming a resolved chat, replying to a chat nobody owns, and releasing a chat nobody owns must each fail with a clear error, and leave the row untouched.

Then: typecheck, the full test run, and the diff.

## Technical notes

- `transition_conversation(_id uuid, _event text, _actor uuid, _payload jsonb)`, `SECURITY DEFINER`, `search_path = public`, `EXECUTE` revoked from `public`/`anon`/`authenticated` and granted to `service_role` only.
- `SELECT ... FOR UPDATE` on the conversation, then a fixed `(from_status, event)` allow-list; illegal pairs `RAISE EXCEPTION` with a readable message.
- Column groups per event, including `disposition_id` validation on `resolve` (active disposition in the same organization), `first_human_requested_at` written once only, `resolved_at/closed_at` preserved across a reopen, and `reopened_at`/`reopened_count`/`transfer_count` maintained here rather than by callers.
- `claim_conversation` keeps membership/presence/department/capacity checks and its `jsonb` result shape, delegating only the `UPDATE` + event insert.
- Data fix `UPDATE ... SET status='waiting' WHERE status='active' AND assigned_to IS NULL`, then `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE CONSTRAINT`. The constraint covers only `active`/`assigned`/`waiting`/`new`; `follow_up`, `escalated`, `pending_*`, `resolved`, `closed`, `abandoned` are unconstrained.
- Callers updated: `src/lib/handoff.server.ts`, `src/lib/conversations.functions.ts` (claim, reply, reassign, resolve, close), `src/lib/routing.functions.ts` (transfer), `src/lib/public-chat.server.ts` (reopen branch in the message path), `src/routes/api/public/hooks/abandonment-sweep.ts` (per-candidate call, capped at 200 as now).
- `BEFORE UPDATE` trigger on `conversations` compares `OLD`/`NEW` on the protected columns and raises unless `auth.role() = 'service_role'`; `conv_update` RLS itself is unchanged, so priority/subject/tags edits still work for assignees and supervisors.
- Tests appended to `tests/concurrency-routing.test.ts` using the existing `__test_` fixture prefix and teardown helpers.

## Not included

- No change to reporting SQL, notifications, or the inbox UI.
- No deployment; the migration applies to the shared backend, code changes stay in preview until you publish.
