# Security hardening: MFA enforcement, widget origins, headers, uploads, password reset

Five independent hardening changes. Sign-in behaviour stays as it is today (no two-step prompt), and the live website's widget becomes strict about which domains may embed it.

## 1. Two-step verification enforced in the backend

- New database function `mfa_satisfied()`: true when the session is already two-step verified (`aal2`), or when the caller's organization does not require it for their role (organization-wide flag, or the admin-only flag compared against the caller's role rank).
- `can_access_org()` returns false when `mfa_satisfied()` is false, so every policy built on it denies data access for an unverified session.
- `requireSupabaseAuth` (server-function entry point) rejects with 403 "MFA required" when the organization requires it and the session is `aal1`.
- Sign-in flow is unchanged: no redirect to the two-step screen is added back. Both policy flags are currently off for Pacific Health Group, so nobody's day-to-day access changes until an administrator turns the policy on.
- Test in `tests/rbac.test.ts`: with the policy on, an unverified session is denied organization data and the server-side check reports "MFA required"; with the policy off, access is unchanged.

## 2. Widget can only load on approved domains

In `assertHostAllowed` (`src/lib/public-chat.server.ts`), when a website is no longer in test mode:

- Authorization uses the real request headers only — `Origin` for the chat API routes, `Referer` for the widget page and the widget script. The `h` value the page sends is kept for analytics but no longer trusted.
- Lovable preview/dev domains are no longer accepted; approved domains only (your choice: strict).
- Missing or non-matching header is refused with the existing "not authorized on this domain" message.

Websites still in test mode keep today's tolerant behaviour, so testing happens on a test-marked site.

Note: a page that suppresses referrer information entirely would fail this check. Approved domains for the live site are unchanged, and the widget loader sends an origin in normal browser configurations.

## 3. Security headers

In `src/server.ts`, add to every response except `/widget` and `/api/public/*`:

- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

`/widget` stays embeddable: its `frame-ancestors` list is built from that website's approved domains (looked up by the widget key/id in the URL, cached briefly). If the website cannot be resolved, the widget response carries no frame-ancestors header rather than breaking embedding.

## 4. File uploads

In `src/routes/api/public/chat/upload.ts`:

- Per-IP rate limit runs before the request body is read; the per-session limit stays right after the session is verified.
- File contents are checked against their declared type (magic-byte sniffing for PNG, JPEG, GIF, WEBP, HEIC and PDF); a mismatch is rejected.
- `text/csv` removed from the accepted types.

## 5. Password reset page

`src/routes/reset-password.tsx` only permits a password change when:

- the session came from a recovery link (`PASSWORD_RECOVERY`), or
- the person re-enters their current password, which is verified before the change.

An ordinary signed-in visit no longer silently allows a change. After a successful update, the two-step requirement is re-checked: if the organization requires it and the session is unverified, the person goes to the two-step screen instead of the console.

## Technical notes

- One migration: `public.mfa_satisfied()` (stable, security definer, `search_path = public`) plus a `CREATE OR REPLACE` of `can_access_org()`; no policy rewrites needed since they call `can_access_org()`.
- Role rank for the admin-only flag reuses `public.org_role_rank`/`role_rank`.
- Header logic in `server.ts` wraps the existing `fetch` handler after `normalizeCatastrophicSsrResponse`; the allowed-domain lookup lives in a server-only helper reusing the existing widget-config cache pattern.
- Magic-byte sniffing reads the first bytes of the uploaded file before it is stored; no new dependency.

## Verification

Typecheck, full unit suite, and the integration suites (primary-backend opt-in already configured), then show the diff. No deployment.
