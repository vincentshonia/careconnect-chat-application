# Report days in Pacific time, not UTC

Right now the reports group activity by UTC calendar days and hours while the screen says "Times shown in America/Los_Angeles". A chat that happened at 11:30 pm Pacific is counted on the next day, and evening hours land in the wrong hourly bar. This fixes the grouping, the on-screen times, and one number that disagrees between the Dashboard and Reports.

## What changes

### 1. Group by the organization's day, in the database

Confirmed by inspecting the live report functions, only three group by day or hour:

- `report_volume` — by day, by hour, by weekday, peak day
- `report_sla` — by day, by hour
- `dashboard_metrics` — trend buckets (day or hour), plus a "today" boundary

Each gets a new `_tz` text argument. Day/hour grouping and the `to_char` labels are computed at that zone (`date_trunc('day', created_at AT TIME ZONE _tz)`, `EXTRACT(HOUR FROM created_at AT TIME ZONE _tz)`), and the old versions are dropped so only one version of each remains.

`dashboard_staff_performance` and the other `report_*` functions do not bucket by day or hour, so they are left alone.

### 2. Dashboard and Reports agree on first-response time

`dashboard_metrics` currently measures the wait from `first_human_requested_at` or, failing that, the chat's start time. The Reports functions use `first_human_requested_at`, then `requested_agent_at`, then start time. The Dashboard is changed to the same three-step rule, so first-response and time-to-claim match between the two screens.

### 3. Times on screen follow the organization's timezone

Every date shown in the staff console is rendered through the shared timezone formatter using the organization's timezone, instead of the viewer's own device clock. Affected screens: Inbox, Intake, Contacts, Notifications, Audit, Knowledge, Quality, Staff, Training, and the report charts/tables.

Number formatting (counts like "1,204") is untouched — only dates and times change.

### 4. Overdue intake requests

There is no overdue marker on intake requests today. One is added: a request is overdue when its due date is before today's date in the organization's timezone, shown as a badge in the request list and on the open request.

## Technical notes

- One migration recreates `report_volume`, `report_sla` and `dashboard_metrics` with a trailing `_tz text` parameter (default `'America/Los_Angeles'`), drops the previous overloads, and keeps existing grants/security settings.
- `src/lib/dashboard.functions.ts` already resolves the org timezone via `safeTimeZone`; it passes it as `_tz`. `src/lib/reports.functions.ts` reads `organizations.timezone` alongside the SLA target it already fetches per request and passes `_tz` through `buildCall` for both the interactive run and the CSV export.
- `src/lib/org-time.ts` gains date-only and time-only companions to `formatInZone` so screens showing just a date or just a clock time keep their current shape, plus a helper returning today's `YYYY-MM-DD` in a zone for the overdue check.
- Components read the timezone from `useSessionContext()`, which already exposes it.
- `tests/reporting-reconciliation.test.ts` gains a case: a conversation created at 23:30 Pacific must appear in that Pacific day's bucket, not the following UTC day. This suite requires the dedicated test backend credentials (`TEST_SUPABASE_URL` / `TEST_SUPABASE_SERVICE_ROLE_KEY`); without them it fails fast by design, so the assertion may not be executable here — the pure timezone helpers get unit coverage that runs regardless.
- Typecheck, unit tests and a production build run at the end, followed by the diff.
