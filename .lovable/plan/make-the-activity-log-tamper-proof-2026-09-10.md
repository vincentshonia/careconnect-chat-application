# Make the activity log tamper-proof

Today the activity log is written by the browser, and the browser decides whose name goes on each entry. Any signed-in staff member could record an action under someone else's name. This change moves that decision to the database.

## What changes

1. The database now stamps every log entry with the identity of the person who is actually signed in. Anything the browser sends about who did it is ignored and replaced.
2. An entry can only be saved if it is stamped with the signed-in person's own identity — a forged one is rejected outright.
3. Existing entries can no longer be edited or erased by anyone using the app. Attempts are refused with a clear message.
4. Automated/system writes (which run with elevated backend rights and carry no signed-in person) keep working as they do now.
5. The browser code stops sending the actor fields at all.

Nothing else moves to the server in this step.

## Note on one requested field

The activity log stores the actor's id and name; there is no actor email column. The stamping will fill id and name from the caller's profile. If you also want the email recorded, say so and the plan adds that column — otherwise it is left out.

## Technical detail

**Migration (policies + trigger only, no schema change):**

- Drop and recreate `audit_insert` on `public.audit_logs` with
  `WITH CHECK (can_access_org(organization_id) AND actor_id = auth.uid())`.
- New `SECURITY DEFINER` function `public.stamp_audit_actor()` + `BEFORE INSERT` trigger on `audit_logs`:
  when `auth.uid()` is not null, set `NEW.actor_id = auth.uid()` and `NEW.actor_name` from `public.profiles.full_name`
  for that user (fallback: keep null); when `auth.uid()` is null, return `NEW` unchanged.
- New `BEFORE UPDATE OR DELETE` trigger `guard_audit_immutable()` that raises an exception whenever
  `auth.uid()` is not null or the current role is not `service_role`. There are currently no UPDATE/DELETE
  policies on the table, so this is defence in depth rather than a policy removal.

**`src/lib/audit.ts`:**

- Remove `actor_id` and `actor_name` from the insert payload.
- `resolveActor()` still resolves the org id (the row needs `organization_id`), but no longer needs the display name;
  it is trimmed to what remains in use.

**Test — `tests/rbac.test.ts`:**

- A signed-in agent inserts an audit row with `actor_id` set to a different user's id.
- Assert the insert succeeds and, read back via the service-role admin client, `actor_id` equals the agent's own id
  and `actor_name` matches their profile name.
- The row is created under a synthetic `__test_` org, so existing teardown removes it.

**Running the test:** `tests/rbac.test.ts` requires `TEST_SUPABASE_URL`, `TEST_SUPABASE_SERVICE_ROLE_KEY` and
`TEST_SUPABASE_PUBLISHABLE_KEY` (the isolation guard added earlier). Without those it fails fast rather than
touching the live database. If they are not available I will run typecheck and the unit suite, verify the new
policy and triggers directly against the database, and report the test as blocked on credentials.
