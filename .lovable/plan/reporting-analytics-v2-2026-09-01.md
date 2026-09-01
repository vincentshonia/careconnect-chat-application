# Reporting & Analytics V2

Rebuild Reports from a single client-side summary page into a server-aggregated, permission-scoped operational reporting system with eight sections and full drill-down.

Because this is a large build, it ships in four sequenced phases. Each phase leaves the app working.

## Phase 1 — Data foundation (migration)

Nothing reliable can be reported without capturing attribution and events.

- Add to `conversations`: `resolved_by`, `resolved_at`, `closed_by`, `reopened_count`, `transfer_count`, `first_human_requested_at`, `last_visitor_message_at`, `last_agent_message_at`.
- Emit/standardize `conversation_events` types: `claimed`, `reassigned`, `transferred`, `released`, `resolved`, `closed`, `reopened`, `human_requested`, `escalated`. Transfers already store from/to department and actor — keep using that as the source of truth.
- Capture destination agent on transfer prospectively (`new_value` detail), plus a transfer note.
- Reporting indexes: `conversations(organization_id, created_at)`, `(organization_id, status)`, `(organization_id, department_id, status)`, `(organization_id, assigned_to, status)`, `(organization_id, closed_at)`; `conversation_events(organization_id, event_type, created_at)`, `(conversation_id, event_type)`, `(actor_id, event_type, created_at)`; `messages(conversation_id, sender_type, created_at)`; `intake_requests(organization_id, stage, created_at)`.
- Backfill what is reconstructable: `resolved_at`/`closed_at` from existing `closed_at`, `transfer_count` from existing transfer events. Attribution that was never recorded stays null and is labeled "not captured before this release" in the UI.
- Add a **Resolve conversation** action distinct from Close (inbox), so Resolved vs Closed is meaningful going forward.

## Phase 2 — Server-side aggregation layer

New `src/lib/reports.functions.ts` (auth-gated server functions) + SQL security-definer aggregate functions:

- `report_overview` — KPI block, funnel stages, current snapshot.
- `report_department_performance` / `report_department_backlog`
- `report_staff_performance` / `report_staff_detail` / `report_staff_workload`
- `report_tickets` (paged, sortable; open / completed variants)
- `report_transfer_activity` (overview, department matrix, detail rows, repeat-transfer set)
- `report_sla_performance` (avg + median + P50/75/90/95, breach list)
- `report_volume` (by day, hour, weekday, peak concurrency)
- `report_ai_performance`, `report_intake_performance`

Scope is resolved **server-side** from `organization_memberships` + `role_permissions` on every call; filter parameters are clamped to the caller's scope, never trusted:

| Role | Scope |
| --- | --- |
| Standard user (`reports.self`) | own metrics + conversations they may see |
| Team lead / manager (`reports.team`) | own departments only |
| Administrator / super admin (`reports.organization`) | whole organization |
| Platform roles (`reports.platform`) | per existing platform permissions |

All queries aggregate in Postgres and return only the rows the current screen needs — no more 2,000-row client pulls.

## Phase 3 — Report UI

`/reports` becomes a tabbed shell: **Overview, Departments, Staff, Tickets, Transfers, SLA & Response, AI, Requests**.

Persistent global filter bar (URL-synced so views are shareable): date range (Today → Custom, incl. quarters and YTD), department, staff member, status, priority, website, conversation type (AI only / human assisted / AI escalated), transfer status (never / once / multiple).

Per tab:
- **Overview** — KPI cards (total, open, waiting, active, resolved, closed, completed, escalated, transferred, total transfer events, avg first human response, avg wait to claim, avg resolution, SLA %, CSAT), ticket funnel with stage conversion %, current operational snapshot that refreshes in realtime, volume trend chart.
- **Departments** — performance table, backlog table with oldest open ticket and aging highlights, leaderboard, department detail drill-in.
- **Staff** — performance table, current workload/utilization table, employee detail page with period metrics and their live open ticket list.
- **Tickets** — full sortable ticket table, plus Open Tickets and Resolved/Closed views with the flagged conditions (unassigned, waiting > SLA, no staff response, stale, open > 24h).
- **Transfers** — overview stats, department-to-department matrix, transfer detail rows, repeat-transfer drill-in.
- **SLA & Response** — averages, medians, percentiles, oldest waiting/active, breach list, breakdowns by department/employee/day/hour.
- **AI** — AI vs AI-only vs escalated, conservative deflection definition (only conversations that ended without a human request *and* were not abandoned), confidence distribution, low-confidence topics, escalation destinations.
- **Requests** — intake by type and stage, department/staff/service/county/plan breakdowns, conversion rates.

Every KPI card and table cell drills through to the underlying filtered ticket list. Each KPI carries a tooltip with its exact definition. CSV export per section respects the active filters and the caller's scope, exporting detailed records rather than KPI values.

## Phase 4 — Tests and report

Vitest coverage: standard user sees only self; team lead limited to their departments; manager limited to managed departments; admin sees org; cross-org isolation; filter/parameter tampering cannot widen scope; aggregate totals reconcile against row-level ticket queries.

Final write-up: files changed, migrations, views/RPCs, indexes, permission changes, tabs, metric definitions, exports, tests, and an explicit list of metrics that only become accurate prospectively (resolution attribution, destination agent on transfer, reopen count, abandoned/unanswered classification).

## Notes

- Existing conversation, department, staff, event, intake, and permission architecture is reused — no parallel data model.
- Historical metrics are never fabricated: where an event was not previously captured, the UI shows "not captured" instead of a guessed number.
