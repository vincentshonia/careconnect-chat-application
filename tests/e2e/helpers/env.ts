/**
 * E2E environment preflight.
 *
 * Two distinct tiers:
 *   A. browser smoke testing      -> only needs a reachable base URL
 *   B. database-backed E2E tests  -> needs the same Supabase variables the
 *      existing Vitest integration suites use (see vitest.config.ts)
 *
 * Missing configuration always throws. Nothing here silently skips a test:
 * a misconfigured environment must fail loudly instead of reporting a false PASS.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function requireVars(names: string[], tier: string): Record<string, string> {
  const found: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = read(name);
    if (value) found[name] = value;
    else missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(
      `E2E preflight failed (${tier}): missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them before running this suite — tests are never skipped for missing configuration.`,
    );
  }
  return found;
}

/** Tier A — browser-only smoke testing. */
export function requireBrowserEnv(): { baseURL: string } {
  const baseURL =
    read("E2E_BASE_URL") ?? `http://127.0.0.1:${read("E2E_PORT") ?? "4173"}`;
  try {
    // eslint-disable-next-line no-new
    new URL(baseURL);
  } catch {
    throw new Error(`E2E preflight failed (browser): invalid base URL "${baseURL}".`);
  }
  return { baseURL };
}

/** Tier B — database-backed E2E testing (used by later segments). */
export function requireDatabaseEnv(): {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
} {
  const vars = requireVars(
    ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    "database-backed",
  );
  return {
    supabaseUrl: vars["SUPABASE_URL"]!,
    publishableKey: vars["SUPABASE_PUBLISHABLE_KEY"]!,
    serviceRoleKey: vars["SUPABASE_SERVICE_ROLE_KEY"]!,
  };
}
