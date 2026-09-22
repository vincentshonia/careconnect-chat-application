# P6 roadmap

## A) Cross-tenant visibility
- [x] Migration: remove platform_admins rows; drop legacy user_roles + has_role(); drop unscoped private.is_super_admin(); FK cascades
- [x] staff.tsx departmentsQuery filtered by organization_id; role dropdown writes organization_memberships only
- [x] staff.functions.ts: stop writing user_roles
- [x] Staff page hides profiles with null organization_id
- [x] Vitest integration test: super_admin of org A cannot read org B departments/conversations/staff
- [x] Confirm handle_new_user grants no role; invite acceptance uses invited role only

## B) Test-data hygiene
- [x] Vitest global teardown purges synthetic orgs (not just accounts)
- [x] Playwright globalTeardown purges synthetic orgs + users
- [x] release-gate.mjs runs e2e-cleanup-verify --purge --fail-on-leak at the end; loud warning when ALLOW_INTEGRATION_TESTS_ON_PRIMARY is set

## C) Inbox landing
- [x] Tab pill counts from one count query
- [x] Default tab: Waiting > Active > All; preserve ?tab= / ?c=
- [x] Per-tab empty states with switch buttons
- [x] ?c= auto-switches to a tab containing the conversation

## Misc
- [x] Remove seed auth user dana.reyes@pacifichealthgroup.com
- [x] Gate green, publish, report

# P7 — Inbox layout + correctness
- [x] Full-height console: AdminShell owns the viewport, each inbox pane scrolls on its own; same pattern on Contacts (Intake/Notifications/Admin inherit it)
- [x] Wait/SLA timer only while a chat is open and unanswered; finished rows show "Resolved <time> by <name>" / "Abandoned <time>"
- [x] Landing tab never Closed: Waiting > Active > All; a stale ?c= for a finished chat no longer moves the tab; unit tests for the four cases
- [x] Escalation-only threads show the captured request as a visitor bubble; a repeat escalation adds no new system line and no second alert

## P8 — Visitor details panel (done)
- Shared VisitorDetailsView/Panel across Inbox, Contacts, Intake, Notifications, Quality
- escalate.ts persists metadata.page_url + after_hours
