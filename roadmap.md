# P6 roadmap

## A) Cross-tenant visibility
- [ ] Migration: remove platform_admins rows; drop legacy user_roles + has_role(); drop unscoped private.is_super_admin(); FK cascades
- [ ] staff.tsx departmentsQuery filtered by organization_id; role dropdown writes organization_memberships only
- [ ] staff.functions.ts: stop writing user_roles
- [ ] Staff page hides profiles with null organization_id
- [ ] Vitest integration test: super_admin of org A cannot read org B departments/conversations/staff
- [ ] Confirm handle_new_user grants no role; invite acceptance uses invited role only

## B) Test-data hygiene
- [ ] Vitest global teardown purges synthetic orgs (not just accounts)
- [ ] Playwright globalTeardown purges synthetic orgs + users
- [ ] release-gate.mjs runs e2e-cleanup-verify --purge --fail-on-leak at the end; loud warning when ALLOW_INTEGRATION_TESTS_ON_PRIMARY is set

## C) Inbox landing
- [ ] Tab pill counts from one count query
- [ ] Default tab: Waiting > Active > All; preserve ?tab= / ?c=
- [ ] Per-tab empty states with switch buttons
- [ ] ?c= auto-switches to a tab containing the conversation

## Misc
- [ ] Remove seed auth user dana.reyes@pacifichealthgroup.com
- [ ] Gate green, publish, report
