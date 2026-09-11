# Lock down staff data writes, contain personal details, tune the database

Five related changes. Nothing is published.

## 1. Staff edits move to the server

Today the browser writes directly to several tables. Each of these moves behind a
server action that checks permission and records an audit entry, then the matching
browser write permission is removed so the browser can only read.

| Area (page) | Moves to server | Permission required |
| --- | --- | --- |
| Intake stage changes, assignment, notes | intake stage/assign/note actions | `workflow.manage` for stage/assignment; assignee or manager for notes |
| Contact record edits | contact update | `contact.edit` |
| Routing rules, saved replies | create/edit/delete | `workflow.manage` |
| Departments, business hours, holidays, department members | create/edit/delete | `department.manage` |
| Another person's availability and chat capacity | profile update | `staff.edit` |
| Quality reviews | review create | `quality.review` |

Left as-is on purpose: a person editing their own profile, and an agent toggling
their own availability — those already go through checks that only allow self.

## 2. Personal details stay out of visible places

- The message staff see in the chat transcript will read "Contact details captured"
  instead of repeating phone and email.
- Alert messages will link to the contact record instead of quoting phone/email.
- Phone and email continue to live only on the contact and intake records.

## 3. Tighter permission helpers

- The shared permission helpers stop honouring a "check this other person" argument
  unless the caller is a platform administrator; otherwise they always evaluate the
  signed-in user.
- The team directory now requires the "view staff" permission.
- Intake counts now respect the same visibility rules as the intake list, so a person
  can no longer see counts for records they cannot open.

## 4. Database indexes

Add the 14 requested indexes (contact/assignment/conversation lookups, audit lookups,
knowledge, websites, visitors, routing, templates, quality).

Duplicate indexes found (identical definition, different name) — the later-named copy
is dropped in each pair:

```text
ai_responses(organization_id, created_at DESC)        idx_ai_org_created | idx_ai_responses_org_created
audit_logs(organization_id, created_at DESC)          audit_logs_org_idx | idx_audit_org_created
conversation_ratings(organization_id, created_at)     conversation_ratings_org_idx | idx_conversation_ratings_org_created
conversations(organization_id, created_at DESC)       idx_conv_org_created | idx_conversations_org_created
conversations(organization_id, department_id, status) idx_conv_org_dept_status | idx_conversations_org_dept_status
conversations(org, status, last_message_at DESC)      conversations_org_idx | conversations_org_status_last_message_idx | idx_conversations_org_status_last_msg
department_members(department_id, last_assigned_at)   department_members_rr_idx | idx_department_members_dept_last
messages(conversation_id, created_at)                 idx_messages_conversation_created | messages_conv_idx
notifications(user_id, created_at DESC)               idx_notifications_user_created | notifications_user_idx
organization_memberships(organization_id, status)     idx_memberships_org_status | idx_org_memberships_org
organization_memberships(user_id, status)             idx_memberships_user_status | idx_org_memberships_user
qa_reviews(organization_id, created_at DESC)          idx_qa_reviews_org_created | qa_reviews_org_idx
rate_limits(bucket_key) unique                        rate_limits_bucket_key_idx | rate_limits_bucket_key_key
```

For the last pair the constraint-backed copy (`..._key`) is kept and the plain index
dropped, since duplicate-request protection depends on the constraint.

## 5. Legacy roles table

Grep result: nothing in the app reads `user_roles`. It is written in three places
(invitation acceptance, staff removal, role change) and referenced by one security
test and the test cleanup lists. Roles are read from the membership record.

Those writes are removed. The table itself is **kept for now** and the test/cleanup
references updated, because a database helper (`has_role`) still reads it even though
no policy currently uses that helper. Dropping the table and helper together can be a
separate, clearly-scoped change if you want it gone.

## Technical notes

- New/extended server functions in `src/lib/intake.functions.ts`, `contacts.functions.ts`,
  `routing.functions.ts`, `departments.functions.ts`, `staff.functions.ts`,
  `quality.functions.ts`, all using `resolveActor` + `requirePermission` + `writeAudit`
  from `authz.server.ts`.
- Pages updated to call them: `intake.tsx`, `contacts.tsx`, `routing.tsx`,
  `departments.tsx`, `staff.tsx`, `quality.tsx`, `inbox.tsx` (internal notes).
- Migration: replace write policies (`intake_update/insert/delete`, `intake_ev_insert`,
  `cont_insert/update/delete`, `rr_write`, `tpl_write`, `bh_write`, `hol_write`,
  `dept_write`, `deptmem_write`, `prof_admin_write`, `qa_write`, `note_insert/delete`)
  with service-role-only access; recreate the six SECURITY DEFINER helpers with the
  `_user` guard; rewrite `staff_directory` and `intake_stage_counts`; add/drop indexes.
- `src/lib/audit.ts` client helper: its now-redundant call sites are removed; the module
  is deleted once the last caller is gone (remaining callers on settings/security/
  websites/organizations/knowledge pages are checked and migrated or left with a note).
- Verification: typecheck, full unit suite, and the four integration suites with
  `ALLOW_INTEGRATION_TESTS_ON_PRIMARY=true`, plus cleanup verification. Diff shown at
  the end; anything deliberately unchanged is listed.
