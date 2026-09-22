/**
 * Playwright global teardown.
 *
 * Every spec tears its own synthetic tenant down in `afterAll`, but a spec
 * that throws between creating a tenant (or an extra staff account) and
 * registering it for cleanup can still leave rows behind in the live project.
 * This sweep runs once after the whole browser suite and removes every
 * `__e2e_`-prefixed organization and account, so the release gate's
 * independent cleanup verification has nothing left to find.
 *
 * Only prefixed artefacts are ever deleted — real tenant data can never be
 * caught by this sweep. It is a no-op without the service-role key.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { E2E_PREFIX, ORG_SCOPED_TABLES } from "../fixtures/e2e-fixtures";

export default async function globalTeardown(): Promise<void> {
  const url = (process.env["SUPABASE_URL"] ?? "").trim();
  const serviceKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
  if (!url || !serviceKey) return;

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as SupabaseClient<any, "public", any>;

  // Organizations first: their rows reference the accounts.
  const { data: orgs } = await db
    .from("organizations")
    .select("id, name")
    .like("name", `${E2E_PREFIX}%`);

  let removedOrgs = 0;
  for (const org of orgs ?? []) {
    if (!String(org.name ?? "").startsWith(E2E_PREFIX)) continue;
    for (const table of ORG_SCOPED_TABLES) {
      await db.from(table).delete().eq("organization_id", org.id);
    }
    await db.from("organizations").delete().eq("id", org.id);
    removedOrgs += 1;
  }

  let removedUsers = 0;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users ?? [];
    for (const user of users) {
      if (!(user.email ?? "").startsWith(E2E_PREFIX)) continue;
      await db.from("profiles").delete().eq("id", user.id);
      await db.auth.admin.deleteUser(user.id);
      removedUsers += 1;
    }
    if (users.length < 200) break;
  }

  if (removedOrgs > 0 || removedUsers > 0) {
    console.warn(
      `[e2e global teardown] removed ${removedOrgs} residual synthetic organization(s) and ${removedUsers} account(s)`,
    );
  }
}
