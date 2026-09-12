import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Baseline browser protections. The app itself must never be framed; the
 * widget page is the one exception and is framed only by the domains the
 * website owner approved.
 */
async function withSecurityHeaders(request: Request, response: Response): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/public")) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (path === "/widget") {
    const params = new URL(request.url).searchParams;
    const websiteId = params.get("w") ?? "";
    let ancestors: string[] = [];
    try {
      const mod = await import("./lib/public-chat.server");
      ancestors = await mod.widgetFrameAncestors(websiteId);
    } catch {
      ancestors = [];
    }

    // The admin console frames the real widget for its live preview. That is
    // only permitted when the request carries a staff-issued preview proof for
    // this website, and the host it was minted for is the console asking now.
    if (params.get("preview") === "1") {
      try {
        const { verifyOriginProof } = await import("./lib/widget-session.server");
        const claims = await verifyOriginProof(params.get("op"));
        const consoleOrigin = new URL(request.url).origin;
        if (claims?.preview && claims.wid === websiteId && claims.host === consoleOrigin) {
          ancestors.push(
            claims.host,
            // The console itself is framed by the Lovable editor, and
            // frame-ancestors must permit the whole chain.
            "https://lovable.dev",
            "https://*.lovable.dev",
            "https://*.lovable.app",
          );
        }
      } catch {
        /* an unverifiable proof simply grants nothing extra */
      }
    }

    // 'self' lets the admin console frame the real widget for its live
    // preview; that session still needs a staff-issued signed proof.
    headers.set("Content-Security-Policy", `frame-ancestors 'self' ${ancestors.join(" ")}`.trim());
  } else {
    // Nothing may frame the staff app except the Lovable editor preview.
    headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await withSecurityHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
