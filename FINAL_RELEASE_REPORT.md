# CareConnect — Final Release Report

> Generated automatically by `bun run release:gate`. PASS/FAIL is derived
> from process exit codes only. No credentials or secrets are recorded.

**Executed (UTC):** 2026-09-01T20:11:06.365Z
**Completed (UTC):** 2026-09-01T20:11:09.000Z

## Overall: FAIL

## Stages

| Stage | Command | Exit code | Result |
| --- | --- | --- | --- |
| Preflight | `node scripts/release-preflight.mjs` | 1 | FAIL |
| Typecheck | `bunx tsgo --noEmit` | — | NOT RUN |
| Production build | `bun run build` | — | NOT RUN |
| Vitest | `bunx vitest run --reporter=json --reporter=default --outputFile.json=/dev-server/.release/vitest.json` | — | NOT RUN |
| Playwright E2E | `bunx playwright test --reporter=json` | — | NOT RUN |

## Vitest

- Test files: 0
- Passed: 0
- Failed: 0
- Skipped: 0
- Total: 0

## Playwright (browser E2E)

- Tests: 0
- Passed: 0
- Failed: 0
- Skipped: 0

## Required suites

| Suite | Result |
| --- | --- |
| RBAC suite (tests/rbac.test.ts) | NOT RUN |
| Permissions suite (tests/permissions.test.ts) | NOT RUN |
| Tenant-isolation suite (tests/tenant-isolation.test.ts) | NOT RUN |
| Report/dashboard scope suite (tests/report-scope.test.ts) | NOT RUN |
| Concurrency/routing suite (tests/concurrency-routing.test.ts) | NOT RUN |
| Scale/data-volume suite (tests/reporting-reconciliation.test.ts) | NOT RUN |
| Widget regression suite (tests/widget-session.test.ts) | NOT RUN |
| Browser E2E suite (Playwright) | NOT RUN |

## Blocking failures

- Stage **Preflight** — FAIL
- Stage **Typecheck** — NOT RUN
- Stage **Production build** — NOT RUN
- Stage **Vitest** — NOT RUN
- Stage **Playwright E2E** — NOT RUN
