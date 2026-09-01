import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

/**
 * Automated test suite.
 *
 * `bun run test`            – unit tests (fast, no network)
 * `bun run test:isolation`  – tenant isolation tests against the live database
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode ?? "test", process.cwd(), "");
  return {
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      /**
       * Integration suites talk to the same database. Running the files in
       * parallel exhausts the connection pooler, so they run one at a time and
       * are given room for genuinely slow, high-volume queries.
       */
      fileParallelism: false,
      testTimeout: 60_000,
      hookTimeout: 300_000,

      env: {
        WIDGET_SESSION_SECRET: env.WIDGET_SESSION_SECRET ?? "test-widget-secret-for-unit-tests",
        SUPABASE_URL: process.env['SUPABASE_URL'] ?? env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "",
        SUPABASE_PUBLISHABLE_KEY:
          env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        // Provisioned by the platform; only present for integration runs.
        SUPABASE_SERVICE_ROLE_KEY:
          process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      },
    },
  };
});
