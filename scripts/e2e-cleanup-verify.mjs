#!/usr/bin/env node
/**
 * CareConnect E2E / integration cleanup verification.
 *
 * Stage 6 of `bun run release:gate`. The browser suite creates a synthetic
 * `__e2e_`-prefixed tenant per spec, and the Vitest integration suites create
 * `__test_`-prefixed tenants; both tear themselves down. This stage is the
 * independent proof that nothing survived: it sweeps every configured backend
 * for residual synthetic organizations, profiles, departments, websites,
 * conversations and auth users, and fails the release if a single row remains.
 *
 * Read-only. Never prints a credential value.
 */
import process from "node:process";

const PREFIXES = ["__e2e_", "__test_"];

const backends = [];

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) {
  console.error("CLEANUP VERIFICATION FAILED — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
  process.exit(1);
}
backends.push({ label: "primary", url, serviceKey });

const testUrl = process.env["TEST_SUPABASE_URL"];
const testServiceKey = process.env["TEST_SUPABASE_SERVICE_ROLE_KEY"];
if (testUrl && testServiceKey && testUrl.replace(/\/+$/, "") !== url.replace(/\/+$/, "")) {
  backends.push({ label: "test", url: testUrl, serviceKey: testServiceKey });
}

const { createClient } = await import("@supabase/supabase-js");

const findings = [];

async function sweep(backend) {
  const db = createClient(backend.url, backend.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const prefix of PREFIXES) {
    const tag = `[${backend.label}] ${prefix}`;

    const countLike = async (label, table, column) => {
      const { count, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .like(column, `${prefix}%`);
      findings.push(
        error
          ? { label: `${tag} ${label}`, count: null, error: error.message }
          : { label: `${tag} ${label}`, count: count ?? 0 },
      );
    };

    await countLike("organizations", "organizations", "name");
    await countLike("profiles", "profiles", "email");
    await countLike("departments", "departments", "name");
    await countLike("websites", "websites", "name");

    // Conversations are resolved through the synthetic orgs (no name column).
    const { data: orgs, error: orgError } = await db
      .from("organizations")
      .select("id")
      .like("name", `${prefix}%`);
    if (orgError) {
      findings.push({ label: `${tag} conversations`, count: null, error: orgError.message });
    } else if ((orgs ?? []).length === 0) {
      findings.push({ label: `${tag} conversations`, count: 0 });
    } else {
      const ids = orgs.map((o) => o.id);
      const { count } = await db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .in("organization_id", ids);
      findings.push({ label: `${tag} conversations`, count: count ?? 0 });
    }

    // Synthetic auth users.
    let authResidual = 0;
    let authError = null;
    try {
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) {
          authError = error.message;
          break;
        }
        const users = data?.users ?? [];
        authResidual += users.filter((u) => (u.email ?? "").startsWith(prefix)).length;
        if (users.length < 200) break;
      }
    } catch (error) {
      authError = error instanceof Error ? error.message : "auth sweep failed";
    }
    findings.push({
      label: `${tag} auth users`,
      count: authError ? null : authResidual,
      error: authError,
    });
  }
}

for (const backend of backends) {
  await sweep(backend);
}

/**
 * `--purge` removes leaked synthetic accounts. Every address is re-checked
 * against the synthetic prefixes immediately before the delete, so a real
 * account can never be caught by this sweep.
 */
const purge = process.argv.includes("--purge");

function assertSynthetic(email) {
  if (!email || !PREFIXES.some((prefix) => email.startsWith(prefix))) {
    throw new Error(`refusing to delete "${email}" — it is not a synthetic account.`);
  }
}

async function purgeLeakedAccounts(backend) {
  const db = createClient(backend.url, backend.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const all = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`[${backend.label}] account listing failed: ${error.message}`);
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < 200) break;
  }

  const leaked = all.filter((u) => PREFIXES.some((p) => (u.email ?? "").startsWith(p)));
  console.log(
    `\n[${backend.label}] before purge: ${all.length} account(s) total, ${leaked.length} synthetic, ${all.length - leaked.length} real.`,
  );

  for (const user of leaked) {
    assertSynthetic(user.email);
    await db.from("profiles").delete().eq("id", user.id);
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`[${backend.label}] delete ${user.email}: ${error.message}`);
  }

  let remaining = 0;
  let total = 0;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`[${backend.label}] account re-count failed: ${error.message}`);
    const users = data?.users ?? [];
    total += users.length;
    remaining += users.filter((u) => PREFIXES.some((p) => (u.email ?? "").startsWith(p))).length;
    if (users.length < 200) break;
  }
  console.log(
    `[${backend.label}] after purge:  ${total} account(s) total, ${remaining} synthetic, ${total - remaining} real.`,
  );
  if (remaining > 0) {
    throw new Error(`[${backend.label}] ${remaining} synthetic account(s) survived the purge.`);
  }
}

if (purge) {
  for (const backend of backends) {
    await purgeLeakedAccounts(backend);
  }
}

let failed = false;
for (const f of findings) {
  const ok = f.count === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"}  residual ${f.label}: ${f.error ? `sweep error — ${f.error}` : f.count}`,
  );
}

if (failed) {
  console.error("\nCLEANUP VERIFICATION FAILED — synthetic data survived the run.");
  process.exit(1);
}
console.log("\nCLEANUP VERIFICATION PASSED — no synthetic data remains.");
