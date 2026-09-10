# One-off cleanup script for leftover test data

Add a single new file, `scripts/purge-synthetic-tenants.mjs`, that removes leftover
test fixtures from the live database. Nothing else in the project changes.

## What I confirmed is actually there

Organizations currently in the database:

- ScaleA t53he6 (test)
- ScaleB t53he6 (test)
- Conc 28sojj (test)
- Pacific Health Group (the real one — never touched)

Test accounts currently present: 94 accounts starting with `conc-`, 1 starting with
`rbac-`, and the 6 demo accounts ending in `@careconnect-demo.test`
(standard, team lead, manager, administrator, super admin, platform owner).

Worth knowing before you approve: those 6 demo accounts sit inside **Pacific Health
Group**, so removing them also removes their staff records from the real
organization. That is the only way the real organization is affected — no real
people, conversations, or settings are altered. Say the word if you'd rather keep
them for screenshots and I'll leave that group out.

## How the script behaves

Default run (no flag): prints a dry-run table only — each organization name with its
conversation count and member count, plus the list of account emails that would be
removed, and total counts. Nothing is deleted.

With `--confirm`: performs the deletion, then reprints the same counts so before and
after are visible side by side.

Safety rules built in:

- Exits immediately if the service key or database URL is missing.
- Only the three exact names above are eligible; anything else is refused.
- An explicit guard aborts the whole run if "Pacific Health Group" ever appears in
  the delete set.
- Accounts are matched only by the three agreed patterns.
- Deletion runs in dependency order, letting the database clean up child records.

## Technical notes

- Plain Node ESM script, service-role client from `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY`, mirroring the style of the existing
  `scripts/e2e-cleanup-verify.mjs`.
- Order: staff/role/membership/platform-admin rows for matched users, then the three
  organizations (cascade clears their children), then the auth accounts themselves.
- Never prints secrets.

## Final step

Run the script without `--confirm` and show you the dry-run output. No deletions
happen until you review it and tell me to proceed.
