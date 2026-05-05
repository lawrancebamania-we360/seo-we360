import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

// Resolve third-party credentials with DB-first, env-fallback semantics.
// The /dashboard/integrations UI writes rows into `public.integrations` — one
// per provider — storing user-entered keys in the `config` jsonb column. The
// cron jobs + API routes ask this module for a credential and we serve the DB
// value if present, otherwise fall back to the env var. That way:
//
//   * UI-entered creds take effect without a redeploy.
//   * `.env.local` stays authoritative when no one has filled the UI in yet.
//   * Cron jobs (which have no user session) still work — we use the admin
//     client so RLS doesn't apply.
//
// Reads are cached per-request via a global Map so a single request doesn't
// round-trip to Supabase for every skill. Writes (from saveIntegrationConfig)
// bust the cache via revalidatePath — the per-request nature here just avoids
// double-fetching within one server render.

type ProviderConfig = Record<string, string> | null;

const REQUEST_CACHE: Map<string, ProviderConfig> = new Map();

async function loadProviderConfig(provider: string): Promise<ProviderConfig> {
  if (REQUEST_CACHE.has(provider)) return REQUEST_CACHE.get(provider) ?? null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("integrations")
      .select("config, enabled")
      .eq("provider", provider)
      .is("project_id", null)
      .maybeSingle();
    const row = (data ?? null) as { config: Record<string, string> | null; enabled: boolean } | null;
    const cfg = row && row.enabled !== false ? row.config ?? {} : null;
    REQUEST_CACHE.set(provider, cfg);
    return cfg;
  } catch {
    REQUEST_CACHE.set(provider, null);
    return null;
  }
}

function nonEmpty(s: string | undefined | null): string | null {
  return typeof s === "string" && s.trim().length > 0 ? s.trim() : null;
}

/** Apify — returns null when no creds anywhere. */
export async function getApifyCreds(): Promise<{ token: string; actorId: string } | null> {
  const cfg = await loadProviderConfig("apify");
  const token = nonEmpty(cfg?.api_token) ?? nonEmpty(env().APIFY_TOKEN);
  if (!token) return null;
  const actorId =
    nonEmpty(cfg?.actor_id) ??
    nonEmpty(env().APIFY_ACTOR_ID) ??
    "trovevault/keyword-opportunity-finder";
  return { token, actorId };
}

/** PageSpeed Insights — returns null when not configured. */
export async function getPagespeedKey(): Promise<string | null> {
  const cfg = await loadProviderConfig("pagespeed");
  return nonEmpty(cfg?.api_key) ?? nonEmpty(env().PAGESPEED_API_KEY);
}

/** Google service-account JSON (raw string, possibly base64). */
export async function getGoogleServiceAccountJson(): Promise<string | null> {
  const cfg = await loadProviderConfig("ga4");
  const fromGa4 = nonEmpty(cfg?.service_account_json);
  if (fromGa4) return fromGa4;
  const cfgGsc = await loadProviderConfig("gsc");
  const fromGsc = nonEmpty(cfgGsc?.service_account_json);
  if (fromGsc) return fromGsc;
  return nonEmpty(env().GOOGLE_SERVICE_ACCOUNT_JSON);
}

/** Per-request cache reset — exported for tests / hot paths that mutate state. */
export function __resetIntegrationCache() {
  REQUEST_CACHE.clear();
}
