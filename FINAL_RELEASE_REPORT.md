# CareConnect — Final Release Report

> Generated automatically by `bun run release:gate`. PASS/FAIL is derived
> from process exit codes only. No credentials or secrets are recorded.

**Executed (UTC):** 2026-09-23T18:10:33.915Z
**Completed (UTC):** 2026-09-23T18:18:04.338Z
**Build identification:** 1422902b8eb77e0c3182ce5af7d29bd8bcf95bcf
**Node:** v22.22.0

## Overall: BLOCKED

> The Playwright stage could not start in this environment: worker exited early (code 1).
> No spec was removed or skipped; the stage is BLOCKED, not passed, and the
> gate exits with code 78.

## Stages

| Stage | Command | Exit code | Result |
| --- | --- | --- | --- |
| Preflight | `node scripts/release-preflight.mjs` | 0 | PASS |
| Lint | `bunx eslint .` | 0 | PASS |
| Typecheck | `bunx tsgo --noEmit` | 0 | PASS |
| Production build | `bun run build` | 0 | PASS |
| Vitest | `bunx vitest run --reporter=json --reporter=default --outputFile.json=/dev-server/.release/vitest.json` | 0 | PASS |
| Playwright E2E | `bunx playwright test --reporter=json` | — | BLOCKED: sandbox runtime (worker exited early (code 1)) |
| E2E cleanup verification | `node scripts/e2e-cleanup-verify.mjs --purge --fail-on-leak` | 0 | PASS |

## Vitest

- Test files: 32
- Passed: 496
- Failed: 0
- Skipped: 0
- Total: 496

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
| Scale/data-volume suite (tests/reporting-reconciliation.test.ts) | PASS |
| Widget regression suite (tests/widget-session.test.ts) | PASS |
| Browser E2E suite (Playwright) | BLOCKED: sandbox runtime (worker exited early (code 1)) |
| E2E cleanup verification | PASS |

## Blocking failures

- Stage **Playwright E2E** — BLOCKED: sandbox runtime (worker exited early (code 1))
