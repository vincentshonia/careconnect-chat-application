/**
 * Signed widget sessions.
 *
 * The public chat endpoints used to trust whatever `sessionToken`,
 * `websiteId` and `conversationId` the browser sent. Anyone could forge
 * those values and read or write another tenant's conversation.
 *
 * A session is now a short-lived HMAC-signed token minted by the server
 * (`POST /api/public/chat/session`). Every other public chat endpoint
 * derives the visitor, website and organization from the *verified*
 * token — never from request body fields.
 */
import { PublicChatError } from "./public-chat-error";

const TTL_SECONDS = 60 * 60 * 12;

export type WidgetSessionClaims = {
  /** Opaque visitor session token (server generated). */
  sid: string;
  /** Website id this session is bound to. */
  wid: string;
  /** Organization id this session is bound to. */
  org: string;
  /** Host origin the session was minted for. */
  host: string | null;
  iat: number;
  exp: number;
};

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function secret(): string {
  const value = process.env.WIDGET_SESSION_SECRET;
  if (!value) throw new PublicChatError(500, "Chat sessions are not configured");
  return value;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Cryptographically random opaque visitor session id. */
export function newSessionId(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function signSession(
  claims: Omit<WidgetSessionClaims, "iat" | "exp">,
): Promise<{ token: string; expiresAt: string }> {
  const iat = Math.floor(Date.now() / 1000);
  const payload: WidgetSessionClaims = { ...claims, iat, exp: iat + TTL_SECONDS };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body)),
  );
  return { token: `${body}.${b64url(sig)}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

/** Seven days: how long an expired token may still prove visitor identity. */
export const RENEWAL_GRACE_SECONDS = 60 * 60 * 24 * 7;

async function verifySigned(token: unknown, graceSeconds: number): Promise<WidgetSessionClaims> {
  if (typeof token !== "string" || token.length < 20 || token.length > 4000) {
    throw new PublicChatError(401, "Chat session is missing or invalid");
  }
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new PublicChatError(401, "Chat session is missing or invalid");

  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await key(),
      fromB64url(sig) as unknown as BufferSource,
      new TextEncoder().encode(body),
    );
  } catch {
    ok = false;
  }
  if (!ok) throw new PublicChatError(401, "Chat session is invalid");

  let claims: WidgetSessionClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    throw new PublicChatError(401, "Chat session is invalid");
  }
  if (!claims?.sid || !claims.wid || !claims.org) {
    throw new PublicChatError(401, "Chat session is invalid");
  }
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    throw new PublicChatError(401, "Chat session is invalid");
  }
  if ((claims.exp + graceSeconds) * 1000 < Date.now()) {
    throw new PublicChatError(401, "Chat session has expired");
  }
  return claims;
}

export async function verifySession(token: unknown): Promise<WidgetSessionClaims> {
  return verifySigned(token, 0);
}

/* ------------------------------ origin proofs ----------------------------- */

/**
 * The widget runs in an iframe served from *our* origin, so requests it makes
 * carry our own origin, not the page it is embedded in. The embedding page is
 * proven once, cross-origin, by the loader script: the server checks the
 * browser-sent `Origin` header against the allow-list and hands back this
 * short-lived signed proof. The widget then presents the proof when minting a
 * session, and the verified host is stored in the session claims.
 */
export type OriginProofClaims = { wid: string; host: string; exp: number };

const ORIGIN_PROOF_TTL_SECONDS = 15 * 60;

export async function signOriginProof(wid: string, host: string): Promise<string> {
  const payload: OriginProofClaims = {
    wid,
    host,
    exp: Math.floor(Date.now() / 1000) + ORIGIN_PROOF_TTL_SECONDS,
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(`op.${body}`)),
  );
  return `${body}.${b64url(sig)}`;
}

/** Returns the proven host, or null when the proof is missing/invalid/expired. */
export async function verifyOriginProof(token: unknown): Promise<OriginProofClaims | null> {
  if (typeof token !== "string" || token.length < 10 || token.length > 2000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(),
      fromB64url(sig) as unknown as BufferSource,
      new TextEncoder().encode(`op.${body}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as OriginProofClaims;
    if (!claims?.wid || !claims.host || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * Same signature check, but a token that expired recently is still accepted.
 *
 * Only session renewal uses this: an expired-but-genuine token is proof the
 * browser is the same visitor, so renewal can keep the existing visitor row
 * instead of creating a duplicate. It never grants access to conversation data.
 */
export async function verifySessionForRenewal(
  token: unknown,
  graceSeconds: number = RENEWAL_GRACE_SECONDS,
): Promise<WidgetSessionClaims> {
  return verifySigned(token, Math.max(0, graceSeconds));
}
