# Point the integration tests at the separate test database

Today the four integration suites run against the live database with a full-access
key, and their cleanup has been leaving test organizations behind. This change makes
that impossible.

## 1. A separate test database becomes mandatory

`tests/helpers/required-env.ts` gains a shared check used by all four suites:

- Requires `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_ROLE_KEY` (plus the test
  publishable key where a suite needs the public-visitor view).
- Stops immediately with a clear message if either is missing.
- Stops immediately if the test address is the same as the live one.
- There is no fallback to the live database, ever.

All four suites — RBAC, tenant isolation, concurrency/routing, reporting
reconciliation — read only these values. Per your answer, tenant isolation moves too.

You'll need to save the two values as secrets; I'll ask for them once the code is in
place, since the suites can't run without them.

## 2. Everything a test creates is unmistakably a test record

A single shared constant `__test_` is introduced, and every organization,
department, website, profile and account the fixtures create is named or addressed
with that prefix. Cleanup then deletes strictly by prefix, behind the same
"refuse if it isn't prefixed" guard the browser tests already use. A record without
the prefix can no longer be deleted by a test, even by mistake.

No test assertion changes — only names, cleanup, and which database is used.

## 3. The release check sweeps for both prefixes

`scripts/e2e-cleanup-verify.mjs` currently looks only for `__e2e_`. It will sweep
both `__e2e_` and `__test_` across organizations, profiles, departments, websites,
conversations and accounts, and fail the release if a single record survives.

`scripts/release-preflight.mjs` additionally verifies the two `TEST_` values are
present and that the integration suites declare the `__test_` prefix with its guard.

## Technical notes

- Prefix constant lives beside `requireTestEnv` in `tests/helpers/required-env.ts`;
  suites import it rather than each defining its own.
- Cleanup order stays children-before-parents; deletes are scoped by the fixture's
  organization id and gated on a prefix re-check read back from the database.
- The cleanup verifier loops its existing count helpers over both prefixes and
  resolves conversations through the matching organizations.

## Verification

Typecheck plus the unit tests (not the integration suites, which need the new
database values) — results shown when done.
