import crypto from "node:crypto";
import { getGoogleServiceAccountJson } from "@/lib/integrations/secrets";

// Zero-dependency Google service-account auth.
// Reads GOOGLE_SERVICE_ACCOUNT_JSON from env, builds an RS256 JWT assertion,
// exchanges it for a short-lived access token. Caches tokens in-memory.

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

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

export async function isGoogleServiceAccountConfigured(): Promise<boolean> {
  return (await loadKey()) !== null;
}

/**
 * Returns a cached access token for the given OAuth scope, minting a fresh
 * JWT-assertion one if the cached one is absent or expired.
 */
export async function getGoogleAccessToken(scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = cache.get(scope);
  if (cached && cached.expiresAt > now + 60) {
    return cached.token;
  }

  const key = await loadKey();
  if (!key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set or invalid. Go to Integrations → GA4 / GSC → Manage keys to add it."
    );
  }

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
