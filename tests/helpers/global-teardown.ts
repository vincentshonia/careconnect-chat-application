/**
 * Vitest global teardown.
 *
 * The integration suites tear down their own fixtures, but a suite that throws
 * between creating an account and registering it for cleanup can still leave a
 * synthetic login behind. This sweep runs once after the whole run and removes
 * every `__test_`/`__e2e_` prefixed account, so the release gate's independent
 * cleanup verification has nothing left to find. It is a no-op unless the
 * integration opt-in and the service-role key are both present.
 */
import { createClient } from "@supabase/supabase-js";
import { purgeOrphanSyntheticUsers } from "./required-env";

export async function teardown(): Promise<void> {
  const allow = (process.env["ALLOW_INTEGRATION_TESTS_ON_PRIMARY"] ?? "").trim().toLowerCase();
  const url = (process.env["SUPABASE_URL"] ?? "").trim();
  const serviceKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
  if (allow !== "true" || !url || !serviceKey) return;

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const removed = await purgeOrphanSyntheticUsers(db);
  if (removed > 0) {
    console.warn(`[global teardown] removed ${removed} residual synthetic account(s)`);
  }
}
