import { describe, expect, it } from "vitest";
import { newSessionId, signSession, verifySession } from "@/lib/widget-session.server";

const claims = {
  sid: newSessionId(),
  wid: crypto.randomUUID(),
  org: crypto.randomUUID(),
  host: "https://example.com",
};

describe("widget session tokens", () => {
  it("round-trips a signed session", async () => {
    const { token } = await signSession(claims);
    const verified = await verifySession(token);
    expect(verified.wid).toBe(claims.wid);
    expect(verified.org).toBe(claims.org);
    expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token whose payload was tampered with (tenant swap)", async () => {
    const { token } = await signSession(claims);
    const [, sig] = token.split(".");
    const forgedBody = btoa(
      JSON.stringify({ ...claims, org: crypto.randomUUID(), iat: 1, exp: 9999999999 }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await expect(verifySession(`${forgedBody}.${sig}`)).rejects.toThrow();
  });

  it("rejects unsigned, empty and malformed tokens", async () => {
    for (const bad of [undefined, null, "", "abc", "a".repeat(50), { token: "x" }]) {
      await expect(verifySession(bad)).rejects.toThrow();
    }
  });

  it("mints unpredictable session ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newSessionId()));
    expect(ids.size).toBe(200);
  });
});

describe("session renewal grace", () => {
  it("accepts a recently expired but genuine token, and still rejects forgeries", async () => {
    const { verifySessionForRenewal, RENEWAL_GRACE_SECONDS } =
      await import("@/lib/widget-session.server");
    const { token } = await signSession(claims);
    // Strict verification passes now; renewal also accepts an old token.
    await expect(verifySession(token)).resolves.toBeTruthy();
    const renewed = await verifySessionForRenewal(token, RENEWAL_GRACE_SECONDS);
    expect(renewed.sid).toBe(claims.sid);
    await expect(verifySessionForRenewal("garbage.token")).rejects.toThrow();
  });

  it("refuses a tampered token even during the grace window", async () => {
    const { verifySessionForRenewal } = await import("@/lib/widget-session.server");
    const { token } = await signSession(claims);
    const [, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ ...claims, org: crypto.randomUUID(), iat: 1, exp: 1 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await expect(verifySessionForRenewal(`${forged}.${sig}`)).rejects.toThrow();
  });
});

describe("session-bound authorization", () => {
  const site = { id: crypto.randomUUID(), dev_mode: false, allowed_domains: ["example.com"] };

  it("allows a valid session whose proven host is on the allow-list, with no Origin header", async () => {
    const { assertSessionHostAllowed } = await import("@/lib/public-chat.server");
    expect(() => assertSessionHostAllowed(site, "https://example.com", null)).not.toThrow();
  });

  it("refuses when the request carries a disallowed Origin", async () => {
    const { assertSessionHostAllowed } = await import("@/lib/public-chat.server");
    expect(() => assertSessionHostAllowed(site, "https://example.com", "https://evil.test")).toThrow(
      /not authorized/i,
    );
  });

  it("refuses a session that was minted without a proven host", async () => {
    const { assertSessionHostAllowed } = await import("@/lib/public-chat.server");
    expect(() => assertSessionHostAllowed(site, null, "https://example.com")).toThrow(
      /not authorized/i,
    );
  });
});

describe("console preview sessions", () => {
  const site = { id: crypto.randomUUID(), dev_mode: false, allowed_domains: ["example.com"] };

  it("authorizes a preview session from any host", async () => {
    const { assertSessionHostAllowed } = await import("@/lib/public-chat.server");
    expect(() =>
      assertSessionHostAllowed(site, "https://console.internal", "https://console.internal", true),
    ).not.toThrow();
  });

  it("still refuses a non-preview session from that host", async () => {
    const { assertSessionHostAllowed } = await import("@/lib/public-chat.server");
    expect(() =>
      assertSessionHostAllowed(site, "https://console.internal", "https://console.internal", false),
    ).toThrow(/not authorized/i);
  });

  it("carries the preview flag through a signed origin proof", async () => {
    process.env.WIDGET_SESSION_SECRET ||= "test-secret-value-for-widget-sessions";
    const { signOriginProof, verifyOriginProof } = await import("@/lib/widget-session.server");
    const proof = await signOriginProof(site.id, "console.internal", true);
    expect((await verifyOriginProof(proof))?.preview).toBe(true);
    const plain = await signOriginProof(site.id, "example.com");
    expect((await verifyOriginProof(plain))?.preview).toBeUndefined();
  });
});
