#!/usr/bin/env node
/**
 * CareConnect release gate — the sole technical authority for whether the
 * application is a production release candidate.
 *
 * Stages run sequentially and every mandatory stage must exit 0:
 *   1. release preflight        5. Playwright browser E2E suite
 *   2. typecheck                6. release report generation
 *   3. production build
 *   4. complete Vitest suite
 *
 * PASS/FAIL is derived exclusively from the recorded process exit codes.
 * Generating the report is not, and can never be, evidence of success: the
 * final verdict is computed from the stage results before the report is
 * written, and the process exits with that verdict.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ARTIFACTS = path.join(ROOT, ".release");
const VITEST_JSON = path.join(ARTIFACTS, "vitest.json");
const PLAYWRIGHT_JSON = path.join(ARTIFACTS, "playwright.json");

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const startedAt = new Date().toISOString();
const stages = [];

function run(command, args, env = {}) {
  return new Promise((resolve) => {
    console.log(`\n=== ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

/** Runs a mandatory stage; later stages are skipped once one has failed. */
async function stage(name, command, args, env) {
  const commandLine = `${command} ${args.join(" ")}`;
  if (stages.some((s) => s.exitCode !== 0)) {
    stages.push({ name, command: commandLine, exitCode: null, status: "NOT RUN" });
    return null;
  }
  const exitCode = await run(command, args, env);
  stages.push({ name, command: commandLine, exitCode, status: exitCode === 0 ? "PASS" : "FAIL" });
  return exitCode;
}

await stage("Preflight", "node", ["scripts/release-preflight.mjs"]);
await stage("Typecheck", "bunx", ["tsgo", "--noEmit"]);
await stage("Production build", "bun", ["run", "build"]);
await stage("Vitest", "bunx", [
  "vitest",
  "run",
  "--reporter=json",
  "--reporter=default",
  `--outputFile.json=${VITEST_JSON}`,
]);
await stage("Playwright E2E", "bunx", ["playwright", "test", "--reporter=json"], {
  PLAYWRIGHT_JSON_OUTPUT_NAME: PLAYWRIGHT_JSON,
  PLAYWRIGHT_JSON_OUTPUT_FILE: PLAYWRIGHT_JSON,
});
await stage("E2E cleanup verification", "node", ["scripts/e2e-cleanup-verify.mjs"]);

/* ------------------------------------------------------------------ *
 * Result extraction (best effort — absence of a report is itself a FAIL
 * for the stage that should have produced it, recorded above)
 * ------------------------------------------------------------------ */

function readJson(file) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  } catch {
    return null;
  }
}

const vitestRaw = readJson(VITEST_JSON);
const vitest = {
  files: vitestRaw?.testResults?.length ?? 0,
  passed: vitestRaw?.numPassedTests ?? 0,
  failed: vitestRaw?.numFailedTests ?? 0,
  skipped: (vitestRaw?.numPendingTests ?? 0) + (vitestRaw?.numTodoTests ?? 0),
  total: vitestRaw?.numTotalTests ?? 0,
  perFile: new Map(
    (vitestRaw?.testResults ?? []).map((f) => [path.basename(f.name ?? ""), f.status ?? "unknown"]),
  ),
};

function flattenSpecs(suite, out = []) {
  for (const spec of suite.specs ?? []) out.push({ file: suite.file ?? spec.file ?? "", spec });
  for (const child of suite.suites ?? []) flattenSpecs(child, out);
  return out;
}

const pwRaw = readJson(PLAYWRIGHT_JSON);
const pwSpecs = (pwRaw?.suites ?? []).flatMap((s) => flattenSpecs(s));
const playwright = {
  total: pwRaw?.stats?.expected != null
    ? (pwRaw.stats.expected ?? 0) + (pwRaw.stats.unexpected ?? 0) + (pwRaw.stats.flaky ?? 0) + (pwRaw.stats.skipped ?? 0)
    : pwSpecs.length,
  passed: pwRaw?.stats?.expected ?? 0,
  failed: (pwRaw?.stats?.unexpected ?? 0) + (pwRaw?.stats?.flaky ?? 0),
  skipped: pwRaw?.stats?.skipped ?? 0,
};

function vitestSuite(fileName) {
  const status = vitest.perFile.get(fileName);
  if (!status) return "NOT RUN";
  return status === "passed" ? "PASS" : "FAIL";
}

const suiteResults = [
  ["RBAC suite (tests/rbac.test.ts)", vitestSuite("rbac.test.ts")],
  ["Permissions suite (tests/permissions.test.ts)", vitestSuite("permissions.test.ts")],
  ["Tenant-isolation suite (tests/tenant-isolation.test.ts)", vitestSuite("tenant-isolation.test.ts")],
  ["Report/dashboard scope suite (tests/report-scope.test.ts)", vitestSuite("report-scope.test.ts")],
  ["Concurrency/routing suite (tests/concurrency-routing.test.ts)", vitestSuite("concurrency-routing.test.ts")],
  ["Scale/data-volume suite (tests/reporting-reconciliation.test.ts)", vitestSuite("reporting-reconciliation.test.ts")],
  ["Widget regression suite (tests/widget-session.test.ts)", vitestSuite("widget-session.test.ts")],
  [
    "Browser E2E suite (Playwright)",
    stages.find((s) => s.name === "Playwright E2E")?.status ?? "NOT RUN",
  ],
  [
    "E2E cleanup verification",
    stages.find((s) => s.name === "E2E cleanup verification")?.status ?? "NOT RUN",
  ],
];

/** Build identification — best effort, never fatal. */
function buildIdentity() {
  const fromEnv =
    process.env["LOVABLE_COMMIT_SHA"] ??
    process.env["GIT_COMMIT"] ??
    process.env["COMMIT_SHA"] ??
    null;
  if (fromEnv) return fromEnv;
  try {
    const head = readFileSync(path.join(ROOT, ".git", "HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5).trim();
      return `${ref} @ ${readFileSync(path.join(ROOT, ".git", ref), "utf8").trim()}`;
    }
    return head;
  } catch {
    return "unavailable (no VCS metadata in this environment)";
  }
}

/* ------------------------------------------------------------------ *
 * Verdict — computed from exit codes only
 * ------------------------------------------------------------------ */

const stageFailures = stages.filter((s) => s.status !== "PASS");
// A required suite that "passed" while skipping tests is not a release pass.
const skipFailures = [];
if (vitest.skipped > 0) skipFailures.push(`${vitest.skipped} Vitest test(s) skipped`);
if (playwright.skipped > 0) skipFailures.push(`${playwright.skipped} Playwright test(s) skipped`);
if (stages.every((s) => s.status === "PASS") && vitest.total === 0) {
  skipFailures.push("Vitest reported zero tests");
}
if (stages.every((s) => s.status === "PASS") && playwright.total === 0) {
  skipFailures.push("Playwright reported zero tests");
}

const passed = stageFailures.length === 0 && skipFailures.length === 0;

/* ------------------------------------------------------------------ *
 * Report (written after the verdict is already decided)
 * ------------------------------------------------------------------ */

const lines = [
  "# CareConnect — Final Release Report",
  "",
  "> Generated automatically by `bun run release:gate`. PASS/FAIL is derived",
  "> from process exit codes only. No credentials or secrets are recorded.",
  "",
  `**Executed (UTC):** ${startedAt}`,
  `**Completed (UTC):** ${new Date().toISOString()}`,
  `**Build identification:** ${buildIdentity()}`,
  `**Node:** ${process.version}`,
  "",
  `## Overall: ${passed ? "PASS" : "FAIL"}`,
  "",
  "## Stages",
  "",
  "| Stage | Command | Exit code | Result |",
  "| --- | --- | --- | --- |",
  ...stages.map(
    (s) => `| ${s.name} | \`${s.command}\` | ${s.exitCode ?? "—"} | ${s.status} |`,
  ),
  "",
  "## Vitest",
  "",
  `- Test files: ${vitest.files}`,
  `- Passed: ${vitest.passed}`,
  `- Failed: ${vitest.failed}`,
  `- Skipped: ${vitest.skipped}`,
  `- Total: ${vitest.total}`,
  "",
  "## Playwright (browser E2E)",
  "",
  `- Tests: ${playwright.total}`,
  `- Passed: ${playwright.passed}`,
  `- Failed: ${playwright.failed}`,
  `- Skipped: ${playwright.skipped}`,
  "",
  "## Required suites",
  "",
  "| Suite | Result |",
  "| --- | --- |",
  ...suiteResults.map(([name, result]) => `| ${name} | ${result} |`),
  "",
];

if (!passed) {
  lines.push("## Blocking failures", "");
  for (const s of stageFailures) lines.push(`- Stage **${s.name}** — ${s.status}`);
  for (const reason of skipFailures) lines.push(`- ${reason} — required tests must actually execute`);
  lines.push("");
}

writeFileSync(path.join(ROOT, "FINAL_RELEASE_REPORT.md"), lines.join("\n"));

console.log(`\n${"=".repeat(60)}`);
for (const s of stages) console.log(`${s.status.padEnd(8)} ${s.name}`);
for (const reason of skipFailures) console.log(`FAIL     ${reason}`);
console.log(`${"=".repeat(60)}`);
console.log(`RELEASE GATE: ${passed ? "PASS" : "FAIL"} — see FINAL_RELEASE_REPORT.md`);

process.exit(passed ? 0 : 1);
