/**
 * Release-critical suites must never silently skip.
 *
 * `requireTestEnv` replaces the former `describe.runIf(configured)` guards: when
 * a required credential is missing the suite file fails loudly at import time
 * instead of reporting a false PASS with zero executed assertions.
 */
export function requireTestEnv(vars: Record<string, string | undefined>): true {
  const missing = Object.entries(vars)
    .filter(([, value]) => !value || value.trim() === "")
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Release-critical suite cannot run: missing required environment variable(s): ${missing.join(", ")}. ` +
        `These tests are never skipped — configure the environment and re-run.`,
    );
  }
  return true;
}
