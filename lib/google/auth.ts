import crypto from "node:crypto";
import { getGoogleServiceAccountJson } from "@/lib/integrations/secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, refreshAccessToken } from "@/lib/google/oauth";

// Google credential resolver — two auth paths, transparent to callers:
//   1. OAuth refresh token (PREFERRED when present) — the "Connect with Google"
//      flow stores it encrypted in a GLOBAL integrations row (provider='google').
//      Reads run as the connected Google user, so no robot email has to be added
//      to each GA4/GSC property.
//   2. Service-account JSON (fallback) — env or integrations config. The app's
//      own identity reads properties it's been granted viewer on.

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

// In-memory token cache (per warm serverless instance). OAuth access tokens
// cover ALL granted scopes, so they share one key; service-account tokens are
// per-scope.
const cache: Map<string, CachedToken> = new Map();

function base64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

async function loadKey(): Promise<ServiceAccountKey | null> {
  let raw = await getGoogleServiceAccountJson();
  if (!raw || raw.trim().length < 10) return null;
  // Support base64-encoded JSON (easier to paste into env vars without newline issues)
  if (!raw.trim().startsWith("{")) {
    try { raw = Buffer.from(raw, "base64").toString("utf-8"); } catch { /* fall through */ }
  }
  try {
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Look up the GLOBAL Google OAuth refresh token, if the "Connect with Google"
 * flow has stored one. Returns null when only the service-account path (or
 * nothing) is configured.
 */
async function loadGlobalOAuthRefreshToken(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "google")
      .is("project_id", null)
      .limit(1);
    const row = (data?.[0] ?? null) as
      | { config?: { auth_type?: string; refresh_token_encrypted?: string }; enabled?: boolean }
      | null;
    if (!row || row.enabled === false) return null;
    const cfg = row.config;
    if (cfg?.auth_type === "oauth" && cfg.refresh_token_encrypted) {
      return decrypt(cfg.refresh_token_encrypted);
    }
  } catch (e) {
    console.warn("[google/auth] OAuth lookup failed; falling back to service account", e);
  }
  return null;
}

/**
 * True when EITHER a Google OAuth connection OR a service-account JSON is
 * configured — either can mint access tokens for GA4/GSC.
 */
export async function isGoogleServiceAccountConfigured(): Promise<boolean> {
  if (await loadGlobalOAuthRefreshToken()) return true;
  return (await loadKey()) !== null;
}

/** Mint a Google access token from a service-account key via the JWT-bearer flow. */
async function mintServiceAccountToken(key: ServiceAccountKey, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = cache.get(scope);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const tokenUri = key.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = base64urlJson({ alg: "RS256", typ: "JWT" });
  const claims = base64urlJson({
    iss: key.client_email,
    scope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  });
  const signInput = `${header}.${claims}`;
  let signature: Buffer;
  try {
    signature = crypto.sign("RSA-SHA256", Buffer.from(signInput), key.private_key);
  } catch (e) {
    throw new Error(`Could not sign JWT — service-account private key is likely malformed: ${e instanceof Error ? e.message : "unknown"}`);
  }
  const jwt = `${signInput}.${signature.toString("base64url")}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(scope, { token: data.access_token, expiresAt: now + data.expires_in });
  return data.access_token;
}

/**
 * Returns an access token for the given OAuth scope. Prefers the Google OAuth
 * connection when one is stored; otherwise mints a service-account token.
 */
export async function getGoogleAccessToken(scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // 1. Prefer the user-delegated OAuth connection. One refreshed access token
  //    covers ALL granted scopes, so cache it under a single key.
  const oauthKey = "oauth:global";
  const cachedOauth = cache.get(oauthKey);
  if (cachedOauth && cachedOauth.expiresAt > now + 60) return cachedOauth.token;
  const refreshToken = await loadGlobalOAuthRefreshToken();
  if (refreshToken) {
    const refreshed = await refreshAccessToken(refreshToken);
    cache.set(oauthKey, { token: refreshed.access_token, expiresAt: now + refreshed.expires_in });
    return refreshed.access_token;
  }

  // 2. Fall back to the service-account JWT-bearer flow.
  const key = await loadKey();
  if (!key) {
    throw new Error(
      "Google not connected. Use “Connect with Google” on the Integrations page, or add a service-account JSON."
    );
  }
  return mintServiceAccountToken(key, scope);
}
