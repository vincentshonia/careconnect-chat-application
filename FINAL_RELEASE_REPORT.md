# CareConnect — Final Release Report

> Generated automatically by `bun run release:gate`. PASS/FAIL is derived
> from process exit codes only. No credentials or secrets are recorded.

**Executed (UTC):** 2026-09-13T05:38:57.802Z
**Completed (UTC):** 2026-09-13T05:46:31.589Z
**Build identification:** 0819e53dc3debb48e068aac62c81de291d7548c9
**Node:** v22.22.0

## Overall: FAIL

## Stages

| Stage | Command | Exit code | Result |
| --- | --- | --- | --- |
| Preflight | `node scripts/release-preflight.mjs` | 0 | PASS |
| Lint | `bunx eslint .` | 0 | PASS |
| Typecheck | `bunx tsgo --noEmit` | 0 | PASS |
| Production build | `bun run build` | 0 | PASS |
| Vitest | `bunx vitest run --reporter=json --reporter=default --outputFile.json=/dev-server/.release/vitest.json` | 0 | PASS |
| Playwright E2E | `bunx playwright test --reporter=json` | 1 | FAIL |
| E2E cleanup verification | `node scripts/e2e-cleanup-verify.mjs` | — | NOT RUN |

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
| Browser E2E suite (Playwright) | FAIL |
| E2E cleanup verification | NOT RUN |

## Blocking failures

- Stage **Playwright E2E** — FAIL
- Stage **E2E cleanup verification** — NOT RUN
