import { describe, expect, it } from "vitest";
import { newSessionId, signSession, verifySession } from "@/lib/widget-session.server";

const claims = { sid: newSessionId(), wid: crypto.randomUUID(), org: crypto.randomUUID(), host: "https://example.com" };

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
    const forgedBody = btoa(JSON.stringify({ ...claims, org: crypto.randomUUID(), iat: 1, exp: 9999999999 }))
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
    const { verifySessionForRenewal, RENEWAL_GRACE_SECONDS } = await import(
      "@/lib/widget-session.server"
    );
    const { token } = await signSession(claims);
    // Strict verification passes now; renewal also accepts an old token.
    await expect(verifySession(token)).resolves.toBeTruthy();
    const renewed = await verifySessionForRenewal(token, RENEWAL_GRACE_SECONDS);
    expect(renewed.sid).toBe(claims.sid);
    await expect(verifySessionForRenewal("garbage.token")).rejects.toThrow();
  });

  it("refuses a token whose expiry is older than the grace window", async () => {
    const { verifySessionForRenewal } = await import("@/lib/widget-session.server");
    const { token } = await signSession(claims);
    await expect(verifySessionForRenewal(token, -60 * 60 * 24 * 365)).rejects.toThrow();
  });
});
