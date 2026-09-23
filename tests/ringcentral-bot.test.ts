import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  botCredentials,
  resolveBotToken,
  tokenPatch,
  type BotAuthRow,
  type BotAuthStore,
} from "@/lib/ringcentral.server";

const HOUR = 3600_000;

function store(row: BotAuthRow | null) {
  const saved: Array<Partial<BotAuthRow>> = [];
  const impl: BotAuthStore = {
    load: async () => row,
    save: async (patch) => {
      saved.push(patch);
    },
  };
  return { impl, saved };
}

function row(overrides: Partial<BotAuthRow> = {}): BotAuthRow {
  return {
    access_token: "current",
    refresh_token: "refresh",
    token_expires_at: new Date(Date.now() + HOUR).toISOString(),
    refresh_expires_at: new Date(Date.now() + 30 * 24 * HOUR).toISOString(),
    bot_name: "CareConnect Alerts",
    bot_extension_id: "555",
    ...overrides,
  };
}

beforeEach(() => {
  process.env["RINGCENTRAL_BOT_CLIENT_ID"] = "bot-id";
  process.env["RINGCENTRAL_BOT_CLIENT_SECRET"] = "bot-secret";
  process.env["RINGCENTRAL_SERVER_URL"] = "https://platform.example.com/";
});

afterEach(() => {
  delete process.env["RINGCENTRAL_BOT_CLIENT_ID"];
  delete process.env["RINGCENTRAL_BOT_CLIENT_SECRET"];
  delete process.env["RINGCENTRAL_BOT_TOKEN"];
  delete process.env["RINGCENTRAL_CLIENT_ID"];
  delete process.env["RINGCENTRAL_CLIENT_SECRET"];
  delete process.env["RINGCENTRAL_JWT"];
  delete process.env["RINGCENTRAL_SERVER_URL"];
  vi.unstubAllGlobals();
});

describe("bot credentials", () => {
  it("requires both bot keys and trims the server url", () => {
    expect(botCredentials()).toEqual({
      clientId: "bot-id",
      clientSecret: "bot-secret",
      serverUrl: "https://platform.example.com",
    });
    delete process.env["RINGCENTRAL_BOT_CLIENT_SECRET"];
    expect(botCredentials()).toBeNull();
  });
});

describe("bot vs jwt token selection", () => {
  it("returns null when the bot app is not configured, so posting falls back to the JWT user", async () => {
    delete process.env["RINGCENTRAL_BOT_CLIENT_ID"];
    const s = store(row());
    expect(await resolveBotToken(s.impl)).toBeNull();
  });

  it("returns null when the bot has not been installed yet", async () => {
    const s = store(row({ access_token: null }));
    expect(await resolveBotToken(s.impl)).toBeNull();
    expect(await resolveBotToken(store(null).impl)).toBeNull();
  });

  it("uses the stored token while it is still valid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const s = store(row());
    expect(await resolveBotToken(s.impl)).toEqual({
      token: "current",
      name: "CareConnect Alerts",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("bot token refresh", () => {
  it("refreshes an expired token and persists the new one", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        access_token: "fresh",
        refresh_token: "next-refresh",
        expires_in: 3600,
        refresh_token_expires_in: 604800,
        owner_id: "999",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const s = store(row({ token_expires_at: new Date(Date.now() - HOUR).toISOString() }));
    const result = await resolveBotToken(s.impl);

    expect(result?.token).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://platform.example.com/restapi/oauth/token");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(s.saved[0]?.access_token).toBe("fresh");
    expect(s.saved[0]?.refresh_token).toBe("next-refresh");
  });

  it("gives up when the refresh token itself has expired", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const s = store(
      row({
        token_expires_at: new Date(Date.now() - HOUR).toISOString(),
        refresh_expires_at: new Date(Date.now() - HOUR).toISOString(),
      }),
    );
    expect(await resolveBotToken(s.impl)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when RingCentral rejects the refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 400 })),
    );
    const s = store(row({ token_expires_at: new Date(Date.now() - HOUR).toISOString() }));
    expect(await resolveBotToken(s.impl)).toBeNull();
    expect(s.saved).toHaveLength(0);
  });
});

describe("token response mapping", () => {
  it("turns lifetimes into absolute expiry timestamps", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    expect(
      tokenPatch({ access_token: "a", expires_in: 60, refresh_token_expires_in: 120 }, now),
    ).toMatchObject({
      access_token: "a",
      token_expires_at: "2026-01-01T00:01:00.000Z",
      refresh_expires_at: "2026-01-01T00:02:00.000Z",
    });
  });
});

describe("dashboard bot token (env)", () => {
  afterEach(() => {
    delete process.env["RINGCENTRAL_BOT_TOKEN"];
  });

  async function freshModule() {
    vi.resetModules();
    return import("@/lib/ringcentral.server");
  }

  it("takes precedence over the DB-stored token and needs no refresh", async () => {
    process.env["RINGCENTRAL_BOT_TOKEN"] = "dashboard-token";
    const fetchMock = vi.fn(async () => Response.json({ name: "PHG Alert Bot" }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await freshModule();
    const result = await mod.getBotToken();

    expect(result).toEqual({ token: "dashboard-token", name: "PHG Alert Bot" });
    // Only the display-name lookup, never a token exchange.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/restapi/v1.0/account/~/extension/~");
    expect(await mod.botStatus()).toMatchObject({
      connected: true,
      name: "PHG Alert Bot",
      source: "dashboard",
    });
  });

  it("falls back to the default name when the lookup fails", async () => {
    process.env["RINGCENTRAL_BOT_TOKEN"] = "dashboard-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    const mod = await freshModule();
    expect((await mod.getBotToken())?.name).toBe("PHG Alert Bot");
  });

  it("ignores an empty env token so the DB path still applies", async () => {
    process.env["RINGCENTRAL_BOT_TOKEN"] = "   ";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    const mod = await freshModule();
    expect(await mod.getBotToken()).toBeNull();
  });
});

describe("resilient posting", () => {
  async function freshModule() {
    vi.resetModules();
    return import("@/lib/ringcentral.server");
  }

  beforeEach(() => {
    process.env["RINGCENTRAL_BOT_TOKEN"] = "dashboard-token";
    process.env["RINGCENTRAL_CLIENT_ID"] = "jwt-client";
    process.env["RINGCENTRAL_CLIENT_SECRET"] = "jwt-secret";
    process.env["RINGCENTRAL_JWT"] = "jwt-assertion";
  });

  it("retries with the JWT user when the bot post is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ name: "PHG Alert Bot" }))
      .mockResolvedValueOnce(new Response('{"errorCode":"CMN-102"}', { status: 404 }))
      .mockResolvedValueOnce(Response.json({ access_token: "jwt-access", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await freshModule();
    await expect(mod.postToChat("channel-1", "Alert")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer dashboard-token" }),
    });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer jwt-access" }),
    });
  });

  it("returns false only when both bot and JWT posts fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ name: "PHG Alert Bot" }))
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockResolvedValueOnce(Response.json({ access_token: "jwt-access", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("also forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await freshModule();
    await expect(mod.postToChat("channel-1", "Alert")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
