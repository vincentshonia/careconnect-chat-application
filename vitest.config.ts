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
      env: {
        WIDGET_SESSION_SECRET: env.WIDGET_SESSION_SECRET ?? "test-widget-secret-for-unit-tests",
        SUPABASE_URL: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "",
        SUPABASE_PUBLISHABLE_KEY:
          env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
      },
    },
  };
});
