# CareConnect — Final Release Report

> Generated automatically by `bun run release:gate`. PASS/FAIL is derived
> from process exit codes only. No credentials or secrets are recorded.

**Executed (UTC):** 2026-09-02T02:55:37.402Z
**Completed (UTC):** 2026-09-02T03:05:57.314Z
**Build identification:** unavailable (no VCS metadata in this environment)
**Node:** v22.22.0

## Overall: FAIL

## Stages

| Stage | Command | Exit code | Result |
| --- | --- | --- | --- |
| Preflight | `node scripts/release-preflight.mjs` | 0 | PASS |
| Typecheck | `bunx tsgo --noEmit` | 0 | PASS |
| Production build | `bun run build` | 0 | PASS |
| Vitest | `bunx vitest run --reporter=json --reporter=default --outputFile.json=/dev-server/.release/vitest.json` | 1 | FAIL |
| Playwright E2E | `bunx playwright test --reporter=json` | — | NOT RUN |
| E2E cleanup verification | `node scripts/e2e-cleanup-verify.mjs` | — | NOT RUN |

## Vitest

- Test files: 9
- Passed: 170
- Failed: 1
- Skipped: 0
- Total: 171

## Playwright (browser E2E)

- Tests: 0
- Passed: 0
- Failed: 0
- Skipped: 0

## Required suites

| Suite | Result |
| --- | --- |
| RBAC suite (tests/rbac.test.ts) | PASS |
| Permissions suite (tests/permissions.test.ts) | PASS |
| Tenant-isolation suite (tests/tenant-isolation.test.ts) | PASS |
| Report/dashboard scope suite (tests/report-scope.test.ts) | PASS |
| Concurrency/routing suite (tests/concurrency-routing.test.ts) | PASS |
| Scale/data-volume suite (tests/reporting-reconciliation.test.ts) | FAIL |
| Widget regression suite (tests/widget-session.test.ts) | PASS |
| Browser E2E suite (Playwright) | NOT RUN |
| E2E cleanup verification | NOT RUN |

## Blocking failures

- Stage **Vitest** — FAIL
- Stage **Playwright E2E** — NOT RUN
- Stage **E2E cleanup verification** — NOT RUN
