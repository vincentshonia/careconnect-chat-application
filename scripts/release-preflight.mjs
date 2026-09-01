#!/usr/bin/env node
/**
 * CareConnect release preflight.
 *
 * Stage 1 of `bun run release:gate`. It refuses to let the gate run — and
 * therefore refuses to let a PASS be produced — unless the environment can
 * genuinely execute every mandatory suite.
 *
 * Every failure is fatal. Nothing here degrades to a warning, and nothing
 * here prints a secret value: only the *presence* of a variable is reported.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const failures = [];
const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}: ${detail}`);
}

/* ------------------------------------------------------------------ *
 * 1. Environment variables required by the mandatory suites
 * ------------------------------------------------------------------ */

/**
 * Both the Vitest integration suites and the browser E2E suite run against the
 * shared backend. The E2E suite is isolated by tenant, not by project: every
 * artefact lives inside a synthetic `__e2e_`-prefixed organization created and
 * destroyed by the fixtures.
 */
const BACKEND_ENV = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WIDGET_SESSION_SECRET",
];

function present(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "";
}

for (const name of BACKEND_ENV) {
  record(`env:${name}`, present(name), "not set (value never printed)");
}

/**
 * Safety interlock for the tenant-isolation model: the fixture module must
 * declare the `__e2e_` prefix and must guard every delete behind it, and no
 * spec may hold the service role key itself.
 */
const fixtureFile = path.join(ROOT, "tests/e2e/fixtures/e2e-fixtures.ts");
if (!existsSync(fixtureFile)) {
  record("fixtures:synthetic tenant guard", false, "tests/e2e/fixtures/e2e-fixtures.ts is absent");
} else {
  const source = readFileSync(fixtureFile, "utf8");
  record(
    "fixtures:synthetic tenant guard",
    source.includes('E2E_PREFIX = "__e2e_"') && source.includes("assertSynthetic"),
    "fixtures must declare the __e2e_ prefix and guard every destructive call with it",
  );
}
for (const spec of existsSync(path.join(ROOT, "tests/e2e"))
  ? readdirSync(path.join(ROOT, "tests/e2e")).filter((f) => f.endsWith(".spec.ts"))
  : []) {
  const source = readFileSync(path.join(ROOT, "tests/e2e", spec), "utf8");
  record(
    `spec:${spec} does not use the service role key directly`,
    !source.includes("SUPABASE_SERVICE_ROLE_KEY"),
    "the service role key belongs to the fixture module only",
  );
}

/* ------------------------------------------------------------------ *
 * 2. Required test files
 * ------------------------------------------------------------------ */

const REQUIRED_VITEST = [
  "tests/permissions.test.ts",
  "tests/rbac.test.ts",
  "tests/tenant-isolation.test.ts",
  "tests/report-scope.test.ts",
  "tests/concurrency-routing.test.ts",
  "tests/reporting-reconciliation.test.ts",
  "tests/widget-session.test.ts",
  "tests/org-time.test.ts",
  "tests/csv.test.ts",
];

const REQUIRED_E2E = [
  "playwright.config.ts",
  "tests/e2e/helpers/env.ts",
  "tests/e2e/smoke.spec.ts",
  "tests/e2e/fixtures/e2e-fixtures.ts",
  "tests/e2e/golden-path.spec.ts",
  "tests/e2e/transfer.spec.ts",
  "tests/e2e/claim-exclusivity.spec.ts",
  "tests/e2e/authorization.spec.ts",
  "tests/e2e/csat-reporting.spec.ts",
  "tests/e2e/visitor-persistence.spec.ts",
];

for (const rel of [...REQUIRED_VITEST, ...REQUIRED_E2E]) {
  record(`file:${rel}`, existsSync(path.join(ROOT, rel)), "required test file is absent");
}

/* ------------------------------------------------------------------ *
 * 3. No disabled or exclusive tests anywhere in the suites
 * ------------------------------------------------------------------ */

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const DISABLED = /\b(?:test|it|describe)\s*\.\s*(skip|only|todo|fails)\b/;
const RUNIF = /\b(?:describe|it|test)\s*\.\s*(?:runIf|skipIf)\b/;

for (const file of walk(path.join(ROOT, "tests")).filter((f) => /\.(test|spec)\.ts$/.test(f))) {
  const rel = path.relative(ROOT, file);
  const source = readFileSync(file, "utf8");
  const disabled = source.match(DISABLED);
  record(`suite:${rel} has no skipped/only tests`, !disabled, `found ${disabled?.[0]}`);
  // `describe.runIf(configured)` silently turns a missing-credentials run into
  // a green suite. That is exactly the false PASS this gate exists to stop.
  const conditional = source.match(RUNIF);
  record(
    `suite:${rel} is not conditionally disabled`,
    !conditional,
    `found ${conditional?.[0]} — a required suite may not depend on optional configuration`,
  );
}

/* ------------------------------------------------------------------ *
 * 4. Roadmap must have no unchecked production-hardening item
 * ------------------------------------------------------------------ */

const roadmapPath = path.join(ROOT, "roadmap.md");
if (!existsSync(roadmapPath)) {
  record("roadmap:present", false, "roadmap.md is missing");
} else {
  const unchecked = readFileSync(roadmapPath, "utf8")
    .split("\n")
    .filter((line) => /^\s*[-*]\s*\[\s\]/.test(line))
    .map((line) => line.trim());
  record(
    "roadmap:no unchecked items",
    unchecked.length === 0,
    `${unchecked.length} unchecked item(s): ${unchecked.join(" | ")}`,
  );
}

/* ------------------------------------------------------------------ *
 * 5. Live checks: database reachability and a real Chromium launch
 * ------------------------------------------------------------------ */

async function checkDatabase(label, urlVar, keyVar) {
  if (!present(urlVar) || !present(keyVar)) {
    record(`db:${label} reachable`, false, "credentials missing, connectivity unverifiable");
    return;
  }
  try {
    const response = await fetch(`${process.env[urlVar].replace(/\/$/, "")}/rest/v1/`, {
      headers: { apikey: process.env[keyVar] },
      signal: AbortSignal.timeout(15_000),
    });
    record(`db:${label} reachable`, response.status < 500, `HTTP ${response.status}`);
  } catch (error) {
    record(`db:${label} reachable`, false, error instanceof Error ? error.message : "unreachable");
  }
}

await checkDatabase("vitest backend", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY");


try {
  const { ensureBrowserLibraryPath } = await import("../tests/e2e/helpers/browser-libs.ts");
  ensureBrowserLibraryPath();
} catch {
  /* helper is a sandbox convenience; its absence is caught by the launch below */
}

try {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const version = browser.version();
  await browser.close();
  record("browser:chromium launches", true, version);
} catch (error) {
  record(
    "browser:chromium launches",
    false,
    error instanceof Error ? error.message.split("\n")[0] : "launch failed",
  );
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.ok ? "" : ` — ${check.detail}`}`);
}

if (failures.length > 0) {
  console.error(`\nRELEASE PREFLIGHT FAILED — ${failures.length} blocking issue(s).`);
  process.exit(1);
}
console.log("\nRELEASE PREFLIGHT PASSED");
