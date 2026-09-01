# CareConnect — Production Hardening & Scalability

Executed in phases. Each phase ends with typecheck + build + tests.

## Phase 1 — Concurrency, routing & notification scale (in progress)
- [x] Atomic `claim_conversation` RPC (membership, profile, presence, capacity, visibility, one winner)
- [x] `assign_round_robin` in SQL (no in-memory conversation scans)
- [x] Eligible notification recipients in SQL (active membership + active profile + prefs), batched inserts
- [x] Sidebar badges: Inbox = waiting/authorized, Notifications = unread count
- [x] Scale indexes (conversations, notifications, memberships, department_members)
- [ ] Concurrency + routing tests


## Phase 2 — Authorization scoping
- [x] Reports role scoping (self level: section allowlist, own-data clamp, hidden tabs)
- [x] Dashboard V2 role scoping (org-wide counters stripped below org scope; empty dept scope = zero)
- [x] Waiting/Escalated filter vocabulary matches SQL (`claimable_conversation_statuses`)
- [x] Personal settings hardening (RLS: no self role/org/department/capacity edits, email locked)
- [x] Transfer/reassign eligibility (dept + active membership + presence/workload display, audited overrides)
- [x] RBAC + tenant isolation integration tests; repair obsolete test table names

## Phase 3 — Data-volume scale
- [x] Server-side pagination/search for the Inbox queues (25/page, DB-side tab filters)
- [ ] Server-side pagination/search/filters: Staff, Contacts, Intake, drill-downs
- [ ] Remove remaining `.limit(100/200/2000)` client-side aggregation patterns
- [ ] Tighter realtime subscription scoping
- [ ] Tenant-timezone-aware reporting periods
- [ ] AI reporting definitions (no false "deflection")


## Phase 4 — Widget & visitor workflows
- [ ] Visitor first-name personalization persistence
- [ ] Agent identity snapshot on historical messages
- [ ] `show_in_widget_team` staff flag for public avatars
- [ ] Regression pass over website/widget config + visitor flows
- [ ] Scale fixture generator + E2E flow tests
