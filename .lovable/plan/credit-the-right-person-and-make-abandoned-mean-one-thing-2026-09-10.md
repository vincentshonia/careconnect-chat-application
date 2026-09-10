# Credit the right person, and make "abandoned" mean one thing

Today a staff member's reporting numbers are attached to whoever the chat is assigned to *right now*. Reassign a chat and the new owner inherits the old owner's response time, handle time, SLA result and satisfaction score. This fixes the crediting, tightens the transfer rules, puts satisfaction back on the 1–5 scale, and makes the "Abandoned" tile agree with the list behind it.

## 1. Staff numbers follow who did the work

Rebuild the per-person figures in `report_staff` from the recorded history of each chat instead of its current owner:

- Time to claim — credited to the person who claimed it (`claimed` event).
- First reply time and the reply-target result — credited to the first person who actually replied (first agent message / `agent first reply` event).
- Handle time and the visitor's rating — credited to the person who resolved it (`resolved` event actor).
- Transferred count — credited to the person who initiated the transfer.

Claimed, resolved, closed and message counts already come from events and stay exactly as they are.

## 2. Transfers can't leave a stale owner behind

- Transferring to another department also clears the claim time, and is refused unless the chat is open (waiting, assigned, active or follow-up). Otherwise: "Only open conversations can be transferred".
- Reassigning to another person only succeeds if nobody else changed the owner in the meantime; if they did, the person sees a clear "This conversation was reassigned by someone else — reload and try again" instead of silently overwriting.
- Reassigning is refused on resolved, closed or abandoned chats.
- Sending a chat back to the queue also marks it as waiting for a person, so it shows up in the queue count.

## 3. Satisfaction reads on the same scale everywhere

The Quality page currently shows satisfaction as a percentage while every other screen uses 1–5. The summary returns the plain average and Quality shows "4.3 / 5".

## 4. One definition of "Abandoned"

Both the Abandoned tile and the list it opens use: a visitor asked for a person, no agent ever replied, and the chat ended (closed or abandoned).

## Technical notes

- One migration recreates `report_staff` (event-sourced `claim`/`first reply`/`resolver` CTEs joined to `people`, replacing the `owned`/`csat` CTEs' use of `c.assigned_to` for `avg_response`, `avg_claim`, `avg_handle`, `sla_pct`, `csat`, `transferred`; `assigned_count`/`open_count`/`active_count`/`live_open` stay owner-based since they describe current workload), `quality_summary` (`round(avg(score),1)`, dropping `* 20`), and `report_overview` (`abandoned` KPI → `escalation_requested AND first_agent_response_at IS NULL AND status IN ('closed','abandoned')`) plus `report_tickets`' matching drill flag.
- `src/lib/routing.functions.ts` `transferConversationFn`: status guard from the existing read (widen the select to `status`), `claimed_at: null` in the update.
- `src/lib/conversations.functions.ts` `reassignConversationFn`: refuse terminal statuses; change the update to `.is`/`.eq` on `assigned_to` matching the value read (null-safe), `.select("id")`, throw when zero rows come back; release path adds `escalation_requested: true`.
- `src/routes/_authenticated/quality.tsx`: CSAT stat renders `x.x / 5`.
- Test: `tests/reporting-reconciliation.test.ts` gains a case seeding a chat answered by agent A, reassigned to agent B, then asserting `report_staff` gives A the first-response time and SLA credit and gives B none. That suite needs the dedicated test backend credentials (`TEST_SUPABASE_URL`, `TEST_SUPABASE_SERVICE_ROLE_KEY`); without them it fails fast by design, so I'll report that rather than run it against production.
- Then typecheck, the unit suites, a production build, and the diff.
