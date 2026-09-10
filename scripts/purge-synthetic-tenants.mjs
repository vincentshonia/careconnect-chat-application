#!/usr/bin/env node
/**
 * One-off maintenance script: purge leftover synthetic test fixtures.
 *
 * Dry-run by default. Pass --confirm to actually delete.
 * Never prints credential values.
 */
import process from "node:process";

const CONFIRM = process.argv.includes("--confirm");

/** Exact organization names eligible for deletion. Nothing else may be touched. */
const ORG_ALLOW_LIST = ["ScaleA t53he6", "ScaleB t53he6", "Conc 28sojj"];
const PROTECTED_ORG = "Pacific Health Group";

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) {
  console.error("ABORT — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fail(message) {
  console.error(`ABORT — ${message}`);
  process.exit(1);
}

function isTargetEmail(email) {
  const e = (email ?? "").toLowerCase();
  return e.endsWith("@careconnect-demo.test") || e.startsWith("conc-") || e.startsWith("rbac-");
}

async function loadOrganizations() {
  const { data, error } = await db.from("organizations").select("id, name");
  if (error) fail(`could not read organizations — ${error.message}`);
  return data ?? [];
}

async function loadTargetUsers() {
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`could not list auth users — ${error.message}`);
    const batch = data?.users ?? [];
    for (const u of batch) {
      if (isTargetEmail(u.email)) users.push({ id: u.id, email: u.email });
    }
    if (batch.length < 200) break;
  }
  return users;
}

async function countFor(table, column, value) {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) return null;
  return count ?? 0;
}

async function countIn(table, column, values) {
  if (values.length === 0) return 0;
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, values);
  if (error) return null;
  return count ?? 0;
}

async function snapshot(orgs, userIds) {
  const rows = [];
  for (const org of orgs) {
    rows.push({
      name: org.name,
      conversations: await countFor("conversations", "organization_id", org.id),
      members: await countFor("organization_memberships", "organization_id", org.id),
    });
  }
  return {
    orgs: rows,
    profiles: await countIn("profiles", "id", userIds),
    memberships: await countIn("organization_memberships", "user_id", userIds),
    userRoles: await countIn("user_roles", "user_id", userIds),
    platformAdmins: await countIn("platform_admins", "user_id", userIds),
  };
}

function printSnapshot(label, snap, orgIdsPresent) {
  console.log(`\n== ${label} ==`);
  console.log("organization        | conversations | members");
  console.log("--------------------+---------------+--------");
  for (const r of snap.orgs) {
    console.log(
      `${r.name.padEnd(19)} | ${String(r.conversations).padStart(13)} | ${String(r.members).padStart(7)}`,
    );
  }
  if (orgIdsPresent === 0) console.log("(no target organizations present)");
  console.log(
    `\nuser rows — profiles: ${snap.profiles}, memberships: ${snap.memberships}, roles: ${snap.userRoles}, platform admins: ${snap.platformAdmins}`,
  );
}

// ---------------------------------------------------------------- discovery

const allOrgs = await loadOrganizations();
const targetOrgs = allOrgs.filter((o) => ORG_ALLOW_LIST.includes(o.name));

for (const org of targetOrgs) {
  if (!ORG_ALLOW_LIST.includes(org.name)) fail(`organization "${org.name}" is not on the allow-list.`);
  if (org.name === PROTECTED_ORG) fail(`"${PROTECTED_ORG}" must never be deleted.`);
}
if (targetOrgs.some((o) => o.name.trim() === PROTECTED_ORG)) {
  fail(`"${PROTECTED_ORG}" appeared in the delete set.`);
}

const missing = ORG_ALLOW_LIST.filter((n) => !targetOrgs.some((o) => o.name === n));
if (missing.length > 0) console.log(`Note: allow-listed organizations not found (already gone): ${missing.join(", ")}`);

const targetUsers = await loadTargetUsers();
const targetUserIds = targetUsers.map((u) => u.id);
const targetOrgIds = targetOrgs.map((o) => o.id);

// A protected-org user must not be swept in by accident beyond the agreed patterns.
for (const u of targetUsers) {
  if (!isTargetEmail(u.email)) fail(`user "${u.email}" does not match the agreed patterns.`);
}

const before = await snapshot(targetOrgs, targetUserIds);
printSnapshot(CONFIRM ? "BEFORE" : "DRY RUN — would delete", before, targetOrgIds.length);

console.log(`\nauth accounts to delete (${targetUsers.length}):`);
for (const u of targetUsers) console.log(`  - ${u.email}`);

if (!CONFIRM) {
  console.log("\nDRY RUN ONLY — nothing was deleted. Re-run with --confirm to apply.");
  process.exit(0);
}

// ---------------------------------------------------------------- deletion

const failures = [];

async function del(table, column, values) {
  if (values.length === 0) return;
  const { error } = await db.from(table).delete().in(column, values);
  if (error) failures.push(`${table}: ${error.message}`);
}

// 1. user-scoped rows
await del("platform_admins", "user_id", targetUserIds);
await del("user_roles", "user_id", targetUserIds);
await del("organization_memberships", "user_id", targetUserIds);
await del("profiles", "id", targetUserIds);

// 2. organizations (children cascade)
await del("organizations", "id", targetOrgIds);

// 3. auth accounts
for (const u of targetUsers) {
  const { error } = await db.auth.admin.deleteUser(u.id);
  if (error && !/not found/i.test(error.message)) failures.push(`auth user ${u.email}: ${error.message}`);
}

const remainingOrgs = (await loadOrganizations()).filter((o) => ORG_ALLOW_LIST.includes(o.name));
const remainingUsers = await loadTargetUsers();
const after = await snapshot(remainingOrgs, remainingUsers.map((u) => u.id));
printSnapshot("AFTER", after, remainingOrgs.length);
console.log(`remaining target auth accounts: ${remainingUsers.length}`);

const survivors = (await loadOrganizations()).map((o) => o.name);
console.log(`\norganizations remaining: ${survivors.join(", ")}`);
if (!survivors.includes(PROTECTED_ORG)) fail(`"${PROTECTED_ORG}" is missing after cleanup — investigate immediately.`);

if (failures.length > 0) {
  console.error(`\nPURGE COMPLETED WITH ${failures.length} ISSUE(S):\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("\nPURGE COMPLETE — synthetic fixtures removed.");
