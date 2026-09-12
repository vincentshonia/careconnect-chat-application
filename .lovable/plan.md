# Removing a staff account should never fail because they own open chats

## What I confirmed in the live database first

- `conversations.assigned_to` is indeed `ON DELETE SET NULL`, and the lifecycle guard's bypass list is
  `service_role, postgres, supabase_admin` — `supabase_auth_admin` (the role the account system deletes as) is missing, so the guard blocks the delete.
- The consistency rule also rejects the result: a chat that is `active`/`assigned` must have an owner, and a `waiting`/`new` chat must have none. So rewriting the chat to `waiting` in the same step satisfies it.
- Leftover test accounts: **7**, not 329 — earlier cleanup already removed the rest. There are **12 accounts in total**, so **5 real ones** must stay untouched. Expect 7 → 0.

## 1. Database change

- Add `supabase_auth_admin` to the lifecycle guard's bypass roles.
- Add a **BEFORE UPDATE** trigger on conversations (not AFTER, so the consistency rule sees the corrected row): when the owner goes from someone to nobody while the chat is `active` or `assigned`, rewrite it to `waiting`, mark it as needing a person again, stamp the request time, and record a history entry "released — assignee removed".
- Verify by creating a throwaway test account that owns an assigned chat, deleting the account, and checking the chat is back in the waiting queue. The fixture is then removed explicitly (the account API can't be rolled back).

## 2. Offboarding path (`src/lib/staff.functions.ts`)

Before removing or disabling someone, release their open chats through the existing lifecycle routine so the chats return to the queue and the team is notified — then continue with the existing removal/disable steps.

## 3. Test teardown (`tests/helpers/required-env.ts` and suites)

- Organizations are purged **before** accounts (child rows first), both helpers check the returned error and throw instead of swallowing it, and each logs how many rows it removed.
- `tests/reporting-reconciliation.test.ts` also removes its bulk owner accounts in teardown.
- Every suite's setup is wrapped so teardown still runs when setup throws.

## 4. Cleanup script (`scripts/e2e-cleanup-verify.mjs`)

Add a `--purge` flag that, after the existing verification, deletes leaked test accounts — each one re-checked against the synthetic prefixes before deletion. Run it with `--purge` and show counts before and after.

## 5. Final verification

Run the four backend suites again, then the cleanup check, and show zero leftovers in both organizations and accounts. Run the type check and show the diff.

## Technical notes

- Trigger function stays `SECURITY DEFINER` with a pinned `search_path`; the new rewrite trigger respects the same `app.lifecycle_write` bypass so normal lifecycle writes are unaffected.
- Release in step 2 goes through `transition_conversation('release')` so the history entry and timing columns stay consistent with every other path.
- Nothing in the widget, inbox or reporting UI changes.
