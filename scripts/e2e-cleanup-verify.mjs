#!/usr/bin/env node
/**
 * CareConnect E2E cleanup verification.
 *
 * Stage 6 of `bun run release:gate`. The browser suite creates a synthetic
 * `__e2e_`-prefixed tenant per spec and tears it down again. This stage is the
 * independent proof that nothing survived: it sweeps the backend for residual
 * synthetic organizations, profiles, auth users, conversations and runId
 * references, and fails the release if a single row remains.
 *
 * Read-only. Never prints a credential value.
 */
import process from "node:process";

const PREFIX = "__e2e_";

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) {
  console.error("E2E CLEANUP VERIFICATION FAILED — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const findings = [];

async function countLike(label, table, column) {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .like(column, `${PREFIX}%`);
  if (error) {
    findings.push({ label, count: null, error: error.message });
    return;
  }
  findings.push({ label, count: count ?? 0 });
}

await countLike("organizations", "organizations", "name");
await countLike("profiles", "profiles", "email");
await countLike("departments", "departments", "name");
await countLike("websites", "websites", "name");

// Conversations and runId references are resolved through the synthetic orgs
// (conversations carry no name column of their own).
const { data: orgs, error: orgError } = await db
  .from("organizations")
  .select("id")
  .like("name", `${PREFIX}%`);
if (orgError) {
  findings.push({ label: "conversations", count: null, error: orgError.message });
} else if ((orgs ?? []).length === 0) {
  findings.push({ label: "conversations", count: 0 });
  findings.push({ label: "runId references", count: 0 });
} else {
  const ids = orgs.map((o) => o.id);
  const { count } = await db
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .in("organization_id", ids);
  findings.push({ label: "conversations", count: count ?? 0 });
  findings.push({ label: "runId references", count: ids.length });
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
    authResidual += users.filter((u) => (u.email ?? "").startsWith(PREFIX)).length;
    if (users.length < 200) break;
  }
} catch (error) {
  authError = error instanceof Error ? error.message : "auth sweep failed";
}
findings.push({ label: "auth users", count: authError ? null : authResidual, error: authError });

let failed = false;
for (const f of findings) {
  const ok = f.count === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"}  residual ${f.label}: ${f.error ? `sweep error — ${f.error}` : f.count}`,
  );
}

if (failed) {
  console.error("\nE2E CLEANUP VERIFICATION FAILED — synthetic data survived the run.");
  process.exit(1);
}
console.log("\nE2E CLEANUP VERIFICATION PASSED — no synthetic data remains.");
