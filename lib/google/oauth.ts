// Google OAuth 2.0 (Web Server Flow) — user-delegated GA4 + GSC access.
//
// The alternative to the service-account model: instead of pasting a robot key
// and adding its email to every GA4/GSC property, the admin clicks "Connect with
// Google" once, consents, and we store an encrypted refresh token. All GA4/GSC
// reads then run as that Google user, seeing whatever properties the account
// already has.
//
// Flow:
//   1. /api/oauth/google/start → redirect to Google's consent screen (signed state)
//   2. Google redirects to /api/oauth/google/callback?code=...&state=...
//   3. Callback exchanges code → access_token + refresh_token, encrypts the
//      refresh token, writes a GLOBAL integrations row (provider='google')
//   4. lib/google/auth.ts refreshes access tokens from the stored refresh token
//
// Refresh tokens are encrypted at rest with OAUTH_TOKEN_ENCRYPTION_KEY (32-byte
// base64). Never plain text, never in a URL.

import crypto from "node:crypto";
import { env } from "@/lib/env";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

// Read-only by design. analytics.manage.users.readonly lets us LIST the GA4
// properties the account can access (for the property picker). No write scopes.
export const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.manage.users.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "openid",
  "email",
] as const;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
}

function clientId(): string {
  const id = env().GOOGLE_OAUTH_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  return id;
}

function clientSecret(): string {
  const secret = env().GOOGLE_OAUTH_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not set");
  return secret;
}

function encryptionKey(): Buffer {
  const raw = env().OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY not set — generate with `openssl rand -base64 32`");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`OAUTH_TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${buf.length}`);
  return buf;
}

/**
 * Build the redirect URI Google POSTs back to. Uses the LIVE request origin so
 * the whole round-trip stays on the same domain (session + nonce cookies
 * survive). Every origin used here MUST be registered as an Authorized redirect
 * URI on the OAuth client or Google rejects it (redirect_uri_mismatch).
 */
export function callbackUrl(origin?: string): string {
  const base = (origin ?? env().NEXT_PUBLIC_APP_URL ?? "https://seo-we360.vercel.app").replace(/\/$/, "");
  return `${base}/api/oauth/google/callback`;
}

/** The public origin a request actually arrived on (custom-domain / Vercel aware). */
export function requestOrigin(headers: Headers, fallbackUrl: string): string {
  const proto = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) return `${proto}://${host}`;
  try { return new URL(fallbackUrl).origin; } catch { return env().NEXT_PUBLIC_APP_URL ?? "https://seo-we360.vercel.app"; }
}

/** Encrypt a string (e.g. a refresh token) with AES-256-GCM. */
export function encrypt(plain: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

/** Decrypt a string previously produced by encrypt(). Throws on tampering. */
export function decrypt(packed: string): string {
  const key = encryptionKey();
  const parts = packed.split(".");
  if (parts.length !== 3) throw new Error("malformed encrypted token");
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Sign a state token (CSRF guard for the OAuth roundtrip). */
export function signState(payload: { nonce: string }): string {
  const secret = clientSecret(); // server-only, reused as the HMAC key
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(token: string): { nonce: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac("sha256", clientSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Build the URL we redirect the user to for Google's consent screen. */
export function buildAuthUrl(state: string, origin?: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: [...DEFAULT_SCOPES].join(" "),
    state,
    // offline + consent → we always get a refresh token back (otherwise returning
    // users get none and we could never refresh — a silent failure mode).
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens. `origin` MUST match the origin used
 * to build the auth URL — Google validates the redirect_uri is identical.
 */
export async function exchangeCodeForTokens(code: string, origin?: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Refresh an access token using a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth refresh failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

/** Fetch the connected user's email — used for the "Connected as <email>" badge. */
export async function getUserInfo(accessToken: string): Promise<{ email: string; name?: string }> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`userinfo failed (${res.status})`);
  return (await res.json()) as { email: string; name?: string };
}
