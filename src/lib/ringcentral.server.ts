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

/**
 * Teams and private channels visible to one access token (no 1:1 DMs).
 *
 * RingCentral rejects a comma-joined `type` filter here (400 CMN-101), so we ask
 * for every conversation and keep only Team/Private ourselves, following
 * pagination tokens so later pages of teams are not lost.
 */
export async function listChatsForToken(token: string, base: string): Promise<RingCentralChat[]> {
  const out: RingCentralChat[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ recordCount: "250" });
    if (pageToken) query.set("pageToken", pageToken);
    const res = await fetch(`${base}/restapi/v1.0/glip/chats?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn("[ringcentral] chat list failed", res.status);
      break;
    }
    const json = (await res.json()) as {
      records?: Array<{ id?: string; name?: string; type?: string }>;
      navigation?: { nextPageToken?: string };
    };
    for (const r of json.records ?? []) {
      if (!r.id || (r.type !== "Team" && r.type !== "Private")) continue;
      const id = String(r.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: r.name?.trim() || `Channel ${id}` });
    }
    pageToken = json.navigation?.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/** Merge chat lists in priority order, first occurrence winning, sorted by name. */
export function mergeChats(...lists: RingCentralChat[][]): RingCentralChat[] {
  const seen = new Map<string, RingCentralChat>();
  for (const list of lists) {
    for (const chat of list) if (!seen.has(chat.id)) seen.set(chat.id, chat);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type ListChatsDeps = {
  /** Bot identity, when one is configured. */
  bot: () => Promise<BotToken | null>;
  /** Chats visible to a given raw token. */
  forToken: (token: string) => Promise<RingCentralChat[]>;
  /** Chats visible to the JWT staff user, or null when no JWT is configured. */
  viaJwt: () => Promise<RingCentralChat[] | null>;
};

/**
 * Channels the alert can actually be delivered to.
 *
 * The bot identity comes first because `postToChat()` posts as the bot; the JWT
 * staff user is merged in only as the fallback identity that same function uses.
 */
export async function listChats(deps: ListChatsDeps = defaultListDeps()): Promise<
  RingCentralChat[]
> {
  try {
    const lists: RingCentralChat[][] = [];
    let bot: BotToken | null = null;
    try {
      bot = await deps.bot();
    } catch (error) {
      console.warn("[ringcentral] bot token resolution threw", error);
    }
    if (bot) lists.push(await deps.forToken(bot.token));
    const jwt = await deps.viaJwt();
    if (jwt) lists.push(jwt);
    return mergeChats(...lists);
  } catch (error) {
    console.warn("[ringcentral] chat list threw", error);
    return [];
  }
}

function defaultListDeps(): ListChatsDeps {
  return {
    bot: () => getBotToken(),
    forToken: (token) => listChatsForToken(token, serverUrl() ?? ""),
    viaJwt: async () => {
      const creds = ringCentralCredentials();
      if (!creds) return null;
      const token = await accessToken(creds);
      if (!token) return null;
      return listChatsForToken(token, creds.serverUrl);
    },
  };
}

/** Look one channel up by id, preferring the bot identity. Null when unknown. */
export async function fetchChat(
  chatId: string,
): Promise<{ id: string; name: string; type: string | null } | null> {
  const path = `/restapi/v1.0/glip/chats/${encodeURIComponent(chatId)}`;
  try {
    const bot = await getBotToken();
    const base = serverUrl();
    if (bot && base) {
      const res = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${bot.token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { id?: string; name?: string; type?: string };
        return { id: chatId, name: json.name?.trim() || `Channel ${chatId}`, type: json.type ?? null };
      }
    }
    const res = await call(path);
    if (!res?.ok) return null;
    const json = (await res.json()) as { name?: string; type?: string };
    return { id: chatId, name: json.name?.trim() || `Channel ${chatId}`, type: json.type ?? null };
  } catch (error) {
    console.warn("[ringcentral] chat lookup threw", error);
    return null;
  }
}


/* ------------------------------------------------------------------ *
 * Bot identity
 *
 * Alerts should read as coming from "CareConnect Alerts", not from the human
 * whose JWT we use for admin reads. The bot's token arrives through the bot
 * OAuth install flow and is stored in a single backend-only row.
 * ------------------------------------------------------------------ */

export type BotCredentials = { clientId: string; clientSecret: string; serverUrl: string };

export function botCredentials(): BotCredentials | null {
  const clientId = process.env["RINGCENTRAL_BOT_CLIENT_ID"];
  const clientSecret = process.env["RINGCENTRAL_BOT_CLIENT_SECRET"];
  const serverUrl = process.env["RINGCENTRAL_SERVER_URL"];
  if (!clientId || !clientSecret || !serverUrl) return null;
  return { clientId, clientSecret, serverUrl: serverUrl.replace(/\/+$/, "") };
}

export type BotAuthRow = {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  bot_name: string | null;
  bot_extension_id: string | null;
};

/** Storage seam so the token logic can be tested without a database. */
export type BotAuthStore = {
  load: () => Promise<BotAuthRow | null>;
  save: (patch: Partial<BotAuthRow>) => Promise<void>;
};

export function supabaseBotStore(): BotAuthStore {
  return {
    async load() {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("ringcentral_bot_auth")
        .select(
          "access_token, refresh_token, token_expires_at, refresh_expires_at, bot_name, bot_extension_id",
        )
        .limit(1)
        .maybeSingle();
      return (data as BotAuthRow | null) ?? null;
    },
    async save(patch) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("ringcentral_bot_auth")
        .upsert(
          { singleton: true, ...patch, updated_at: new Date().toISOString() },
          { onConflict: "singleton" },
        );
    },
  };
}

/** Refresh a minute early so a long request never races the expiry. */
const SKEW_MS = 60_000;

export type BotToken = { token: string; name: string | null };

/**
 * Resolve a usable bot access token, refreshing it when needed.
 * Returns null when the bot has not been installed yet — callers fall back to
 * the JWT-user identity so alerting keeps working.
 */
export async function resolveBotToken(
  store: BotAuthStore,
  now: number = Date.now(),
): Promise<BotToken | null> {
  const creds = botCredentials();
  if (!creds) return null;

  let row: BotAuthRow | null = null;
  try {
    row = await store.load();
  } catch (error) {
    console.warn("[ringcentral] bot token load failed", error);
    return null;
  }
  if (!row?.access_token) return null;

  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (expiresAt && expiresAt - SKEW_MS > now) {
    return { token: row.access_token, name: row.bot_name };
  }

  const refreshExpires = row.refresh_expires_at ? Date.parse(row.refresh_expires_at) : 0;
  if (!row.refresh_token || (refreshExpires && refreshExpires <= now)) {
    // Nothing left to refresh with: the bot has to be re-installed.
    return expiresAt ? null : { token: row.access_token, name: row.bot_name };
  }

  const refreshed = await exchangeBotToken(creds, {
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });
  if (!refreshed) return null;

  const patch = tokenPatch(refreshed, now);
  try {
    await store.save(patch);
  } catch (error) {
    console.warn("[ringcentral] bot token save failed", error);
  }
  return { token: refreshed.access_token, name: row.bot_name };
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  owner_id?: string;
};

/** POST the OAuth token endpoint with Basic auth using the BOT app credentials. */
export async function exchangeBotToken(
  creds: BotCredentials,
  body: Record<string, string>,
): Promise<TokenResponse | null> {
  try {
    const res = await fetch(`${creds.serverUrl}/restapi/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) {
      console.warn("[ringcentral] bot token exchange failed", res.status);
      return null;
    }
    const json = (await res.json()) as TokenResponse;
    return json.access_token ? json : null;
  } catch (error) {
    console.warn("[ringcentral] bot token exchange threw", error);
    return null;
  }
}

/** Map a token response onto the stored columns. */
export function tokenPatch(json: TokenResponse, now: number = Date.now()): Partial<BotAuthRow> {
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    token_expires_at: new Date(now + (json.expires_in ?? 3600) * 1000).toISOString(),
    refresh_expires_at: json.refresh_token_expires_in
      ? new Date(now + json.refresh_token_expires_in * 1000).toISOString()
      : null,
    bot_extension_id: json.owner_id ?? null,
  };
}

let botCache: {
  token: string;
  name: string | null;
  extensionId: string | null;
  at: number;
} | null = null;
const BOT_CACHE_MS = 60_000;

/** Base platform URL, shared by the JWT and bot paths. */
function serverUrl(): string | null {
  const url = process.env["RINGCENTRAL_SERVER_URL"];
  return url ? url.replace(/\/+$/, "") : null;
}

/** A bot token pasted straight from the RingCentral app dashboard, if configured. */
function envBotToken(): string | null {
  const token = process.env["RINGCENTRAL_BOT_TOKEN"];
  return token && token.trim() ? token.trim() : null;
}

/** Best-effort display name and extension for the dashboard bot token. Never throws. */
async function fetchBotIdentity(token: string): Promise<{ name: string; extensionId: string | null }> {
  const base = serverUrl();
  const fallback = { name: "PHG Alert Bot", extensionId: null };
  if (!base) return fallback;
  try {
    const res = await fetch(`${base}/restapi/v1.0/account/~/extension/~`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { name?: string; id?: string | number };
    return {
      name: json.name?.trim() || "PHG Alert Bot",
      extensionId: json.id != null ? String(json.id) : null,
    };
  } catch {
    return fallback;
  }
}

/** Cached bot token for posting. Null when the bot is not installed. */
export async function getBotToken(): Promise<BotToken | null> {
  if (botCache && Date.now() - botCache.at < BOT_CACHE_MS) {
    return { token: botCache.token, name: botCache.name };
  }

  // Highest priority: a long-lived token issued on the RingCentral dashboard.
  const direct = envBotToken();
  if (direct) {
    const identity = await fetchBotIdentity(direct);
    botCache = { token: direct, name: identity.name, extensionId: identity.extensionId, at: Date.now() };
    return { token: direct, name: identity.name };
  }

  const resolved = await resolveBotToken(supabaseBotStore());
  botCache = resolved ? { ...resolved, extensionId: null, at: Date.now() } : null;
  return resolved;
}

export type BotStatus = {
  connected: boolean;
  name: string | null;
  extensionId: string | null;
  /** Where the credential came from: the dashboard token or the OAuth install. */
  source: "dashboard" | "oauth" | null;
  lastPostAt: string | null;
};

/** Status for the admin screen. Never throws. */
export async function botStatus(): Promise<BotStatus> {
  try {
    const token = await getBotToken();
    if (!token) return { connected: false, name: null, extensionId: null, source: null, lastPostAt: null };
    const source = envBotToken() ? ("dashboard" as const) : ("oauth" as const);
    let extensionId = botCache?.extensionId ?? null;
    let lastPostAt: string | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("ringcentral_bot_auth")
        .select("bot_extension_id, last_post_at")
        .limit(1)
        .maybeSingle();
      lastPostAt = (data as { last_post_at?: string | null } | null)?.last_post_at ?? null;
      extensionId = extensionId ?? data?.bot_extension_id ?? null;
    } catch {
      /* status is best-effort */
    }
    return { connected: true, name: token.name, extensionId, source, lastPostAt };
  } catch {
    return { connected: false, name: null, extensionId: null, source: null, lastPostAt: null };
  }
}

/** Remember the last successful bot post, for the admin screen. Best-effort. */
async function recordPost(): Promise<void> {
  try {
    await supabaseBotStore().save({ last_post_at: new Date().toISOString() } as Partial<BotAuthRow>);
  } catch {
    /* never block alerting */
  }
}


/**
 * Post a plain-text message into a channel. Never throws.
 *
 * Posts as the CareConnect Alerts bot when it is installed, and falls back to
 * the JWT user otherwise so alerts keep flowing before the bot goes live.
 */
export async function postToChat(chatId: string, text: string): Promise<boolean> {
  const path = `/restapi/v1.0/glip/chats/${encodeURIComponent(chatId)}/posts`;
  const init: RequestInit = { method: "POST", body: JSON.stringify({ text }) };
  try {
    let bot: BotToken | null = null;
    try {
      bot = await getBotToken();
    } catch (error) {
      console.warn("[ringcentral] bot token resolution threw", error);
    }

    if (bot) {
      const base = botCredentials()?.serverUrl ?? serverUrl();
      try {
        const botRes = base
          ? await fetch(`${base}${path}`, {
              ...init,
              headers: {
                Authorization: `Bearer ${bot.token}`,
                "Content-Type": "application/json",
              },
            })
          : null;
        console.info("[ringcentral] post attempt", "bot", botRes?.status ?? "unavailable");
        if (botRes?.status === 401) {
          // Stale cache: drop it so the next request re-resolves.
          botCache = null;
        }
        if (botRes?.ok) {
          void recordPost();
          return true;
        }
        if (botRes) {
          console.warn("[ringcentral] bot post failed", botRes.status, await botRes.text());
        }
      } catch (error) {
        console.warn("[ringcentral] bot post threw", error);
      }
    }

    // A missing, rejected, or unreachable bot must never silence the alert.
    const jwtRes = await call(path, init);
    console.info("[ringcentral] post attempt", "jwt", jwtRes?.status ?? "unavailable");
    if (!jwtRes?.ok) {
      if (jwtRes) console.warn("[ringcentral] jwt post failed", jwtRes.status, await jwtRes.text());
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[ringcentral] post threw", error);
    return false;
  }
}
