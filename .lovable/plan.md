# No changes needed — both items verified as already safe

Both requested fixes describe things that are not present in this project. Verified directly against the live database and the current code.

## 1. Client-write access rules

- There is no `org_settings` table and no `staff_role_history` table.
- `departments` already has no staff-side create/edit/delete rules — only viewing. All department changes go through server-side functions.
- The remaining tables staff can write to directly (chat conversations and messages, their own notifications, their own profile, training progress and review flags, organisation records, activity log, AI answer feedback) are intentional and stay as they are, per your decision.

## 2. Role assignment

- There is no `admin.server.ts`, and no `provisionUser` or `reassignUser`.
- A person's role lives on their organisation membership record and is changed with a single update, so there is no delete-then-insert gap and nobody can end up without a role.
- The older `user_roles` table is only cleared when someone is removed from the team, alongside their department membership.

## Outcome

No code or database changes. Nothing to test or migrate.
