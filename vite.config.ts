// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Identifies the exact source revision this bundle was built from. */
function buildId(): string {
  const fromEnv =
    process.env["LOVABLE_COMMIT_SHA"] ?? process.env["GIT_COMMIT"] ?? process.env["COMMIT_SHA"];
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** The build id and verdict recorded in the last release report, if any. */
function releaseReport(): { build: string; overall: string } {
  try {
    const text = readFileSync(path.resolve(process.cwd(), "FINAL_RELEASE_REPORT.md"), "utf8");
    return {
      build: /\*\*Build identification:\*\*\s*(.+)/.exec(text)?.[1]?.trim() ?? "",
      overall: /##\s*Overall:\s*(\w+)/.exec(text)?.[1]?.trim() ?? "",
    };
  } catch {
    return { build: "", overall: "" };
  }
}

const BUILD_ID = buildId();
const REPORT = releaseReport();

// Server routes need non-VITE_ vars (service role key, API keys) in process.env.
// These are NEVER added to the client define block.
const serverEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      __RELEASE_REPORT_BUILD_ID__: JSON.stringify(REPORT.build),
      __RELEASE_REPORT_OVERALL__: JSON.stringify(REPORT.overall),
    },
    resolve: {
      alias: {
        // React Email's htmlparser2 path needs entities v4.5.0; pin every import
        // at the hoisted copy so a nested v5+ copy is never used.
        "entities/lib/decode.js": path.resolve(
          process.cwd(),
          "node_modules/entities/lib/decode.js",
        ),
        "entities/lib/encode.js": path.resolve(
          process.cwd(),
          "node_modules/entities/lib/encode.js",
        ),
        entities: path.resolve(process.cwd(), "node_modules/entities"),
      },
    },
  },
});
