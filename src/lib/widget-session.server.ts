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

export async function verifySession(token: unknown): Promise<WidgetSessionClaims> {
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
      fromB64url(sig),
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
  if (claims.exp * 1000 < Date.now()) {
    throw new PublicChatError(401, "Chat session has expired");
  }
  return claims;
}
