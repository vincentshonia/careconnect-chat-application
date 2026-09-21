/**
 * RingCentral Team Messaging (Glip) — server-only.
 *
 * Authenticates with a JWT bearer grant and caches the access token in-process.
 * Every function is best-effort: with no credentials configured the whole path
 * is a silent no-op so staff alerting never fails because of RingCentral.
 */

type Credentials = {
  clientId: string;
  clientSecret: string;
  jwt: string;
  serverUrl: string;
};

export function ringCentralCredentials(): Credentials | null {
  const clientId = process.env["RINGCENTRAL_CLIENT_ID"];
  const clientSecret = process.env["RINGCENTRAL_CLIENT_SECRET"];
  const jwt = process.env["RINGCENTRAL_JWT"];
  const serverUrl = process.env["RINGCENTRAL_SERVER_URL"];
  if (!clientId || !clientSecret || !jwt || !serverUrl) return null;
  return { clientId, clientSecret, jwt, serverUrl: serverUrl.replace(/\/+$/, "") };
}

export function isRingCentralConfigured(): boolean {
  return ringCentralCredentials() !== null;
}

let cached: { token: string; expiresAt: number } | null = null;

async function fetchToken(creds: Credentials): Promise<string | null> {
  const basic = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const res = await fetch(`${creds.serverUrl}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: creds.jwt,
    }).toString(),
  });
  if (!res.ok) {
    console.warn("[ringcentral] token request failed", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  // Refresh a minute before the real expiry so a long request never races it.
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000,
  };
  return cached.token;
}

async function accessToken(creds: Credentials, force = false): Promise<string | null> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  cached = null;
  return fetchToken(creds);
}

/** Authenticated call that transparently retries once after a 401. */
async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const creds = ringCentralCredentials();
  if (!creds) return null;
  const run = async (token: string) =>
    fetch(`${creds.serverUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

  let token = await accessToken(creds);
  if (!token) return null;
  let res = await run(token);
  if (res.status === 401) {
    token = await accessToken(creds, true);
    if (!token) return null;
    res = await run(token);
  }
  return res;
}

export type RingCentralChat = { id: string; name: string };

/** Teams and private channels the authenticated app can post into (no 1:1 DMs). */
export async function listChats(): Promise<RingCentralChat[]> {
  try {
    const res = await call("/restapi/v1.0/glip/chats?type=Team,Private&recordCount=250");
    if (!res || !res.ok) {
      if (res) console.warn("[ringcentral] chat list failed", res.status);
      return [];
    }
    const json = (await res.json()) as {
      records?: Array<{ id?: string; name?: string; type?: string }>;
    };
    return (json.records ?? [])
      .filter((r) => r.id && r.type !== "Direct" && r.type !== "Personal")
      .map((r) => ({ id: String(r.id), name: r.name?.trim() || `Channel ${r.id}` }));
  } catch (error) {
    console.warn("[ringcentral] chat list threw", error);
    return [];
  }
}

/** Post a plain-text message into a channel. Never throws. */
export async function postToChat(chatId: string, text: string): Promise<boolean> {
  try {
    const res = await call(`/restapi/v1.0/glip/chats/${encodeURIComponent(chatId)}/posts`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    if (!res || !res.ok) {
      if (res) console.warn("[ringcentral] post failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[ringcentral] post threw", error);
    return false;
  }
}
