# CareConnect — Production Hardening & Scalability

Executed in phases. Each phase ends with typecheck + build + tests.

## Phase 1 — Concurrency, routing & notification scale (complete)
- [x] Atomic `claim_conversation` RPC (membership, profile, presence, capacity, visibility, one winner)
- [x] `assign_round_robin` in SQL (no in-memory conversation scans)
- [x] Eligible notification recipients in SQL (active membership + active profile + prefs), batched inserts
- [x] Sidebar badges: Inbox = waiting/authorized, Notifications = unread count
- [x] Scale indexes (conversations, notifications, memberships, department_members)
- [x] Concurrency + routing tests (claim races, per-agent capacity, presence/status/department gates, round-robin capacity + revalidation + fairness, notification fan-out, transfer revalidation)


## Phase 2 — Authorization scoping
- [x] Reports role scoping (self level: section allowlist, own-data clamp, hidden tabs)
- [x] Dashboard V2 role scoping (org-wide counters stripped below org scope; empty dept scope = zero)
- [x] Waiting/Escalated filter vocabulary matches SQL (`claimable_conversation_statuses`)
- [x] Personal settings hardening (RLS: no self role/org/department/capacity edits, email locked)
- [x] Transfer/reassign eligibility (dept + active membership + presence/workload display, audited overrides)
- [x] Self-service profile freeze applies to every role (no `staff.edit` bypass on your own record)
- [x] Full authenticated RBAC matrix (agents, team lead, managers ±departments, admin, super admin, tenant B), suspension revokes a live session
- [x] RBAC + tenant isolation integration tests; repair obsolete test table names

## Phase 3 — Data-volume scale
- [x] Server-side pagination/search for the Inbox queues (25/page, DB-side tab filters)
- [x] Server-side pagination/search/filters: Staff, Contacts, Intake, Audit, drill-downs
- [x] Remove remaining `.limit(...)` client-side aggregation patterns (quality, FAQs, inbox, notifications)
- [x] Tighter realtime subscription scoping (org-scoped conversations, per-chat messages, per-user notifications)
- [x] Tenant-timezone-aware reporting/dashboard periods (DST safe)
- [x] AI reporting definitions (AI-only / escalation / helpful rates, no false "deflection")
- [x] Server-side chunked CSV exports respecting RBAC + filters
- [x] Search indexes (pg_trgm) and pagination indexes

### Phase 3 correction & verification pass (complete)
- [x] `report_ai` contract corrected: UI now reads `ai_only` / `ai_only_rate` / `escalation_rate` / `helpful_rate` / `unhelpful_rate` / `abandoned` — the dead `deflection_rate` tiles are gone, and no screen says "deflection"
- [x] `report_ai` department/website scoping: AI answers, confidence, top questions and ratings are joined through the conversations in view, so a department filter can no longer show another team's answers
- [x] Conversation status filter wired into the reports filter bar and sent to SQL (`statuses`)
- [x] CSV cells beginning `=`, `+`, `-`, `@` are neutralised against spreadsheet formula injection
- [x] Timezone/DST regression tests (`tests/org-time.test.ts`): spring-forward 23h day, fall-back 25h day, local midnight vs UTC midnight, inclusive picked ranges, equal-length comparison windows
- [x] CSV serialisation tests (`tests/csv.test.ts`)
- [x] Remaining `.limit(...)` calls audited: only three left — pending invitations (100), the SLA cron batch (500), widget message poll (100). All are bounded background/widget reads, not paginated UI lists.
- [x] Release gate: 149 tests pass, typecheck clean, production build OK

### Phase 3 gap closure (complete)
- [x] AI-only **completion** metric: eligible / completed / completion rate / escalated / abandoned, with `conversation_human_touched` proving no historical human involvement
- [x] Server-side report exports (tickets, transfers, staff, departments, SLA, intake, AI) — chunked, RBAC-scoped, 25k cap, audited
- [x] Full timezone-aware date presets (today → YTD → custom) with the organization timezone shown in the filter bar
- [x] Canonical status vocabulary (`src/lib/conversation-status.ts`) incl. archived and spam; pagination resets on any global filter change
- [x] Report filter state in the URL via TanStack Router search params (no PHI)
- [x] KPI cards drill down to the exact authorized tickets and reconcile with the overview counts
- [x] Volume suite (`tests/reporting-reconciliation.test.ts`): 2,000+ seeded conversations, page-boundary/duplicate/stable-order checks, AI completion logic, cross-tenant denial
- [x] `refresh_report_statistics()` maintenance helper (service-role only) so a bulk load does not leave the planner on stale statistics
- [x] Release gate: 171 tests pass, typecheck clean


## Phase 4 — Widget & visitor workflows
- [x] Visitor first-name personalization persistence (widget stores and greets by name)
- [x] Agent identity snapshot on historical messages (`messages.sender_name` written at send time)
- [x] `show_in_widget_team` staff flag for public avatars — default false; gates the widget team list, the in-chat agent photo, and `/api/public/staff-avatar/*`
- [x] Regression pass over website/widget config + visitor flows (widget-session, tenant-isolation, rbac suites green)
- [x] E2E golden path (visitor → AI → escalation → agent claim → reply → resolution) on a disposable `__e2e_` tenant
- [x] Remaining E2E coverage: transfer, claim exclusivity, authorization, CSAT/reporting, visitor persistence (14 specs, 3 consecutive green runs, synthetic `__e2e_` tenants purged)

