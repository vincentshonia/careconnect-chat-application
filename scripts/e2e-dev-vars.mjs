#!/usr/bin/env node
/**
 * Generates `.dev.vars` for the wrangler preview used by the Playwright E2E
 * suite. The built worker reads its configuration from bindings, not from the
 * shell, so the server-side variables the public chat endpoints need must be
 * handed to wrangler explicitly.
 *
 * `.dev.vars` is git-ignored and is rewritten on every preview start. No value
 * is ever printed — only the names of the variables that were forwarded.
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "WIDGET_SESSION_SECRET"];
const OPTIONAL = [
  "SUPABASE_PROJECT_ID",
  "LOVABLE_API_KEY",
  "LOVABLE_TENANT_ID",
  "LOVABLE_AUTH_SECRET",
  "LOVABLE_OAUTH_CLIENT_ID",
  "LOVABLE_OAUTH_CLIENT_SECRET",
  "INTERNAL_WEBHOOK_SECRET",
];

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`e2e preview cannot start — missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

const forwarded = [...REQUIRED, ...OPTIONAL].filter((name) => process.env[name]?.trim());
const body = forwarded.map((name) => `${name}=${JSON.stringify(process.env[name])}`).join("\n");
// wrangler resolves `.dev.vars` relative to the directory of the config file
// it was given, so the built worker's directory gets a copy as well.
const targets = [path.join(process.cwd(), ".dev.vars")];
const built = path.join(process.cwd(), "dist", "server");
if (existsSync(built)) targets.push(path.join(built, ".dev.vars"));
for (const target of targets) writeFileSync(target, `${body}\n`);

console.log(`e2e preview vars written: ${forwarded.join(", ")} (values not printed)`);
