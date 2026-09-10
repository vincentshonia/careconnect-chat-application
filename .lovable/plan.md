# Two database corrections in one migration

One new migration file, no application code changes.

## 1. Lock reporting functions to backend-only, and keep them that way

The reporting and knowledge-search functions run with elevated rights. Direct access was already
closed by hand in production; this writes it into a migration so a future rebuild cannot silently
reopen it, and adds a self-check that fails the migration if any of them is ever reachable from the
browser again.

## 2. Deleting an organization, website or user currently fails

The activity log is append-only, enforced by a guard. That guard misidentifies backend connections
as ordinary users, so it fires even for housekeeping the database itself performs: when an
organization, website or staff account is deleted, the database tries to blank those references on
old log entries and the guard rejects it, aborting the whole deletion.

The guard is rewritten to:
- allow backend/direct database connections;
- allow the specific housekeeping change where the only difference is one of those three references
  becoming empty (every other field must be untouched);
- keep refusing everything else exactly as today.

## 3. Three reporting definition fixes

- Assistant performance no longer counts abandoned chats in its eligible set (they already exclude
  spam and archived).
- "Breaching now" on the overview and the late flag on the ticket list now only count chats that are
  still open — a finished chat can no longer be reported as currently late.

## Technical detail

**Grants.** For the exact identity signatures:
`dashboard_metrics(uuid,uuid,uuid[],text,timestamptz,timestamptz,timestamptz,timestamptz,integer,text)`,
`report_sla(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer,text)`,
`report_volume(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,text)` —
`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` then `GRANT EXECUTE ... TO service_role`.

**Guard block.** `DO $$` scanning `pg_proc` joined to `pg_namespace` for `prosecdef` functions in
`public` whose `proname` starts with `report_`, `dashboard_`, `match_knowledge` or `replace_chunks`;
`RAISE EXCEPTION` listing any where
`has_function_privilege('anon', oid, 'EXECUTE')` or `has_function_privilege('authenticated', oid, 'EXECUTE')`.

**`guard_audit_immutable()`** — `CREATE OR REPLACE`, still `SECURITY DEFINER SET search_path = public`:

```text
claims := current_setting('request.jwt.claims', true)
if claims IS NULL or claims::jsonb->>'role' = 'service_role'  -> allow (RETURN OLD/NEW)
if TG_OP = 'UPDATE' and OLD and NEW are identical on every column
   except organization_id / website_id / actor_id, and each of those
   only changed from a value to NULL                          -> allow
otherwise RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP
   USING ERRCODE = 'insufficient_privilege'
```
Column comparison is done with `to_jsonb(OLD) - 'organization_id' - 'website_id' - 'actor_id'`
against the same projection of `NEW`, plus a per-column check that the three reference columns are
either unchanged or `NEW.x IS NULL`.

**`report_ai`** — `CREATE OR REPLACE` with the `eligible` CTE predicate changed to
`status::text NOT IN ('spam','archived','abandoned')`; the `excluded` counter widened to the same
three statuses.

**`report_overview`** — `breaching_now` gains
`AND status::text IN ('waiting','escalated','assigned','active','follow_up','pending_visitor','pending_internal')`.

**`report_tickets`** — the `sla_breached` output column and the `_flag = 'breach'` filter both gain
the same open-status list (replacing the current `NOT IN ('archived','spam')` on the flag).

**Verification after the migration**
- `bunx tsgo --noEmit`.
- Trigger proof: in one transaction, insert a `__test_` organization plus one `audit_logs` row
  referencing it, `DELETE` the organization, confirm success, then `ROLLBACK` so nothing persists.
  Output of both steps shown in the reply.
