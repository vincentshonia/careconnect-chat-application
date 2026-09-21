/**
 * RingCentral bot install callback.
 *
 * RingCentral redirects an admin here once the CareConnect Alerts bot is added
 * to the account. We exchange the one-time code for the bot's token and store
 * it server-side; nothing about the token ever reaches the page or the logs.
 */
import { createFileRoute } from "@tanstack/react-router";

const REDIRECT_URI = "https://chat.mypacifichealth.com/api/ringcentral/bot/oauth";

function page(title: string, detail: string, status: number) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:system-ui;margin:3rem;max-width:32rem">` +
      `<h1 style="font-size:1.25rem">${title}</h1><p>${detail}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

/** RingCentral pings the URL to validate it; echo any validation token it sends. */
function validationResponse(request: Request): Response | null {
  const url = new URL(request.url);
  const headerToken = request.headers.get("validation-token");
  const paramToken =
    url.searchParams.get("validationToken") ?? url.searchParams.get("validation-token");
  const token = headerToken ?? paramToken;
  if (!token) return null;
  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (headerToken) headers["Validation-Token"] = headerToken;
  return new Response(token, { status: 200, headers });
}

const livePage = () =>
  page("PHG Alert Bot callback is live", "This endpoint is ready to complete the bot install.", 200);

export const Route = createFileRoute("/api/ringcentral/bot/oauth")({
  server: {
    handlers: {
      HEAD: async ({ request }) => {
        const validation = validationResponse(request);
        if (validation) return new Response(null, { status: 200, headers: validation.headers });
        return new Response(null, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const oauthError = url.searchParams.get("error");

        const validation = validationResponse(request);
        if (validation && !code && !oauthError) return validation;

        if (oauthError) {
          return page("Bot not connected", "RingCentral reported: " + oauthError, 400);
        }
        // Bare validation ping — must be 200 or RingCentral refuses the install.
        if (!code) return livePage();


        const rc = await import("@/lib/ringcentral.server");
        const creds = rc.botCredentials();
        if (!creds) {
          return page(
            "Bot not connected",
            "The RingCentral bot credentials are not configured on the server yet.",
            503,
          );
        }

        const token = await rc.exchangeBotToken(creds, {
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        });
        if (!token) {
          return page("Bot not connected", "RingCentral rejected the authorization code.", 400);
        }

        const patch = rc.tokenPatch(token);

        // Best effort: give the admin screen a human name for the bot.
        let botName: string | null = null;
        try {
          const res = await fetch(`${creds.serverUrl}/restapi/v1.0/account/~/extension/~`, {
            headers: { Authorization: `Bearer ${token.access_token}` },
          });
          if (res.ok) {
            const ext = (await res.json()) as { name?: string; id?: number | string };
            botName = ext.name?.trim() || null;
            if (ext.id) patch.bot_extension_id = String(ext.id);
          }
        } catch {
          // Name is cosmetic — ignore.
        }

        try {
          await rc.supabaseBotStore().save({ ...patch, bot_name: botName });
        } catch {
          return page("Bot not connected", "The bot token could not be saved.", 500);
        }

        return page(
          `${botName ?? "CareConnect Alerts"} bot connected`,
          "You can close this tab. Remember to add the bot to each RingCentral channel it should post into.",
          200,
        );
      },
    },
  },
});
